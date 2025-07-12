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
  const isVoiceLoopActiveRef = useRef(isVoiceLoopActive);

  const [isRecordingUser, setIsRecordingUser] = useState(false);
  const [isThinkingAI, setIsThinkingAI] = useState(false);
  const [currentInterimText, setCurrentInterimText] = useState('');

  // Keep the ref in sync with the state for external checks, but for internal loop control,
  // we'll update the ref directly in start/stop functions.
  useEffect(() => {
    isVoiceLoopActiveRef.current = isVoiceLoopActive;
  }, [isVoiceLoopActive]);

  const {
    listen,
    stopRecognition: srStopRecognition,
    isRecording: srIsRecording,
    currentInterimText: srCurrentInterimText,
    isRecognitionReady,
  } = useSpeechRecognition();

  useEffect(() => {
    setIsRecordingUser(srIsRecording);
  }, [srIsRecording]);

  useEffect(() => {
    setCurrentInterimText(srCurrentInterimText);
  }, [srCurrentInterimText]);

  const {
    speakAIResponse,
    isSpeakingAI, // Consume isSpeakingAI from useTextToSpeech
    aiResponseText, // Consume aiResponseText from useTextToSpeech
    audioRef,
    cancelSpeech,
  } = useTextToSpeech(supabase);

  const {
    processSpeech,
  } = useAIInteraction(
    supabase,
    session,
    speakAIResponse,
  );

  // Modified resetAllFlags to only reset state, not stop underlying APIs
  const resetAllFlags = useCallback(() => {
    setIsRecordingUser(false);
    setIsThinkingAI(false);
    setCurrentInterimText('');
    // isSpeakingAI and aiResponseText are managed by useTextToSpeech
  }, []);

  const runVoiceLoop = useCallback(async () => {
    while (isVoiceLoopActiveRef.current) {
      resetAllFlags(); // Only resets state variables now

      let userText = '';
      try {
        userText = await listen();
      } catch (error: any) {
        console.warn("Listen phase failed with error:", error.message);
        if (error.message === "No speech detected.") {
          toast.info("No speech detected. Returning to idle mode.");
          setIsVoiceLoopActive(false); // Stop the loop
          isVoiceLoopActiveRef.current = false; // Update ref
          return; // Exit runVoiceLoop, effectively stopping the loop
        } else if (error.message.includes("not-allowed") || error.message.includes("Microphone access denied")) {
          toast.error("Microphone access denied. Please enable microphone permissions.");
          setIsVoiceLoopActive(false);
          isVoiceLoopActiveRef.current = false;
          return; // Exit the loop entirely
        } else if (error.message.includes("Speech recognition stopped by user.")) {
          console.log("Listen phase stopped by user.");
          break; // Exit the loop gracefully
        }
        else {
          toast.error(`Listening error: ${error.message}`);
          // For other errors, also stop the loop to prevent continuous issues
          setIsVoiceLoopActive(false);
          isVoiceLoopActiveRef.current = false;
          return;
        }
      }

      let aiResponse: { text: string; audioUrl: string | null } | null = null;
      try {
        setIsThinkingAI(true);
        // processSpeech now handles calling speakAIResponse internally
        aiResponse = await processSpeech(userText);
      } catch (error: any) {
        console.error("Think phase failed:", error.message);
        toast.error(`AI thinking error: ${error.message}`);
        setIsThinkingAI(false);
        // If AI thinking fails, stop the loop and return to idle
        setIsVoiceLoopActive(false);
        isVoiceLoopActiveRef.current = false;
        return;
      }

      setIsThinkingAI(false);

      // The audio playback is now handled entirely within processSpeech (which calls speakAIResponse).
      // We just need to wait for the speaking to finish before continuing the loop.
      // The `isSpeakingAI` state from `useTextToSpeech` will correctly reflect this.
      // We don't need to explicitly await a new Promise here for audio playback.
      // The loop will naturally continue once the `isSpeakingAI` state becomes false.

      // If AI response text was empty, stop the loop
      if (!aiResponse || !aiResponse.text) {
        console.warn("AI response text was empty, skipping speak phase. Returning to idle mode.");
        setIsVoiceLoopActive(false);
        isVoiceLoopActiveRef.current = false;
        return;
      }
      
      // Wait for AI to finish speaking before looping again
      // This is implicitly handled by the next iteration of the while loop
      // as `isSpeakingAI` will be true until the audio finishes.
      // The `resetAllFlags` at the start of the next loop iteration will clear states.
    }
    resetAllFlags(); // Final reset when loop truly stops
    toast.info("Voice loop stopped.");
  }, [listen, processSpeech, resetAllFlags]);

  const startVoiceLoop = useCallback(() => {
    if (!isVoiceLoopActiveRef.current) { // Check the ref directly
      setIsVoiceLoopActive(true);
      isVoiceLoopActiveRef.current = true; // Explicitly set the ref to true immediately
      runVoiceLoop();
    }
  }, [runVoiceLoop]);

  const stopVoiceLoop = useCallback(() => {
    if (isVoiceLoopActiveRef.current) { // Check the ref directly
      setIsVoiceLoopActive(false);
      isVoiceLoopActiveRef.current = false; // Explicitly set the ref to false immediately
      srStopRecognition(); // Stop recognition when user explicitly stops
      cancelSpeech(); // Cancel speech when user explicitly stops
    }
  }, [srStopRecognition, cancelSpeech]);

  return {
    isVoiceLoopActive,
    startVoiceLoop,
    stopVoiceLoop,
    isRecordingUser,
    isSpeakingAI, // Return from useTextToSpeech
    isThinkingAI,
    currentInterimText,
    aiResponseText, // Return from useTextToSpeech
    isRecognitionReady,
    audioRef,
  };
}