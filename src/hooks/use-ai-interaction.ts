import { useState, useCallback, useEffect } from 'react';
import { SupabaseClient, Session } from '@supabase/supabase-js';
import { toast } from 'sonner';

interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

interface ProcessUserInputOptions {
  speak?: boolean;
}

interface UseAIInteractionReturn {
  processUserInput: (text: string, options?: ProcessUserInputOptions) => Promise<{ text: string; audioUrl: string | null }>;
  isThinkingAI: boolean;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  isLoadingHistory: boolean;
}

export function useAIInteraction(
  supabase: SupabaseClient,
  session: Session | null,
  speakAIResponse: (text: string) => Promise<string | null>,
  conversationId: string | null,
  setConversationId: (id: string | null) => void,
): UseAIInteractionReturn {
  const [isThinkingAI, setIsThinkingAI] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  useEffect(() => {
    if (!session?.user?.id) {
      setIsLoadingHistory(false);
      setMessages([]);
      return;
    }

    const fetchMessages = async () => {
      if (!conversationId) {
        setMessages([]);
        setIsLoadingHistory(false);
        return;
      }

      setIsLoadingHistory(true);
      const { data: messagesData, error: messagesError } = await supabase
        .from('messages')
        .select('role, content')
        .eq('conversation_id', conversationId)
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
      setIsLoadingHistory(false);
    };

    fetchMessages();
  }, [session?.user?.id, supabase, conversationId]);

  const processUserInput = useCallback(async (text: string, options: ProcessUserInputOptions = { speak: false }): Promise<{ text: string; audioUrl: string | null }> => {
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

      let audioUrl: string | null = null;
      if (options.speak) {
        audioUrl = await speakAIResponse(fullResponse);
      }

      return { text: fullResponse, audioUrl };

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
  }, [supabase, session, speakAIResponse, conversationId, setConversationId]);

  return {
    processUserInput,
    isThinkingAI,
    messages,
    setMessages,
    isLoadingHistory,
  };
}