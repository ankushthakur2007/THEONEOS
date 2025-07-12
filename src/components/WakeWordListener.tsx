import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface WakeWordListenerProps {
  onWake: () => void;
  isActive: boolean; // New prop to control activation
}

declare global {
  interface Window {
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

export function WakeWordListener({ onWake, isActive }: WakeWordListenerProps) {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [micPermissionGranted, setMicPermissionGranted] = useState<boolean | null>(null);
  const isWakeWordDetectedRef = useRef(false); // To prevent immediate restart after wake word

  useEffect(() => {
    const SpeechRecognitionConstructor =
      window.SpeechRecognition || window.webkitSpeechRecognition || null;

    if (!SpeechRecognitionConstructor) {
      console.warn("WakeWordListener: SpeechRecognition not supported in this browser.");
      toast.error("Wake word detection is not supported in your browser. Please try Chrome or Edge.");
      return;
    }

    // Initialize recognition object once
    if (!recognitionRef.current) {
      const recognition = new SpeechRecognitionConstructor();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = "en-US";
      recognitionRef.current = recognition;

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase();
        console.log("WakeWordListener: Heard:", transcript);
        if (transcript.includes("jarvis")) {
          console.log("WakeWordListener: Wake word detected! 🎙️");
          isWakeWordDetectedRef.current = true; // Set flag
          recognition.stop(); // Stop current recognition
          onWake(); // Trigger the main voice loop
          toast.success("Wake word detected. THEONEOS activated.");
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error("WakeWordListener error:", event.error);
        if (event.error === 'not-allowed') {
          toast.error("Microphone access denied for wake word listener. Please enable permissions.");
          setMicPermissionGranted(false);
        } else if (event.error === 'no-speech') {
          // This can happen if continuous is true but no speech is detected for a while
          console.log("WakeWordListener: No speech detected, recognition continuing.");
        } else {
          toast.error(`Wake word listener error: ${event.error}`);
        }
      };

      recognition.onend = () => {
        console.log("WakeWordListener: Recognition ended.");
        // Only restart if it was active and wake word was NOT detected
        if (isActive && !isWakeWordDetectedRef.current) {
          try {
            recognition.start();
            console.log("WakeWordListener: Recognition restarted due to normal end.");
          } catch (e: any) {
            console.error("WakeWordListener: Failed to restart recognition on end:", e);
            toast.error("Failed to restart wake word listener.");
          }
        } else if (isWakeWordDetectedRef.current) {
          console.log("WakeWordListener: Not restarting because wake word was detected.");
          isWakeWordDetectedRef.current = false; // Reset for next cycle
        }
      };
    }

    // Control recognition start/stop based on isActive prop
    if (isActive) {
      // Request microphone access and start recognition
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(() => {
          console.log("WakeWordListener: Microphone access granted.");
          setMicPermissionGranted(true);
          if (recognitionRef.current && !(recognitionRef.current as any).recognizing) {
            try {
              recognitionRef.current.start();
              console.log("WakeWordListener: Recognition started.");
            } catch (e: any) {
              console.error("WakeWordListener: Initial start failed:", e);
              toast.error("Failed to start wake word listener initially.");
              setMicPermissionGranted(false);
            }
          }
        })
        .catch((err) => {
          console.error("WakeWordListener: Microphone access denied or failed:", err);
          setMicPermissionGranted(false);
          if (err.name === 'NotFoundError') {
            toast.error("Microphone not found. Please ensure your microphone is connected and enabled in your system settings.");
          } else if (err.name === 'NotAllowedError') {
            toast.error("Microphone access denied. Please grant microphone permission for this site in your browser settings.");
          } else {
            toast.error("Microphone access is required for the wake word listener.");
          }
        });
    } else {
      // If isActive is false, stop recognition
      if (recognitionRef.current && (recognitionRef.current as any).recognizing) {
        recognitionRef.current.stop();
        console.log("WakeWordListener: Recognition stopped due to isActive=false.");
      }
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        console.log("WakeWordListener: Component unmounted or isActive changed, recognition stopped.");
      }
    };
  }, [onWake, isActive]); // Depend on isActive

  return null;
}