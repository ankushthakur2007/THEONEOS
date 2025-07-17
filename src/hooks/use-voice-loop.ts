import { useState, useRef, useEffect, useCallback } from 'react';
import { SupabaseClient, Session } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { useContinuousSpeechRecognition } from './use-continuous-speech-recognition'; // New import
import { useTextToSpeech } from './use-text-to-speech';
import { useAIInteraction } from './use-ai-interaction';

interface UseVoiceLoopReturn {
  isVoiceLoopActive: boolean;
  startVoiceLoop: () => void;
  stopVoiceLoop: () => void;
  isRecordingUser: boolean;
  isSpeakingAI: boolean;
  isThinkingAI: boolean;
  isSearchingAI: boolean; // New state
  currentInterimText: string;
  aiResponseText: string;
  isRecognitionReady: boolean;
  audioRef: React.RefObject<HTMLAudioElement>;
}

export function useVoiceLoop(supabase: SupabaseClient, session: Session | null): UseVoiceLoopReturn {
  const [isVoiceLoopActive, setIsVoiceLoopActive] = useState(false);
  const isVoiceLoopActiveRef = useRef(isVoiceLoopActive); // To ensure latest state in async ops

  const [isRecordingUser, setIsRecordingUser] = useState(false);
  // isThinkingAI and isSearchingAI will now come from useAIInteraction
  const [currentInterimText, setCurrentInterimTranscript] = useState('');

  // Queue for user commands received from continuous listener
  const userCommandQueueRef = useRef<string[]>([]);
  const resolveUserCommandRef = useRef<((value: string) => void) | null>(null);
  const rejectUserCommandRef = useRef<((reason?: any) => void) | null>(null);

  // Keep the ref in sync with the state
  useEffect(() => {
    isVoiceLoopActiveRef.current = isVoiceLoopActive;
  }, [isVoiceLoopActive]);

  // Continuous Speech Recognition
  const {
    startListening: startContinuousListening,
    stopListening: stopContinuousListening,
    isListening: csrIsListening, // Continuous Speech Recognition isListening
    currentInterimTranscript: csrCurrentInterimTranscript, // Continuous Speech Recognition currentTranscript
    isReady: csrIsReady, // Continuous Speech Recognition isReady
    resetTranscript: csrResetTranscript,
  } = useContinuousSpeechRecognition(
    useCallback((finalTranscript) => {
      // Central dispatcher for all final transcripts
      const lowerTranscript = finalTranscript.toLowerCase();
      console.log("VoiceLoop - Received final transcript:", lowerTranscript);

      if (lowerTranscript.includes("jarvis stop")) {
        console.log("Stop command detected!");
        stopVoiceLoop(); // Stop the entire loop
        toast.info("Voice loop stopped by command.");
        // Reject any pending user command promise
        if (rejectUserCommandRef.current) {
          rejectUserCommandRef.current(new Error("Speech recognition stopped by user command."));
          resolveUserCommandRef.current = null;
          rejectUserCommandRef.current = null;
        }
        return;
      }

      if (!isVoiceLoopActiveRef.current) {
        // If loop is not active, we are in wake word mode
        if (lowerTranscript.includes("jarvis")) {
          console.log("Wake word detected!");
          startVoiceLoop(); // Activate the main loop
        }
      } else {
        // If loop is active, this is a user command
        if (resolveUserCommandRef.current) {
          // If there's a pending promise for a user command, resolve it
          resolveUserCommandRef.current(finalTranscript);
          resolveUserCommandRef.current = null;
          rejectUserCommandRef.current = null;
        } else {
          // Otherwise, queue it up (shouldn't happen often if loop is well-managed)
          userCommandQueueRef.current.push(finalTranscript);
        }
      }
    }, []), // Dependencies for useCallback
    useCallback((interimTranscript) => {
      // Update interim text for display
      if (isVoiceLoopActiveRef.current) { // Only show interim if main loop is active
        setCurrentInterimTranscript(interimTranscript);
      }
    }, []),
    useCallback((error) => {
      // Handle errors from continuous recognition
      console.error("Continuous recognition error in VoiceLoop:", error);
      if (error.includes("not-allowed") || error.includes("Microphone access denied")) {
        toast.error("Microphone access denied. Please enable microphone permissions.");
      } else if (error.includes("no-speech")) {
        // This can happen if continuous is true but no speech is detected for a while
        console.log("Continuous Listener: No speech detected, recognition continuing.");
      } else {
        toast.error(`Voice input error: ${error}`);
      }
      // If an error occurs, stop the loop to prevent continuous issues
      stopVoiceLoop();
    }, [])
  );

  // Start continuous listening when component mounts
  useEffect(() => {
    if (csrIsReady) {
      startContinuousListening();
    }
    return () => {
      stopContinuousListening();
    };
  }, [csrIsReady, startContinuousListening, stopContinuousListening]);

  // Use the continuous listener's state for isRecordingUser and currentInterimText
  useEffect(() => {
    // isRecordingUser should only be true if the main loop is active AND CSR is listening
    setIsRecordingUser(isVoiceLoopActive && csrIsListening);
  }, [isVoiceLoopActive, csrIsListening]);

  // Text-to-Speech hook
  const {
    speakAIResponse,
    isSpeakingAI,
    aiResponseText,
    audioRef,
    cancelSpeech,
  } = useTextToSpeech(supabase);

  // AI Interaction hook
  const {
    processSpeech,
    isThinkingAI, // Get isThinkingAI from useAIInteraction
    isSearchingAI, // Get isSearchingAI from useAIInteraction
  } = useAIInteraction(
    supabase,
    session,
    speakAIResponse,
  );

  // Function to get the next user command from the queue or wait for it
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
    // isThinkingAI and isSearchingAI are managed by useAIInteraction
    setCurrentInterimTranscript('');
    // isSpeakingAI and aiResponseText are managed by useTextToSpeech
    csrResetTranscript(); // Reset continuous listener's buffer
  }, [csrResetTranscript]);

  const runVoiceLoop = useCallback(async () => {
    while (isVoiceLoopActiveRef.current) {
      resetAllFlags(); // Only resets state variables now

      let userText = '';
      try {
        toast.info("Listening for your command...");
        userText = await getUserCommand(); // Wait for the next command
        if (!userText) { // If promise resolves to empty string (e.g., due to stop)
          console.warn("User command was empty, stopping loop.");
          break;
        }
      } catch (error: any) {
        console.warn("Listen phase failed with error:", error.message);
        if (error.message === "No speech detected.") {
          toast.info("No speech detected. Returning to idle mode.");
        } else if (error.message.includes("Speech recognition stopped by user command.")) {
          console.log("Listen phase stopped by user command.");
        } else {
          toast.error(`Listening error: ${error.message}`);
        }
        // In case of any error or explicit stop, break the loop
        break;
      }

      let aiResponse: { text: string; audioUrl: string | null } | null = null;
      try {
        // isThinkingAI and isSearchingAI are managed internally by processSpeech
        aiResponse = await processSpeech(userText);

        // Check if the AI response text is empty immediately after receiving it
        if (!aiResponse || !aiResponse.text) {
          // Throw an error if the AI returned an empty response
          throw new Error("AI returned an empty response.");
        }

      } catch (error: any) {
        console.error("Think phase failed:", error.message);
        toast.error(`AI thinking error: ${error.message}`);
        // If AI thinking fails, break the loop
        break;
      } finally {
        // No need to set isThinkingAI/isSearchingAI here, processSpeech handles it
      }

      // The check for empty response is now inside the try block,
      // so this part of the code will only be reached if aiResponse.text is not empty.
      // You can now proceed with the speak phase.
      // No need for the `if (!aiResponse || !aiResponse.text)` check here anymore.
    }
    // When the loop breaks, ensure it transitions back to idle state
    setIsVoiceLoopActive(false);
    isVoiceLoopActiveRef.current = false;
    resetAllFlags(); // Final reset when loop truly stops
    toast.info("Voice loop stopped.");
  }, [getUserCommand, processSpeech, resetAllFlags]);

  const startVoiceLoop = useCallback(() => {
    if (!isVoiceLoopActiveRef.current) {
      setIsVoiceLoopActive(true);
      isVoiceLoopActiveRef.current = true;
      // No need to start continuous listening here, it's always on.
      // Just start the loop logic.
      runVoiceLoop();
    }
  }, [runVoiceLoop]);

  const stopVoiceLoop = useCallback(() => {
    if (isVoiceLoopActiveRef.current) {
      setIsVoiceLoopActive(false);
      isVoiceLoopActiveRef.current = false;
      cancelSpeech();
      // Reject any pending user command promise
      if (rejectUserCommandRef.current) {
        rejectUserCommandRef.current(new Error("Voice loop stopped."));
        resolveUserCommandRef.current = null;
        rejectUserCommandRef.current = null;
      }
      // The continuous listener remains active for wake word detection
    }
  }, [cancelSpeech]);

  return {
    isVoiceLoopActive,
    startVoiceLoop,
    stopVoiceLoop,
    isRecordingUser,
    isSpeakingAI,
    isThinkingAI, // Pass through
    isSearchingAI, // Pass through
    currentInterimText: isVoiceLoopActive ? currentInterimText : csrCurrentInterimTranscript, // Show CSR interim when idle
    aiResponseText,
    isRecognitionReady: csrIsReady,
    audioRef,
  };
}