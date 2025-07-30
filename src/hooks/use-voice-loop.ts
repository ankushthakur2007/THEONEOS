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
  currentInterimText: string;
  aiResponseText: string;
  isRecognitionReady: boolean;
  processUserInput: (text: string) => Promise<{ text: string; audioUrl: string | null }>;
  messages: ChatMessage[];
}

export function useVoiceLoop(supabase: SupabaseClient, session: Session | null): UseVoiceLoopReturn {
  const [isVoiceLoopActive, setIsVoiceLoopActive] = useState(false);
  const isVoiceLoopActiveRef = useRef(isVoiceLoopActive);

  const [isRecordingUser, setIsRecordingUser] = useState(false);
  const [currentInterimText, setCurrentInterimTranscript] = useState('');

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
  } = useAIInteraction(
    supabase,
    session,
    speakAIResponse,
  );

  const startVoiceLoop = useCallback(() => {
    primeTTS();
    if (!isVoiceLoopActiveRef.current) {
      setIsVoiceLoopActive(true);
      isVoiceLoopActiveRef.current = true;
      runVoiceLoop();
    }
  }, [primeTTS]);

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
    isListening: csrIsListening,
    currentInterimTranscript: csrCurrentInterimTranscript,
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
      if (isVoiceLoopActiveRef.current) {
        setCurrentInterimTranscript(interimTranscript);
      }
    }, []),
    useCallback((error) => {
      console.error("Continuous recognition error in VoiceLoop:", error);
      if (error.includes("not-allowed") || error.includes("Microphone access denied")) {
        toast.error("Microphone access denied. Please enable microphone permissions.");
      } else if (error.includes("no-speech")) {
        console.log("Continuous Listener: No speech detected, recognition continuing.");
      } else {
        toast.error(`Voice input error: ${error}`);
      }
      stopVoiceLoop();
    }, [stopVoiceLoop])
  );

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
    setIsRecordingUser(isVoiceLoopActive && csrIsListening);
  }, [isVoiceLoopActive, csrIsListening]);

  const getUserCommand = useCallback(async (): Promise<string> => {
    if (userCommandQueueRef.current.length > 0) {
      return userCommandQueueRef.current.shift()!;
    }
    return new Promise((resolve, reject) => {
      resolveUserCommandRef.current = resolve;
      rejectUserCommandRef.current = reject;
    });
  }, []);

  const resetAllFlags = useCallback(() => {
    setIsRecordingUser(false);
    setCurrentInterimTranscript('');
    csrResetTranscript();
  }, [csrResetTranscript]);

  const runVoiceLoop = useCallback(async () => {
    while (isVoiceLoopActiveRef.current) {
      resetAllFlags();

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
        if (error.message.includes("Speech recognition stopped by user command.")) {
          console.log("Listen phase stopped by user command.");
        } else {
          toast.error(`Listening error: ${error.message}`);
        }
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
    resetAllFlags();
    toast.info("Voice loop stopped.");
  }, [getUserCommand, processUserInput, resetAllFlags]);

  return {
    isVoiceLoopActive,
    startVoiceLoop,
    stopVoiceLoop,
    isRecordingUser,
    isSpeakingAI,
    isThinkingAI,
    currentInterimText: isVoiceLoopActive ? currentInterimText : csrCurrentInterimTranscript,
    aiResponseText,
    isRecognitionReady: csrIsReady,
    processUserInput,
    messages,
  };
}