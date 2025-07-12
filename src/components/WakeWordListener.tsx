import { useEffect, useRef } from "react";
import { toast } from "sonner"; // Keep toast for error messages

interface WakeWordListenerProps {
  onWake: () => void;
}

// Extend the Window interface to include webkitSpeechRecognition
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
    recognition.continuous = true; // Listen continuously
    recognition.interimResults = false; // Only care about final results
    recognition.lang = "en-IN";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase();
      console.log("WakeWordListener: Heard:", transcript);
      if (transcript.includes("the one")) {
        console.log("WakeWordListener: Wake word detected! 🎙️");
        recognition.stop(); // Stop current recognition session
        onWake(); // Trigger the main AI voice loop
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
      // The onend event will fire after onerror, which will attempt to restart.
    };

    recognition.onend = () => {
      console.log("WakeWordListener: Recognition ended. Restarting…");
      // Only restart if the wake word wasn't detected and the loop isn't active
      // The `onWake` call will handle stopping this listener if the loop starts.
      // If the loop stops, Home.tsx will re-render this component, effectively restarting.
      // So, we only restart if it ended without a wake word detection.
      try {
        recognition.start(); // Auto-restart if idle or error
      } catch (e: any) {
        console.error("WakeWordListener: Failed to restart recognition:", e);
        if (e.name === 'InvalidStateError') {
          // This can happen if stop() was called very recently, or if another recognition is active.
          // We'll rely on the component re-mount or manual start if needed.
        }
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start(); // Start recognition after assigning to .current
      console.log("WakeWordListener: Initial recognition started.");
    } catch (e: any) {
      console.error("WakeWordListener: Initial start failed:", e);
      toast.error("Failed to start wake word listener initially.");
    }


    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop(); // Stop recognition on component unmount
        console.log("WakeWordListener: Component unmounted, recognition stopped.");
      }
    };
  }, [onWake]); // Dependency on onWake to ensure effect re-runs if onWake changes (though it's stable)

  return null; // This is a headless component
}