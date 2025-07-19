import { useState, useRef, useCallback } from 'react';
import { toast } from 'sonner';

interface UseTextToSpeechReturn {
  speakAIResponse: (text: string) => Promise<null>;
  isSpeakingAI: boolean;
  aiResponseText: string;
  cancelSpeech: () => void;
}

export function useTextToSpeech(): UseTextToSpeechReturn {
  const [isSpeakingAI, setIsSpeakingAI] = useState(false);
  const [aiResponseText, setAiResponseText] = useState('');
  const speechTimeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const SPEECH_TIMEOUT_MS = 120000; // 2 minutes

  const cancelSpeech = useCallback(() => {
    if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      console.log("SpeechSynthesis: Canceled existing speech.");
    }
    if (speechTimeoutIdRef.current) {
      clearTimeout(speechTimeoutIdRef.current);
      speechTimeoutIdRef.current = null;
    }
  }, []);

  const speakWithWebSpeechAPI = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) {
      console.warn("Web Speech API: Not supported.");
      toast.error("Browser does not support Web Speech API for text-to-speech.");
      setIsSpeakingAI(false);
      setAiResponseText('');
      return;
    }

    const resetSpeechState = () => {
      setIsSpeakingAI(false);
      setAiResponseText('');
      if (speechTimeoutIdRef.current) {
        clearTimeout(speechTimeoutIdRef.current);
        speechTimeoutIdRef.current = null;
      }
    };

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.pitch = 1;
    utterance.rate = 1;
    utterance.volume = 1;

    utterance.onstart = () => {
      console.log("Web Speech API: Speech started.");
      setIsSpeakingAI(true);
      setAiResponseText(text);
      if (speechTimeoutIdRef.current) {
        clearTimeout(speechTimeoutIdRef.current);
      }
      speechTimeoutIdRef.current = setTimeout(() => {
        console.warn("Web Speech API: Speech timeout reached, forcing restart.");
        window.speechSynthesis.cancel();
        resetSpeechState();
      }, SPEECH_TIMEOUT_MS);
    };

    utterance.onend = () => {
      console.log("Web Speech API: Speech ended.");
      resetSpeechState();
    };

    utterance.onerror = (event) => {
      console.error('Web Speech API error:', event.error);
      toast.error("Browser speech synthesis failed.");
      resetSpeechState();
    };

    console.log("Web Speech API: Attempting to speak full text.");
    window.speechSynthesis.speak(utterance);
  }, []);

  const speakAIResponse = useCallback(async (aiText: string): Promise<null> => {
    speakWithWebSpeechAPI(aiText);
    return null; // Always returns null as there's no audio URL
  }, [speakWithWebSpeechAPI]);

  return {
    speakAIResponse,
    isSpeakingAI,
    aiResponseText,
    cancelSpeech,
  };
}