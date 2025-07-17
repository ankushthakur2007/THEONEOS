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

const MAX_HISTORY_MESSAGES = 10; // Changed to 10 to store 5 full conversational turns (user + model)
const LOCAL_STORAGE_KEY = 'jarvis_chat_history'; // Key for localStorage

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

  // Load initial conversation history from localStorage or Supabase on component mount
  useEffect(() => {
    const loadHistory = async () => {
      if (!session?.user?.id || !isInitialLoad.current) return;

      let loadedFromLocalStorage = false;
      try {
        const storedHistory = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (storedHistory) {
          const parsedHistory: ChatMessage[] = JSON.parse(storedHistory);
          // Basic validation to ensure it's an array of objects with expected properties
          if (Array.isArray(parsedHistory) && parsedHistory.every(msg => 
            (msg.role === 'user' || msg.role === 'model') && 
            Array.isArray(msg.parts) && 
            msg.parts.every(part => typeof part.text === 'string')
          )) {
            setMessages(parsedHistory);
            loadedFromLocalStorage = true;
            console.log("Loaded chat history from localStorage.");
          } else {
            console.warn("Invalid chat history in localStorage, clearing.");
            localStorage.removeItem(LOCAL_STORAGE_KEY);
          }
        }
      } catch (e) {
        console.error("Error parsing localStorage history:", e);
        localStorage.removeItem(LOCAL_STORAGE_KEY); // Clear corrupted data
      }

      if (!loadedFromLocalStorage) {
        try {
          // Fetch up to MAX_HISTORY_MESSAGES / 2 *interactions* (each interaction is 2 messages)
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
            const loadedMessages: ChatMessage[] = pastInteractions.flatMap(interaction => [
              { role: 'user' as const, parts: [{ text: interaction.input_text }] },
              { role: 'model' as const, parts: [{ text: interaction.response_text }] },
            ]).reverse(); // Ensure chronological order for history

            setMessages(loadedMessages.slice(Math.max(loadedMessages.length - MAX_HISTORY_MESSAGES, 0)));
            console.log("Loaded chat history from Supabase.");
          }
        } finally {
          isInitialLoad.current = false;
        }
      } else {
        isInitialLoad.current = false; // Mark as loaded even if from localStorage
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
      const historyForGemini = messages; // Use the current state for history

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
        const slicedMessages = updatedMessages.slice(Math.max(updatedMessages.length - MAX_HISTORY_MESSAGES, 0));
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(slicedMessages)); // Save to localStorage
        return slicedMessages;
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
          toast.error('Failed to save interaction history to database.');
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