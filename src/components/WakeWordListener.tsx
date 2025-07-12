import React, { useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';

interface WakeWordListenerProps {
  onWake: () => void;
}

// Extend the Window interface to include webkitSpeechRecognition
declare global {
  interface Window {
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

const WakeWordListener: React.FC<WakeWordListenerProps> = ({ onWake }) => {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isListeningRef = useRef<boolean>(false);
  const wakeWordDetectedRef = useRef<boolean>(false);
  const restartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const WAKE_WORD = "the one";
  const RESTART_DELAY_MS = 1000; // Delay before restarting recognition

  const startRecognition = useCallback(() => {
    if (!recognitionRef.current) {
      console.error("WakeWordListener: SpeechRecognition object not initialized.");
      return;
    }
    if (isListeningRef.current) {
      console.log("WakeWordListener: Already listening, skipping start.");
      return;
    }

    try {
      recognitionRef.current.start();
      isListeningRef.current = true;
      console.log("WakeWordListener: Started listening for wake word.");
    } catch (error: any) {
      if (error.name === 'InvalidStateError') {
        console.warn("WakeWordListener: Recognition already started or in an invalid state. Attempting to stop and restart.");
        recognitionRef.current.stop(); // Try to stop if already active
        setTimeout(() => {
          try {
            recognitionRef.current?.start();
            isListeningRef.current = true;
            console.log("WakeWordListener: Restarted listening for wake word after InvalidStateError.");
          } catch (e) {
            console.error("WakeWordListener: Failed to restart recognition after InvalidStateError:", e);
            toast.error("Microphone error. Please check permissions.");
            isListeningRef.current = false;
          }
        }, 100); // Small delay before attempting restart
      } else {
        console.error("WakeWordListener: Error starting recognition:", error);
        toast.error("Failed to start wake word listener.");
        isListeningRef.current = false;
      }
    }
  }, []);

  const stopRecognition = useCallback(() => {
    if (recognitionRef.current && isListeningRef.current) {
      recognitionRef.current.stop();
      isListeningRef.current = false;
      console.log("WakeWordListener: Stopped listening.");
    }
  }, []);

  const scheduleRestart = useCallback(() => {
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
    }
    restartTimeoutRef.current = setTimeout(() => {
      if (!wakeWordDetectedRef.current) { // Only restart if wake word wasn't detected
        console.log("WakeWordListener: Scheduling restart of recognition.");
        startRecognition();
      } else {
        console.log("WakeWordListener: Wake word detected, not restarting listener.");
        wakeWordDetectedRef.current = false; // Reset for next cycle
      }
    }, RESTART_DELAY_MS);
  }, [startRecognition]);

  useEffect(() => {
    const initializeRecognition = () => {
      if (typeof window === 'undefined') {
        console.warn("WakeWordListener: Window object not available, skipping SpeechRecognition initialization.");
        return;
      }

      const SpeechRecognitionConstructor =
        window.SpeechRecognition || window.webkitSpeechRecognition || null;

      if (!SpeechRecognitionConstructor) {
        console.error("WakeWordListener: Speech recognition API not found.");
        toast.error("Wake word detection is not supported in your browser. Please try Chrome or Edge.");
        return;
      }

      const recognition = new SpeechRecognitionConstructor();
      recognitionRef.current = recognition;

      recognition.continuous = false; // We want a single utterance at a time
      recognition.interimResults = false; // Only care about final results for wake word
      recognition.lang = 'en-IN'; // Customize language

      recognition.onstart = () => {
        isListeningRef.current = true;
        console.log("WakeWordListener: Recognition started.");
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = event.results[0][0].transcript.toLowerCase();
        console.log("WakeWordListener: Heard:", transcript);

        if (transcript.includes(WAKE_WORD)) {
          console.log("WakeWordListener: Wake word detected!");
          wakeWordDetectedRef.current = true;
          stopRecognition(); // Stop this listener
          onWake(); // Trigger the main AI loop
          toast.success("Wake word detected. THEONEOS activated.");
        }
      };

      recognition.onend = () => {
        isListeningRef.current = false;
        console.log("WakeWordListener: Recognition ended.");
        scheduleRestart(); // Schedule restart if wake word wasn't detected
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        isListeningRef.current = false;
        console.error('WakeWordListener: Recognition error:', event.error);
        if (event.error === 'not-allowed') {
          toast.error("Microphone access denied for wake word listener. Please enable permissions.");
          // Do not restart if permission is denied, requires user action
        } else if (event.error === 'no-speech') {
          console.log("WakeWordListener: No speech detected, restarting listener.");
          scheduleRestart(); // Restart if no speech was detected
        } else {
          toast.error(`Wake word listener error: ${event.error}`);
          scheduleRestart(); // Restart for other errors
        }
      };

      // Start listening immediately after initialization
      startRecognition();
    };

    initializeRecognition();

    return () => {
      // Cleanup on unmount
      stopRecognition();
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
      }
      recognitionRef.current = null;
      console.log("WakeWordListener: Component unmounted, cleaning up.");
    };
  }, [onWake, startRecognition, stopRecognition, scheduleRestart]);

  return null; // This is a headless component
};

export default WakeWordListener;