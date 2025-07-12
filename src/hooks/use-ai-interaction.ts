import { useState, useCallback } from 'react';
import { SupabaseClient, Session } from '@supabase/supabase-js';
import { toast } from 'sonner';

interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

interface UseAIInteractionReturn {
  processSpeech: (text: string) => Promise<{ text: string; audioUrl: string | null }>;
  isThinkingAI: boolean;
  isSearchingAI: boolean; // New state
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}

const MAX_HISTORY_MESSAGES = 5;

// Function to run DuckDuckGo search
async function runSearchTool(query: string): Promise<string> {
  console.log("Attempting search for query:", query); // Log the query
  try {
    const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`);
    const json = await res.json();
    console.log("DuckDuckGo API response:", json); // Log the full JSON response

    return (
      json.Answer ||
      json.Abstract ||
      json.Definition ||
      json.RelatedTopics?.[0]?.Text ||
      `I couldn't find a direct answer for "${query}" online.` // More specific fallback
    );
  } catch (e) {
    console.error("Search error:", e);
    return "I had trouble accessing the internet.";
  }
}

export function useAIInteraction(
  supabase: SupabaseClient,
  session: Session | null,
  speakAIResponse: (text: string) => Promise<string | null>,
): UseAIInteractionReturn {
  const [isThinkingAI, setIsThinkingAI] = useState(false);
  const [isSearchingAI, setIsSearchingAI] = useState(false); // Initialize new state
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const processSpeech = useCallback(async (text: string): Promise<{ text: string; audioUrl: string | null }> => {
    setIsThinkingAI(true); // General thinking starts

    const newUserMessage: ChatMessage = { role: 'user', parts: [{ text }] };
    setMessages(prevMessages => [...prevMessages, newUserMessage]);

    let aiText = '';
    let audioUrl: string | null = null;
    let finalSpokenText = ''; // The text that will actually be spoken

    try {
      let conversationHistory: ChatMessage[] = [];

      if (session?.user?.id) {
        const { data: pastInteractions, error: fetchError } = await supabase
          .from('interactions')
          .select('input_text, response_text')
          .eq('user_id', session.user.id)
          .order('timestamp', { ascending: true })
          .limit(MAX_HISTORY_MESSAGES);

        if (fetchError) {
          console.error('Error fetching past interactions:', fetchError.message);
          toast.error('Failed to load conversation history.');
        } else if (pastInteractions) {
          conversationHistory = pastInteractions.flatMap(interaction => [
            { role: 'user', parts: [{ text: interaction.input_text }] },
            { role: 'model', parts: [{ text: interaction.response_text }] },
          ]);
        }
      }

      const fullHistoryForAI = [...conversationHistory, newUserMessage];

      // First call to Gemini
      const geminiResponse = await supabase.functions.invoke('gemini-chat', {
        body: { prompt: text, history: fullHistoryForAI },
      });

      if (geminiResponse.error) {
        setMessages(prevMessages => prevMessages.slice(0, -1)); // Remove optimistic user message on error
        throw new Error(geminiResponse.error.message);
      }
      aiText = geminiResponse.data.text;

      if (!aiText) {
        toast.info("AI returned an empty response.");
        setMessages(prevMessages => prevMessages.slice(0, -1)); // Remove optimistic user message
        throw new Error("AI returned an empty response.");
      }

      let isToolCall = false;
      let cleanedAiText = aiText;

      // Check if the AI response is a JSON markdown block and extract the content
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
          toast.info("Searching the internet...");
          setIsSearchingAI(true); // Set searching state to true
          const searchQuery = parsed.params.query;
          const searchResult = await runSearchTool(searchQuery);
          setIsSearchingAI(false); // Set searching state to false after search completes

          // Second call to Gemini to summarize the search result
          const summarizePromptText = `Summarize this for voice: ${searchResult}`;
          const historyForSummarization = [
            ...fullHistoryForAI,
            { role: 'model', parts: [{ text: aiText }] }, // Include the tool call in history for context
            { role: 'user', parts: [{ text: summarizePromptText }] } // The prompt for summarization
          ];

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
        // Not a JSON tool call, or malformed JSON, treat as direct text
        console.log("Gemini response was not a tool call JSON, treating as direct text.");
        isToolCall = false; // Ensure this is false if parsing fails
      } finally {
        setIsSearchingAI(false); // Ensure searching state is reset even if parsing fails
      }

      if (!isToolCall) {
        finalSpokenText = aiText; // If not a tool call, the original AI text is the final spoken text
      }

      // Speak the final determined text
      audioUrl = await speakAIResponse(finalSpokenText);

      // Add AI message to local state after it's spoken
      const newAIMessage: ChatMessage = { role: 'model', parts: [{ text: finalSpokenText }] };
      setMessages(prevMessages => [...prevMessages, newAIMessage]);

      // Save the new interaction to the database
      if (session?.user?.id) {
        const { error: dbError } = await supabase.from('interactions').insert({
          user_id: session.user.id,
          input_text: text,
          response_text: finalSpokenText, // Save the final spoken text
          audio_url: audioUrl,
        });
        if (dbError) {
          console.error('Error saving interaction:', dbError.message);
          toast.error('Failed to save interaction history.');
        }
      }

      toast.success("AI response received!");
      return { text: finalSpokenText, audioUrl }; // Return the AI text and audio URL

    } catch (error: any) {
      console.error('Overall error in AI interaction:', error);
      toast.error(`Failed to get AI response: ${error.message}.`);
      setMessages(prevMessages => prevMessages.slice(0, -1)); // Remove optimistic user message on error
      throw error; // Re-throw error for runVoiceLoop to catch
    } finally {
      setIsThinkingAI(false); // General thinking ends
    }
  }, [supabase, session, speakAIResponse]);

  return {
    processSpeech,
    isThinkingAI,
    isSearchingAI, // Return new state
    messages,
    setMessages,
  };
}