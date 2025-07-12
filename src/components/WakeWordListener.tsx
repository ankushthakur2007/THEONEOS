import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface WakeWordListenerProps {
  onWake: () => void;
}

declare global {
  interface Window {
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

export function WakeWordListener({ onWake }: WakeWordListenerProps) {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [micPermissionGranted, setMicPermissionGranted] = useState<boolean | null>(null); // New state to track permission

  useEffect(() => {
    const SpeechRecognitionConstructor =
      window.SpeechRecognition || window.webkitSpeechRecognition || null;

    if (!SpeechRecognitionConstructor) {
      console.warn("WakeWordListener: SpeechRecognition not supported in this browser.");
      toast.error("Wake word detection is not supported in your browser. Please try Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognitionConstructor();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase();
      console.log("WakeWordListener: Heard:", transcript);
      if (transcript.includes("jarvis")) { // Changed wake word to "jarvis"
        console.log("WakeWordListener: Wake word detected! 🎙️");
        recognition.stop();
        onWake();
        toast.success("Wake word detected. THEONEOS activated.");
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error("WakeWordListener error:", event.error);
      if (event.error === 'not-allowed') {
        toast.error("Microphone access denied for wake word listener. Please enable permissions.");
        setMicPermissionGranted(false); // Set permission to denied
      } else {
        toast.error(`Wake word listener error: ${event.error}`);
      }
      // Do not attempt to restart recognition on error, especially 'not-allowed'
    };

    recognition.onend = () => {
      console.log("WakeWordListener: Recognition ended.");
      // Only restart if permission was granted and no specific error occurred
      if (micPermissionGranted === true) { // Only restart if permission was explicitly granted
        try {
          recognition.start();
          console.log("WakeWordListener: Recognition restarted.");
        } catch (e: any) {
          console.error("WakeWordListener: Failed to restart recognition:", e);
          toast.error("Failed to restart wake word listener.");
        }
      } else if (micPermissionGranted === false) {
        console.log("WakeWordListener: Not restarting due to denied microphone permission.");
      }
    };

    // Request microphone access before starting recognition
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(() => {
        console.log("WakeWordListener: Microphone access granted.");
        setMicPermissionGranted(true); // Set permission to granted
        recognitionRef.current = recognition;
        try {
          recognition.start(); // Start recognition after getting permission
          console.log("WakeWordListener: Initial recognition started.");
        } catch (e: any) {
          console.error("WakeWordListener: Initial start failed:", e);
          toast.error("Failed to start wake word listener initially.");
          setMicPermissionGranted(false); // If start fails, assume permission issue
        }
      })
      .catch((err) => {
        console.error("WakeWordListener: Microphone access denied or failed:", err);
        setMicPermissionGranted(false); // Set permission to denied
        if (err.name === 'NotFoundError') {
          toast.error("Microphone not found. Please ensure your microphone is connected and enabled in your system settings.");
        } else if (err.name === 'NotAllowedError') {
          toast.error("Microphone access denied. Please grant microphone permission for this site in your browser settings.");
        } else {
          toast.error("Microphone access is required for the wake word listener.");
        }
      });

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        console.log("WakeWordListener: Component unmounted, recognition stopped.");
      }
    };
  }, [onWake, micPermissionGranted]);

  return null;
}