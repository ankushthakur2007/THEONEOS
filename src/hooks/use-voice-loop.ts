import { useState, useRef, useEffect, useCallback } from 'react';
import { SupabaseClient, Session } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { useSpeechRecognition } from './use-speech-recognition';
import { useTextToSpeech } from './use-text-to-speech';
import { useAIInteraction } from './use-ai-interaction';

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
  audioRef: React.RefObject<HTMLAudioElement>;
}

export function useVoiceLoop(supabase: SupabaseClient, session: Session | null): UseVoiceLoopReturn {
  const [isVoiceLoopActive, setIsVoiceLoopActive] = useState(false);
  const isVoiceLoopActiveRef = useRef(isVoiceLoopActive); // For stable callbacks

  useEffect(() => {
    isVoiceLoopActiveRef.current = isVoiceLoopActive;
  }, [isVoiceLoopActive]);

  // Centralized error/completion handler for the loop
  const forceContinueLoop = useCallback(() => {
    if (isVoiceLoopActiveRef.current) {
      // This will trigger the main loop management useEffect to restart recognition
      // by ensuring all busy states are false.
      // No need to explicitly call startRecognition here, the useEffect will handle it.
      console.log("Force continue loop triggered.");
    }
  }, []);

  // Speech Recognition Hook
  const handleSpeechRecognitionFinalResult = useCallback((text: string) => {
    if (text) {
      processSpeech(text);
    } else {
      toast.info("No speech detected. Please check your microphone and speak clearly.");
      forceContinueLoop();
    }
  }, [forceContinueLoop]);

  const handleSpeechRecognitionError = useCallback((event: SpeechRecognitionErrorEvent) => {
    if (event.error === 'not-allowed') {
      toast.error("Microphone access denied. Please enable microphone permissions.");
      setIsVoiceLoopActive(false); // Critical error, stop loop
    } else {
      toast.info(`Speech recognition error: ${event.error}. Please check your microphone and speak clearly.`);
      forceContinueLoop();
    }
  }, [forceContinueLoop]);

  const handleSpeechRecognitionEnd = useCallback(() => {
    // This is handled by the onFinalResult callback in useSpeechRecognition
    // and the main useEffect for loop management.
    // No explicit action needed here other than what useSpeechRecognition already does.
  }, []);

  const {
    startRecognition,
    stopRecognition,
    isRecording: isRecordingUser,
    currentInterimText,
    finalTranscriptionRef,
    isRecognitionReady,
  } = useSpeechRecognition(
    handleSpeechRecognitionFinalResult,
    handleSpeechRecognitionError,
    handleSpeechRecognitionEnd
  );

  // Text-to-Speech Hook
  const handleSpeechEnd = useCallback(() => {
    // AI finished speaking, allow loop to continue
    forceContinueLoop();
  }, [forceContinueLoop]);

  const handleSpeechError = useCallback(() => {
    // AI speech failed, allow loop to continue
    forceContinueLoop();
  }, [forceContinueLoop]);

  const {
    speakAIResponse,
    isSpeakingAI,
    aiResponseText,
    audioRef,
    cancelSpeech,
  } = useTextToSpeech(supabase, handleSpeechEnd, handleSpeechError);

  // AI Interaction Hook
  const handleAIInteractionComplete = useCallback(() => {
    // AI interaction complete, speech has started/finished, allow loop to continue
    // The speech hook's onSpeechEnd will call forceContinueLoop
  }, []);

  const handleAIInteractionError = useCallback(() => {
    // AI interaction failed, allow loop to continue
    forceContinueLoop();
  }, [forceContinueLoop]);

  const {
    processSpeech,
    isThinkingAI,
    messages, // Expose messages if needed for display in Home.tsx
    setMessages, // Expose setMessages if needed for external control
  } = useAIInteraction(
    supabase,
    session,
    speakAIResponse,
    handleAIInteractionComplete,
    handleAIInteractionError
  );

  // Main Voice Loop Management Effect
  useEffect(() => {
    if (isVoiceLoopActive && isRecognitionReady && !isRecordingUser && !isSpeakingAI && !isThinkingAI) {
      console.log("Voice Loop: System idle, starting recognition.");
      startRecognition();
    } else if (!isVoiceLoopActive) {
      console.log("Voice Loop: Inactive, stopping all processes.");
      stopRecognition();
      cancelSpeech();
      // Clear any pending final transcription if loop is stopped mid-recognition
      finalTranscriptionRef.current = '';
    }
  }, [isVoiceLoopActive, isRecognitionReady, isRecordingUser, isSpeakingAI, isThinkingAI, startRecognition, stopRecognition, cancelSpeech, finalTranscriptionRef]);

  // Master Loop Watchdog
  useEffect(() => {
    const interval = setInterval(() => {
      if (
        isVoiceLoopActiveRef.current &&
        isRecognitionReady &&
        !isRecordingUser &&
        !isThinkingAI &&
        !isSpeakingAI
      ) {
        console.log("Watchdog: Restarting recognition loop.");
        startRecognition();
      }
    }, 8000); // check every 8 seconds

    return () => clearInterval(interval);
  }, [isRecognitionReady, isRecordingUser, isThinkingAI, isSpeakingAI, startRecognition]);

  const startVoiceLoop = useCallback(() => {
    if (!isVoiceLoopActive) {
      setIsVoiceLoopActive(true);
      toast.info("Voice loop started.");
    }
  }, [isVoiceLoopActive]);

  const stopVoiceLoop = useCallback(() => {
    if (isVoiceLoopActive) {
      setIsVoiceLoopActive(false);
      toast.info("Voice loop stopped.");
    }
  }, [isVoiceLoopActive]);

  return {
    isVoiceLoopActive,
    startVoiceLoop,
    stopVoiceLoop,
    isRecordingUser,
    isSpeakingAI,
    isThinkingAI,
    currentInterimText,
    aiResponseText,
    isRecognitionReady,
    audioRef,
  };
}