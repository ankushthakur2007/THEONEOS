import { useState, useCallback, useEffect } from 'react';
import { SupabaseClient, Session } from '@supabase/supabase-js';
import { toast } from 'sonner';

interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

interface UseAIInteractionReturn {
  processUserInput: (text: string) => Promise<{ text: string; audioUrl: string | null }>;
  isThinkingAI: boolean;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  isLoadingHistory: boolean;
}

export function useAIInteraction(
  supabase: SupabaseClient,
  session: Session | null,
  speakAIResponse: (text: string) => Promise<string | null>,
): UseAIInteractionReturn {
  const [isThinkingAI, setIsThinkingAI] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  useEffect(() => {
    if (!session?.user?.id) {
      setIsLoadingHistory(false);
      setMessages([]);
      setConversationId(null);
      return;
    }

    const fetchInitialData = async () => {
      setIsLoadingHistory(true);
      const { data: convData, error: convError } = await supabase
        .from('conversations')
        .select('id')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (convError && convError.code !== 'PGRST116') {
        console.error("Error fetching conversation:", convError);
        toast.error("Could not load conversation history.");
        setIsLoadingHistory(false);
        return;
      }

      if (convData) {
        setConversationId(convData.id);
        const { data: messagesData, error: messagesError } = await supabase
          .from('messages')
          .select('role, content')
          .eq('conversation_id', convData.id)
          .order('created_at', { ascending: true });
        
        if (messagesError) {
          console.error("Error fetching messages:", messagesError);
          toast.error("Could not load messages for the conversation.");
        } else if (messagesData) {
          const formattedMessages = messagesData.map(msg => ({
            role: msg.role as 'user' | 'model',
            parts: [{ text: msg.content }],
          }));
          setMessages(formattedMessages);
        }
      } else {
        setMessages([]);
        setConversationId(null);
      }
      setIsLoadingHistory(false);
    };

    fetchInitialData();
  }, [session?.user?.id, supabase]);

  const processUserInput = useCallback(async (text: string): Promise<{ text: string; audioUrl: string | null }> => {
    if (isLoadingHistory) {
      const errorMessage = "Conversation history is still loading. Please wait a moment.";
      toast.error(errorMessage);
      throw new Error(errorMessage);
    }
    
    setIsThinkingAI(true);

    const newUserMessage: ChatMessage = { role: 'user', parts: [{ text }] };
    setMessages(prev => [...prev, newUserMessage]);

    let audioUrl: string | null = null;

    try {
      const { data, error } = await supabase.functions.invoke('gemini-chat', {
        body: { prompt: text, conversationId },
      });

      if (error) throw new Error(error.message);
      if (!data.text) throw new Error("AI returned an empty response.");

      const aiText = data.text;
      audioUrl = await speakAIResponse(aiText);

      const newAiMessage: ChatMessage = { role: 'model', parts: [{ text: aiText }] };
      setMessages(prev => [...prev, newAiMessage]);

      if (data.conversationId && !conversationId) {
        setConversationId(data.conversationId);
      }

      return { text: aiText, audioUrl };

    } catch (error: any) {
      console.error('Overall error in AI interaction:', error);
      const errorMessage = `Failed to get AI response: ${error.message}.`;
      toast.error(errorMessage);
      
      const errorAiMessage: ChatMessage = { role: 'model', parts: [{ text: `Sorry, an error occurred: ${error.message}` }] };
      setMessages(prev => [...prev, errorAiMessage]);

      throw error;
    } finally {
      setIsThinkingAI(false);
    }
  }, [supabase, speakAIResponse, conversationId, isLoadingHistory]);

  return {
    processUserInput,
    isThinkingAI,
    messages,
    setMessages,
    isLoadingHistory,
  };
}