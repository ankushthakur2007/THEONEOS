import { useState, useCallback, useEffect, useRef } from 'react';
import { SupabaseClient, Session } from '@supabase/supabase-js';
import { toast } from 'sonner';

interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

interface UseAIInteractionReturn {
  processUserInput: (text: string) => Promise<{ text: string; audioUrl: string | null }>;
  isThinkingAI: boolean;
  isSearchingAI: boolean;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}

const MAX_HISTORY_MESSAGES = 10;
const LOCAL_STORAGE_KEY = 'jarvis_chat_history';

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
  const messagesRef = useRef<ChatMessage[]>([]);
  const isInitialLoad = useRef(true);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    const loadHistory = async () => {
      if (!session?.user?.id || !isInitialLoad.current) return;

      let loadedFromLocalStorage = false;
      try {
        const storedHistory = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (storedHistory) {
          const parsedHistory: ChatMessage[] = JSON.parse(storedHistory);
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
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      }

      if (!loadedFromLocalStorage) {
        try {
          const { data: pastInteractions, error: fetchError } = await supabase
            .from('interactions')
            .select('input_text, response_text')
            .eq('user_id', session.user.id)
            .order('timestamp', { ascending: false })
            .limit(Math.ceil(MAX_HISTORY_MESSAGES / 2));

          if (fetchError) {
            console.error('Error fetching past interactions:', fetchError.message);
            toast.error('Failed to load conversation history.');
          } else if (pastInteractions) {
            const loadedMessages: ChatMessage[] = pastInteractions.flatMap(interaction => [
              { role: 'user' as const, parts: [{ text: interaction.input_text }] },
              { role: 'model' as const, parts: [{ text: interaction.response_text }] },
            ]).reverse();

            setMessages(loadedMessages.slice(Math.max(loadedMessages.length - MAX_HISTORY_MESSAGES, 0)));
            console.log("Loaded chat history from Supabase.");
          }
        } finally {
          isInitialLoad.current = false;
        }
      } else {
        isInitialLoad.current = false;
      }
    };

    loadHistory();
  }, [session?.user?.id, supabase]);

  const processUserInput = useCallback(async (text: string): Promise<{ text: string; audioUrl: string | null }> => {
    setIsThinkingAI(true);
    setIsSearchingAI(false);

    const historyForGemini = [...messagesRef.current];
    const newUserMessage: ChatMessage = { role: 'user', parts: [{ text }] };

    let finalSpokenText = '';
    let audioUrl: string | null = null;

    try {
      const geminiResponse = await supabase.functions.invoke('gemini-chat', {
        body: { prompt: text, history: historyForGemini },
      });

      if (geminiResponse.error) throw new Error(geminiResponse.error.message);
      let aiText = geminiResponse.data.text;
      if (!aiText) throw new Error("AI returned an empty response.");

      finalSpokenText = aiText;

      const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/;
      const match = aiText.match(jsonBlockRegex);
      const cleanedAiText = match ? match[1] : aiText;

      try {
        const parsed = JSON.parse(cleanedAiText);
        if (parsed.tool === "www.go.io" && parsed.params?.query) {
          toast.info("Searching the web...");
          setIsSearchingAI(true);

          const searchResult = await runSearchTool(supabase, parsed.params.query);
          
          const historyForSummarization = [
            ...historyForGemini,
            newUserMessage,
            { role: 'model' as const, parts: [{ text: aiText }] },
          ];
          const summarizePromptText = `Summarize this for voice: ${searchResult}`;

          const summaryResponse = await supabase.functions.invoke('gemini-chat', {
            body: { prompt: summarizePromptText, history: historyForSummarization },
          });

          if (summaryResponse.error || !summaryResponse.data?.text) {
            toast.warn("AI couldn't summarize the search result. Reading it directly.");
            finalSpokenText = searchResult;
          } else {
            finalSpokenText = summaryResponse.data.text;
          }
        }
      } catch (e) {
        // Not a JSON tool call, do nothing
      }

      audioUrl = await speakAIResponse(finalSpokenText);

      const newAiMessage: ChatMessage = { role: 'model', parts: [{ text: finalSpokenText }] };
      const newMessages = [...historyForGemini, newUserMessage, newAiMessage];
      
      const slicedMessages = newMessages.slice(Math.max(newMessages.length - MAX_HISTORY_MESSAGES, 0));
      setMessages(slicedMessages);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(slicedMessages));

      if (session?.user?.id) {
        await supabase.from('interactions').insert({
          user_id: session.user.id,
          input_text: text,
          response_text: finalSpokenText,
        });
      }

      return { text: finalSpokenText, audioUrl };

    } catch (error: any) {
      console.error('Overall error in AI interaction:', error);
      const errorMessage = `Failed to get AI response: ${error.message}.`;
      toast.error(errorMessage);
      
      const errorAiMessage: ChatMessage = { role: 'model', parts: [{ text: `Sorry, an error occurred: ${error.message}` }] };
      const newMessages = [...historyForGemini, newUserMessage, errorAiMessage];
      setMessages(newMessages.slice(Math.max(newMessages.length - MAX_HISTORY_MESSAGES, 0)));

      throw error;
    } finally {
      setIsThinkingAI(false);
      setIsSearchingAI(false);
    }
  }, [supabase, session, speakAIResponse]);

  return {
    processUserInput,
    isThinkingAI,
    isSearchingAI,
    messages,
    setMessages,
  };
}