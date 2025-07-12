import { useEffect, useRef } from "react";
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
    recognition.lang = "en-US"; // Changed to en-US

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase();
      console.log("WakeWordListener: Heard:", transcript);
      if (transcript.includes("the one")) {
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
      } else {
        toast.error(`Wake word listener error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      console.log("WakeWordListener: Recognition ended. Restarting…");
      try {
        recognition.start();
      } catch (e: any) {
        console.error("WakeWordListener: Failed to restart recognition:", e);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      console.log("WakeWordListener: Initial recognition started.");
    } catch (e: any) {
      console.error("WakeWordListener: Initial start failed:", e);
      toast.error("Failed to start wake word listener initially.");
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        console.log("WakeWordListener: Component unmounted, recognition stopped.");
      }
    };
  }, [onWake]);

  return null;
}