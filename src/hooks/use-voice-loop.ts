import { useState, useRef, useEffect, useCallback } from 'react';
import { SupabaseClient, Session } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { useContinuousSpeechRecognition } from './use-continuous-speech-recognition';
import { useTextToSpeech } from './use-text-to-speech';
import { useAIInteraction } from './use-ai-interaction';

interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

interface UseVoiceLoopReturn {
  isVoiceLoopActive: boolean;
  startVoiceLoop: () => void;
  stopVoiceLoop: () => void;
  isRecordingUser: boolean;
  isSpeakingAI: boolean;
  isThinkingAI: boolean;
  isLoadingHistory: boolean;
  currentInterimText: string;
  aiResponseText: string;
  isRecognitionReady: boolean;
  processUserInput: (text: string) => Promise<{ text: string; audioUrl: string | null }>;
  messages: ChatMessage[];
}

export function useVoiceLoop(supabase: SupabaseClient, session: Session | null): UseVoiceLoopReturn {
  const [isVoiceLoopActive, setIsVoiceLoopActive] = useState(false);
  const [startLoopAfterHistory, setStartLoopAfterHistory] = useState(false);
  const isVoiceLoopActiveRef = useRef(isVoiceLoopActive);

  const [currentInterimText, setCurrentInterimText] = useState('');

  const userCommandQueueRef = useRef<string[]>([]);
  const resolveUserCommandRef = useRef<((value: string) => void) | null>(null);
  const rejectUserCommandRef = useRef<((reason?: any) => void) | null>(null);

  const {
    speakAIResponse,
    isSpeakingAI,
    aiResponseText,
    cancelSpeech,
    prime: primeTTS,
  } = useTextToSpeech();

  const {
    processUserInput,
    isThinkingAI,
    messages,
    isLoadingHistory,
  } = useAIInteraction(
    supabase,
    session,
    speakAIResponse,
  );

  const runVoiceLoop = useCallback(async () => {
    while (isVoiceLoopActiveRef.current) {
      csrResetTranscript(); // Start each command with a clean slate.
      let userText = '';
      try {
        toast.info("Listening for your command...");
        userText = await getUserCommand();
        if (!userText) {
          console.warn("User command was empty, stopping loop.");
          break;
        }
      } catch (error: any) {
        console.warn("Listen phase failed with error:", error.message);
        if (!error.message.includes("Voice loop stopped.")) {
          toast.error(`Listening error: ${error.message}`);
        }
        break;
      }

      if (isLoadingHistory) {
        toast.error("Conversation history is still loading. Please wait a moment.");
        break;
      }

      try {
        const aiResponse = await processUserInput(userText);
        if (!aiResponse || !aiResponse.text) {
          throw new Error("AI returned an empty response.");
        }
      } catch (error: any) {
        console.error("Think phase failed:", error.message);
        break;
      }
    }
    setIsVoiceLoopActive(false);
    isVoiceLoopActiveRef.current = false;
    setCurrentInterimText('');
    toast.info("Voice loop stopped.");
  }, [processUserInput, isLoadingHistory]);

  const startVoiceLoop = useCallback(() => {
    if (isLoadingHistory) {
      toast.info("Just a moment, loading your conversation...");
      setStartLoopAfterHistory(true);
      return;
    }
    setStartLoopAfterHistory(false);
    primeTTS();
    if (!isVoiceLoopActiveRef.current) {
      setIsVoiceLoopActive(true);
      isVoiceLoopActiveRef.current = true;
      runVoiceLoop();
    }
  }, [isLoadingHistory, primeTTS, runVoiceLoop]);

  const stopVoiceLoop = useCallback(() => {
    if (isVoiceLoopActiveRef.current) {
      setIsVoiceLoopActive(false);
      isVoiceLoopActiveRef.current = false;
      cancelSpeech();
      if (rejectUserCommandRef.current) {
        rejectUserCommandRef.current(new Error("Voice loop stopped."));
        resolveUserCommandRef.current = null;
        rejectUserCommandRef.current = null;
      }
    }
  }, [cancelSpeech]);

  const {
    startListening: startContinuousListening,
    stopListening: stopContinuousListening,
    isListening: isRecordingUser,
    isReady: csrIsReady,
    resetTranscript: csrResetTranscript,
  } = useContinuousSpeechRecognition(
    useCallback((finalTranscript) => {
      const lowerTranscript = finalTranscript.toLowerCase();
      console.log("VoiceLoop - Received final transcript:", lowerTranscript);

      if (lowerTranscript.includes("jarvis stop")) {
        console.log("Stop command detected!");
        stopVoiceLoop();
        toast.info("Voice loop stopped by command.");
        if (rejectUserCommandRef.current) {
          rejectUserCommandRef.current(new Error("Speech recognition stopped by user command."));
          resolveUserCommandRef.current = null;
          rejectUserCommandRef.current = null;
        }
        return;
      }

      if (!isVoiceLoopActiveRef.current) {
        if (lowerTranscript.includes("jarvis")) {
          console.log("Wake word detected!");
          startVoiceLoop();
        }
      } else {
        if (resolveUserCommandRef.current) {
          resolveUserCommandRef.current(finalTranscript);
          resolveUserCommandRef.current = null;
          rejectUserCommandRef.current = null;
        } else {
          userCommandQueueRef.current.push(finalTranscript);
        }
      }
    }, [startVoiceLoop, stopVoiceLoop]),
    useCallback((interimTranscript) => {
      setCurrentInterimText(interimTranscript);
    }, []),
    useCallback((error) => {
      console.error("Continuous recognition error in VoiceLoop:", error);
      if (error.includes("not-allowed") || error.includes("Microphone access denied")) {
        toast.error("Microphone access denied. Please enable microphone permissions.");
        stopVoiceLoop();
      } else if (error.includes("no-speech")) {
        console.log("Continuous Listener: No speech detected, recognition will restart.");
      } else {
        toast.error(`Voice input error: ${error}`);
      }
    }, [stopVoiceLoop])
  );

  const getUserCommand = useCallback(async (): Promise<string> => {
    if (userCommandQueueRef.current.length > 0) {
      return userCommandQueueRef.current.shift()!;
    }
    return new Promise((resolve, reject) => {
      resolveUserCommandRef.current = resolve;
      rejectUserCommandRef.current = reject;
    });
  }, []);

  useEffect(() => {
    isVoiceLoopActiveRef.current = isVoiceLoopActive;
  }, [isVoiceLoopActive]);

  useEffect(() => {
    if (csrIsReady) {
      startContinuousListening();
    }
    return () => {
      stopContinuousListening();
    };
  }, [csrIsReady, startContinuousListening, stopContinuousListening]);

  useEffect(() => {
    if (!isLoadingHistory && startLoopAfterHistory) {
      startVoiceLoop();
    }
  }, [isLoadingHistory, startLoopAfterHistory, startVoiceLoop]);

  return {
    isVoiceLoopActive,
    startVoiceLoop,
    stopVoiceLoop,
    isRecordingUser,
    isSpeakingAI,
    isThinkingAI,
    isLoadingHistory,
    currentInterimText,
    aiResponseText,
    isRecognitionReady: csrIsReady,
    processUserInput,
    messages,
  };
}