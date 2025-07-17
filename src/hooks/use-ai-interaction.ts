import { useState, useCallback, useEffect, useRef } from 'react';
import { SupabaseClient, Session } from '@supabase/supabase-js';
import { toast } from 'sonner';

interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

interface UseAIInteractionReturn {
  processSpeech: (text: string) => Promise<{ text: string; audioUrl: string | null }>;
  isThinkingAI: boolean;
  isSearchingAI: boolean;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}

const MAX_HISTORY_MESSAGES = 5; // This means 5 ChatMessage objects (e.g., 2 user, 3 model or vice versa)

// Function to run search using the Supabase Edge Function for Serper.dev
async function runSearchTool(supabase: SupabaseClient, query: string): Promise<string> {
  console.log("Attempting search for query via Serper Edge Function:", query);
  try {
    const { data, error } = await supabase.functions.invoke('searchWithSerper', {
      body: { query },
    });

    if (error) {
      console.error('Serper Edge Function error:', error.message);
      throw new Error(`Search failed: ${error.message}`);
    }

    if (!data || typeof data.result !== 'string') {
      console.warn('Serper Edge Function returned invalid data:', data);
      return "I couldn't find anything helpful online.";
    }

    console.log("Serper.dev search result:", data.result);
    return data.result;
  } catch (e: any) {
    console.error("Search tool invocation error:", e);
    return "I had trouble accessing the internet.";
  }
}

export function useAIInteraction(
  supabase: SupabaseClient,
  session: Session | null,
  speakAIResponse: (text: string) => Promise<string | null>,
): UseAIInteractionReturn {
  const [isThinkingAI, setIsThinkingAI] = useState(false);
  const [isSearchingAI, setIsSearchingAI] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const isInitialLoad = useRef(true);

  // Load initial conversation history from Supabase on component mount
  useEffect(() => {
    const loadHistory = async () => {
      if (!session?.user?.id || !isInitialLoad.current) return;

      try {
        // Fetch up to MAX_HISTORY_MESSAGES / 2 *interactions* (each interaction is 2 messages)
        // This ensures we don't fetch more than needed and keep the total ChatMessage count within limit.
        const { data: pastInteractions, error: fetchError } = await supabase
          .from('interactions')
          .select('input_text, response_text')
          .eq('user_id', session.user.id)
          .order('timestamp', { ascending: false }) // Get most recent first
          .limit(Math.ceil(MAX_HISTORY_MESSAGES / 2)); // Ensure we get enough pairs

        if (fetchError) {
          console.error('Error fetching past interactions:', fetchError.message);
          toast.error('Failed to load conversation history.');
        } else if (pastInteractions) {
          // Convert fetched interactions into ChatMessage format and reverse to be chronological
          const loadedMessages: ChatMessage[] = pastInteractions.flatMap(interaction => [
            { role: 'user' as const, parts: [{ text: interaction.input_text }] },
            { role: 'model' as const, parts: [{ text: interaction.response_text }] },
          ]).reverse(); // Ensure chronological order for history

          // Slice to ensure it doesn't exceed MAX_HISTORY_MESSAGES if, for example, MAX_HISTORY_MESSAGES is odd
          setMessages(loadedMessages.slice(Math.max(loadedMessages.length - MAX_HISTORY_MESSAGES, 0)));
        }
      } finally {
        isInitialLoad.current = false;
      }
    };

    loadHistory();
  }, [session?.user?.id, supabase]);

  const processSpeech = useCallback(async (text: string): Promise<{ text: string; audioUrl: string | null }> => {
    setIsThinkingAI(true);

    const newUserMessage: ChatMessage = { role: 'user', parts: [{ text }] };
    let aiText = '';
    let audioUrl: string | null = null;
    let finalSpokenText = '';

    try {
      // The `messages` state here contains the history of *completed* turns.
      // This is the `history` that should be passed to `startChat`.
      const historyForGemini = messages;

      // First call to Gemini
      const geminiResponse = await supabase.functions.invoke('gemini-chat', {
        body: { prompt: text, history: historyForGemini },
      });

      if (geminiResponse.error) {
        throw new Error(geminiResponse.error.message);
      }
      aiText = geminiResponse.data.text;

      if (!aiText) {
        toast.info("AI returned an empty response.");
        throw new Error("AI returned an empty response.");
      }

      let isToolCall = false;
      let cleanedAiText = aiText;

      const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/;
      const match = aiText.match(jsonBlockRegex);

      if (match && match[1]) {
        cleanedAiText = match[1];
        console.log("Extracted JSON from markdown block.");
      } else {
        console.log("No JSON markdown block found, attempting to parse as-is.");
      }

      try {
        const parsed = JSON.parse(cleanedAiText);
        if (parsed.tool === "www.go.io" && parsed.params && parsed.params.query) {
          isToolCall = true;
          toast.info("searching for youuuu babu");
          setIsSearchingAI(true);

          const searchQuery = parsed.params.query;
          const searchResult = await runSearchTool(supabase, searchQuery);

          setIsSearchingAI(false);

          // Second call to Gemini to summarize the search result
          // History for summarization includes previous turns, current user message, and AI's tool call response.
          const historyForSummarization = [
            ...historyForGemini, // Previous completed turns
            newUserMessage, // The current user's prompt
            { role: 'model' as const, parts: [{ text: aiText }] }, // The AI's tool call response
          ];

          const summarizePromptText = `Summarize this for voice: ${searchResult}`;

          const summaryResponse = await supabase.functions.invoke('gemini-chat', {
            body: { prompt: summarizePromptText, history: historyForSummarization },
          });

          if (summaryResponse.error) {
            console.error('Error summarizing search result:', summaryResponse.error.message);
            finalSpokenText = "I found some information, but I had trouble summarizing it.";
          } else {
            finalSpokenText = summaryResponse.data.text;
          }
        }
      } catch (parseError) {
        console.log("Gemini response was not a tool call JSON, treating as direct text.");
        isToolCall = false;
      } finally {
        setIsSearchingAI(false);
      }

      if (!isToolCall) {
        finalSpokenText = aiText;
      }

      // Speak the final determined text
      audioUrl = await speakAIResponse(finalSpokenText);

      // Add both user and AI messages to local state *after* successful interaction
      setMessages(prevMessages => {
        const updatedMessages = [...prevMessages, newUserMessage, { role: 'model' as const, parts: [{ text: finalSpokenText }] }];
        // Keep history limited to MAX_HISTORY_MESSAGES
        return updatedMessages.slice(Math.max(updatedMessages.length - MAX_HISTORY_MESSAGES, 0));
      });

      toast.success("AI response received!");

      // Save the new interaction to the database
      if (session?.user?.id) {
        const { error: dbError } = await supabase.from('interactions').insert({
          user_id: session.user.id,
          input_text: text,
          response_text: finalSpokenText,
          audio_url: audioUrl,
        });
        if (dbError) {
          console.error('Error saving interaction:', dbError.message);
          toast.error('Failed to save interaction history.');
        }
      }

      return { text: finalSpokenText, audioUrl };

    } catch (error: any) {
      console.error('Overall error in AI interaction:', error);
      toast.error(`Failed to get AI response: ${error.message}.`);
      throw error;
    } finally {
      setIsThinkingAI(false);
    }
  }, [supabase, session, speakAIResponse, messages]); // `messages` is a dependency now

  return {
    processSpeech,
    isThinkingAI,
    isSearchingAI,
    messages,
    setMessages,
  };
}