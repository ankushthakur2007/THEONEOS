import { useState, useCallback, useEffect } from 'react';
import { SupabaseClient, Session } from '@supabase/supabase-js';
import { toast } from 'sonner';

export interface ChatMessage {
  id?: string;
  role: 'user' | 'model';
  parts: { text: string }[];
}

interface UseAIInteractionReturn {
  processUserInput: (text: string) => Promise<{ text: string }>;
  isThinkingAI: boolean;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  isLoadingHistory: boolean;
}

export function useAIInteraction(
  supabase: SupabaseClient,
  session: Session | null,
  conversationId: string | null,
  setConversationId: (id: string | null) => void,
): UseAIInteractionReturn {
  const [isThinkingAI, setIsThinkingAI] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  const fetchMessages = useCallback(async (convId: string | null) => {
    if (!session?.user?.id || !convId) {
      setMessages([]);
      setIsLoadingHistory(false);
      return;
    }

    setIsLoadingHistory(true);
    const { data: messagesData, error: messagesError } = await supabase
      .from('messages')
      .select('id, role, content')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });
    
    if (messagesError) {
      console.error("Error fetching messages:", messagesError);
      toast.error("Could not load messages for the conversation.");
    } else if (messagesData) {
      const formattedMessages = messagesData.map(msg => ({
        id: msg.id,
        role: msg.role as 'user' | 'model',
        parts: [{ text: msg.content }],
      }));
      setMessages(formattedMessages);
    }
    setIsLoadingHistory(false);
  }, [session, supabase]);

  useEffect(() => {
    fetchMessages(conversationId);
  }, [session?.user?.id, conversationId, fetchMessages]);

  const processUserInput = useCallback(async (text: string): Promise<{ text: string }> => {
    if (!session) {
        toast.error("You must be logged in to chat.");
        throw new Error("User not authenticated");
    }
    setIsThinkingAI(true);

    const newUserMessage: ChatMessage = { role: 'user', parts: [{ text }] };
    setMessages(prev => [...prev, newUserMessage, { role: 'model', parts: [{ text: '' }] }]);

    try {
      const response = await fetch(`https://myqjitezxfqxcoqmycgk.supabase.co/functions/v1/gemini-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ prompt: text, conversationId }),
      });

      if (!response.ok || !response.body) {
        const errorData = await response.json().catch(() => ({ error: 'An unknown error occurred.' }));
        throw new Error(errorData.error || `Request failed with status ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";
      let clientSideMessages = [...messages, newUserMessage, { role: 'model', parts: [{ text: '' }] }];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        fullResponse += chunk;

        setMessages(prev => {
            const updatedMessages = [...prev];
            const lastMessage = updatedMessages[updatedMessages.length - 1];
            if (lastMessage && lastMessage.role === 'model') {
                lastMessage.parts[0].text += chunk;
            }
            return updatedMessages;
        });
      }

      const newConversationId = response.headers.get('X-Conversation-Id');
      if (newConversationId && !conversationId) {
        setConversationId(newConversationId);
      }
      
      // Refetch messages to get proper IDs from the database
      await fetchMessages(newConversationId || conversationId);

      return { text: fullResponse };

    } catch (error: any) {
      console.error('Overall error in AI interaction:', error);
      const errorMessage = `Failed to get AI response: ${error.message}.`;
      toast.error(errorMessage);
      
      const errorAiMessage: ChatMessage = { role: 'model', parts: [{ text: `Sorry, an error occurred: ${error.message}` }] };
      setMessages(prev => [...prev.slice(0, -1), errorAiMessage]);

      throw error;
    } finally {
      setIsThinkingAI(false);
    }
  }, [supabase, session, conversationId, setConversationId, messages, fetchMessages]);

  return {
    processUserInput,
    isThinkingAI,
    messages,
    setMessages,
    isLoadingHistory,
  };
}