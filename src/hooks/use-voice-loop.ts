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

  const startVoiceLoop = useCallback(() => {
    if (isLoadingHistory) {
      toast.info("Please wait, conversation history is loading.");
      return;
    }
    primeTTS();
    if (!isVoiceLoopActiveRef.current) {
      setIsVoiceLoopActive(true);
      isVoiceLoopActiveRef.current = true;
      runVoiceLoop();
    }
  }, [isLoadingHistory, primeTTS]);

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
    isListening: isRecordingUser, // Directly use the listening state from the hook for UI feedback
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
      // Always show the user what is being transcribed for better feedback.
      setCurrentInterimText(interimTranscript);
    }, []),
    useCallback((error) => {
      console.error("Continuous recognition error in VoiceLoop:", error);
      if (error.includes("not-allowed") || error.includes("Microphone access denied")) {
        toast.error("Microphone access denied. Please enable microphone permissions.");
        stopVoiceLoop(); // Only stop for critical permission errors
      } else if (error.includes("no-speech")) {
        console.log("Continuous Listener: No speech detected, recognition will restart.");
        // Do nothing, let the recognizer restart automatically
      } else {
        toast.error(`Voice input error: ${error}`);
        // Don't stop the loop for other recoverable errors
      }
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
    setCurrentInterimText('');
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
    resetAllFlags();
    toast.info("Voice loop stopped.");
  }, [getUserCommand, processUserInput, resetAllFlags, isLoadingHistory]);

  // This is a forward declaration for the useCallback dependency array.
  // The actual implementation is above.
  const dummyRunVoiceLoop = useCallback(() => {}, []); 
  useEffect(() => {
    if (startVoiceLoop) {
      // This is a bit of a hack to satisfy the dependency array,
      // because startVoiceLoop depends on runVoiceLoop, but runVoiceLoop is defined later.
      // The actual runVoiceLoop is in scope when startVoiceLoop is called.
    }
  }, [dummyRunVoiceLoop]);


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