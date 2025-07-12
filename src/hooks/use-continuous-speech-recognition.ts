import { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

interface UseContinuousSpeechRecognitionReturn {
  startListening: () => void;
  stopListening: () => void;
  isListening: boolean;
  currentInterimTranscript: string;
  isReady: boolean;
  resetTranscript: () => void;
}

export function useContinuousSpeechRecognition(
  onFinalTranscript: (transcript: string) => void,
  onInterimTranscript: (transcript: string) => void,
  onError: (error: string) => void
): UseContinuousSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [currentInterimTranscript, setCurrentInterimTranscript] = useState('');
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const finalTranscriptBufferRef = useRef<string>(''); // To accumulate final results

  const resetTranscript = useCallback(() => {
    finalTranscriptBufferRef.current = '';
    setCurrentInterimTranscript('');
  }, []);

  const handleResult = useCallback((event: SpeechRecognitionEvent) => {
    let interim = '';
    let final = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        final += transcript;
      } else {
        interim += transcript;
      }
    }

    if (final) {
      finalTranscriptBufferRef.current += final;
      onFinalTranscript(final.trim()); // Pass each final segment
    }
    setCurrentInterimTranscript(finalTranscriptBufferRef.current + interim);
    onInterimTranscript(finalTranscriptBufferRef.current + interim); // Pass combined interim
  }, [onFinalTranscript, onInterimTranscript]);

  const handleError = useCallback((event: SpeechRecognitionErrorEvent) => {
    console.error('Continuous speech recognition error:', event.error);
    setIsListening(false);
    onError(event.error);
  }, [onError]);

  const startListening = useCallback(async () => {
    if (!recognitionRef.current) {
      toast.error("Speech recognition not initialized.");
      return;
    }

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("Microphone access granted for continuous speech recognition.");
    } catch (err: any) {
      console.error("Microphone access denied for continuous speech recognition:", err);
      toast.error("Microphone access denied. Please enable microphone permissions in your browser settings.");
      setIsListening(false);
      onError(`Microphone access denied: ${err.name || err.message}`);
      return;
    }

    if ((recognitionRef.current as any).recognizing) {
      console.log("Continuous speech recognition already recognizing, stopping before restart.");
      recognitionRef.current.stop();
    }

    try {
      recognitionRef.current.start();
      console.log("Continuous speech recognition started.");
      setIsListening(true);
      resetTranscript(); // Clear buffer and interim text on start
    } catch (error: any) {
      console.error("Error starting continuous speech recognition:", error);
      toast.error("Failed to start continuous voice input.");
      setIsListening(false);
      onError(`Failed to start recognition: ${error.message}`);
    }
  }, [onError, resetTranscript]);

  const handleEnd = useCallback(() => {
    console.log("Continuous speech recognition session ended. Attempting to restart.");
    setIsListening(false);
    // Automatically restart listening to maintain continuous operation
    // Add a small delay to prevent rapid restarts if there's an immediate error
    setTimeout(() => {
      startListening(); // Call startListening from within the hook
    }, 500);
  }, [startListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && (recognitionRef.current as any).recognizing) {
      recognitionRef.current.stop();
      console.log("Continuous speech recognition stopped.");
      setIsListening(false);
    }
  }, []);

  useEffect(() => {
    const SpeechRecognitionConstructor =
      window.SpeechRecognition || (window as any).webkitSpeechRecognition || null;

    if (!SpeechRecognitionConstructor) {
      console.error("Speech recognition API not found or not a valid constructor.");
      toast.error("Speech recognition is not supported in your browser. Please try Chrome or Edge.");
      setIsReady(false);
      return;
    }

    const recognition = new SpeechRecognitionConstructor();
    recognitionRef.current = recognition;

    recognition.continuous = true; // Key difference: continuous listening
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = handleResult;
    recognition.onerror = handleError;
    recognition.onend = handleEnd;

    setIsReady(true);

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, [handleResult, handleError, handleEnd]);

  return {
    startListening,
    stopListening,
    isListening,
    currentInterimTranscript,
    isReady,
    resetTranscript,
  };
}