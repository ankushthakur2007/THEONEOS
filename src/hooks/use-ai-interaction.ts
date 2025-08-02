import { useState, useCallback, useEffect } from 'react';
import { SupabaseClient, Session } from '@supabase/supabase-js';
import { toast } from 'sonner';

export interface ChatMessage {
  id?: string;
  role: 'user' | 'model';
  parts: { text: string }[];
  fileUrl?: string | null;
}

interface UseAIInteractionReturn {
  processUserInput: (text: string, file: File | null, fileUrl: string | null) => Promise<{ text: string }>;
  uploadFile: (file: File) => Promise<string>;
  isThinkingAI: boolean;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  isLoadingHistory: boolean;
}

const toBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => resolve((reader.result as string).split(',')[1]);
  reader.onerror = error => reject(error);
});

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
      .select('id, role, content, metadata')
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
        fileUrl: (msg.metadata as any)?.fileUrl || null,
      }));
      setMessages(formattedMessages);
    }
    setIsLoadingHistory(false);
  }, [session, supabase]);

  useEffect(() => {
    fetchMessages(conversationId);
  }, [session?.user?.id, conversationId, fetchMessages]);

  const uploadFile = useCallback(async (file: File): Promise<string> => {
    if (!session) {
      throw new Error("You must be logged in to upload files.");
    }
    const filePath = `${session.user.id}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from('fileuploads').upload(filePath, file);
    if (uploadError) {
      throw new Error(`Storage error: ${uploadError.message}`);
    }
    const { data: urlData } = supabase.storage.from('fileuploads').getPublicUrl(filePath);
    return urlData.publicUrl;
  }, [supabase, session]);

  const processUserInput = useCallback(async (text: string, file: File | null, fileUrl: string | null): Promise<{ text: string }> => {
    if (!session) {
        toast.error("You must be logged in to chat.");
        throw new Error("User not authenticated");
    }
    setIsThinkingAI(true);

    let fileData: string | null = null;
    let fileMimeType: string | null = null;

    if (file) {
      try {
        fileData = await toBase64(file);
        fileMimeType = file.type;
      } catch (error: any) {
        toast.error(`Failed to process file: ${error.message}`);
        setIsThinkingAI(false);
        throw error;
      }
    }

    const newUserMessage: ChatMessage = { role: 'user', parts: [{ text }], fileUrl };
    setMessages(prev => [...prev, newUserMessage, { role: 'model', parts: [{ text: '' }] }]);

    try {
      const response = await fetch(`https://myqjitezxfqxcoqmycgk.supabase.co/functions/v1/gemini-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ 
          prompt: text, 
          conversationId,
          file: fileData ? { data: fileData, mimeType: fileMimeType } : null,
          fileUrl,
        }),
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
  }, [supabase, session, conversationId, setConversationId, fetchMessages]);

  return {
    uploadFile,
    processUserInput,
    isThinkingAI,
    messages,
    setMessages,
    isLoadingHistory,
  };
}