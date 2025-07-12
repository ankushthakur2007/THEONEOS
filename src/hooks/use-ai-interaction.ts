import { useState, useCallback } from 'react';
import { SupabaseClient, Session } from '@supabase/supabase-js';
import { toast } from 'sonner';

interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

interface UseAIInteractionReturn {
  processSpeech: (text: string) => Promise<void>;
  isThinkingAI: boolean;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}

const MAX_HISTORY_MESSAGES = 5;

export function useAIInteraction(
  supabase: SupabaseClient,
  session: Session | null,
  speakAIResponse: (text: string) => Promise<string | null>,
  onAIInteractionComplete: () => void,
  onAIInteractionError: () => void
): UseAIInteractionReturn {
  const [isThinkingAI, setIsThinkingAI] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const processSpeech = useCallback(async (text: string) => {
    setIsThinkingAI(true);

    const newUserMessage: ChatMessage = { role: 'user', parts: [{ text }] };
    setMessages(prevMessages => [...prevMessages, newUserMessage]);

    let aiText = '';
    let audioUrl: string | null = null;

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
        onAIInteractionError();
        return;
      }

      // Speak the AI response and get the audio URL if ElevenLabs was used
      audioUrl = await speakAIResponse(aiText);

      // Add AI message to local state after it's spoken (or attempted to speak)
      const newAIMessage: ChatMessage = { role: 'model', parts: [{ text: aiText }] };
      setMessages(prevMessages => [...prevMessages, newAIMessage]);

      // Save the new interaction to the database
      if (session?.user?.id) {
        const { error: dbError } = await supabase.from('interactions').insert({
          user_id: session.user.id,
          input_text: text,
          response_text: aiText,
          audio_url: audioUrl,
        });
        if (dbError) {
          console.error('Error saving interaction:', dbError.message);
          toast.error('Failed to save interaction history.');
        }
      }

      toast.success("AI response received!");
      onAIInteractionComplete();

    } catch (error: any) {
      console.error('Overall error in AI interaction:', error);
      toast.error(`Failed to get AI response: ${error.message}.`);
      setMessages(prevMessages => prevMessages.slice(0, -1)); // Remove optimistic user message on error
      onAIInteractionError();
    } finally {
      setIsThinkingAI(false);
    }
  }, [supabase, session, speakAIResponse, onAIInteractionComplete, onAIInteractionError]);

  return {
    processSpeech,
    isThinkingAI,
    messages,
    setMessages,
  };
}