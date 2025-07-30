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
  const finalTranscriptBufferRef = useRef<string>('');
  const activeListeningRef = useRef(false); // Ref to track if we *want* to be listening

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
      onFinalTranscript(final.trim());
    }
    setCurrentInterimTranscript(finalTranscriptBufferRef.current + interim);
    onInterimTranscript(finalTranscriptBufferRef.current + interim);
  }, [onFinalTranscript, onInterimTranscript]);

  const handleError = useCallback((event: SpeechRecognitionErrorEvent) => {
    console.error('Continuous speech recognition error:', event.error);
    // We don't set isListening to false here because onend will be called right after.
    // Let the onend handler manage the state.
    onError(event.error);
  }, [onError]);

  const handleEnd = useCallback(() => {
    setIsListening(false);
    if (activeListeningRef.current) {
      console.log("Recognition ended unexpectedly, restarting...");
      setTimeout(() => {
        if (activeListeningRef.current && recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch (e) {
            console.error("Error restarting recognition:", e);
            activeListeningRef.current = false; // Stop trying if it fails
          }
        }
      }, 250); // Small delay to prevent frantic restarts
    } else {
      console.log("Recognition ended normally.");
    }
  }, []);

  const startListening = useCallback(async () => {
    if (!recognitionRef.current) {
      toast.error("Speech recognition not initialized.");
      return;
    }
    
    activeListeningRef.current = true;

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err: any) {
      console.error("Microphone access denied for continuous speech recognition:", err);
      toast.error("Microphone access denied. Please enable microphone permissions in your browser settings.");
      activeListeningRef.current = false;
      setIsListening(false);
      onError(`Microphone access denied: ${err.name || err.message}`);
      return;
    }

    if (!(recognitionRef.current as any).recognizing) {
      try {
        resetTranscript();
        recognitionRef.current.start();
      } catch (error: any) {
        console.error("Error starting continuous speech recognition:", error);
        toast.error("Failed to start continuous voice input.");
        activeListeningRef.current = false;
        setIsListening(false);
        onError(`Failed to start recognition: ${error.message}`);
      }
    }
  }, [onError, resetTranscript]);

  const stopListening = useCallback(() => {
    activeListeningRef.current = false;
    if (recognitionRef.current && (recognitionRef.current as any).recognizing) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  }, []);

  useEffect(() => {
    const SpeechRecognitionConstructor =
      window.SpeechRecognition || (window as any).webkitSpeechRecognition || null;

    if (!SpeechRecognitionConstructor) {
      console.error("Speech recognition API not found.");
      toast.error("Speech recognition is not supported in your browser. Please try Chrome or Edge.");
      setIsReady(false);
      return;
    }

    const recognition = new SpeechRecognitionConstructor();
    recognitionRef.current = recognition;

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = handleResult;
    recognition.onerror = handleError;
    recognition.onend = handleEnd;
    recognition.onstart = () => {
      setIsListening(true);
    };

    setIsReady(true);

    return () => {
      activeListeningRef.current = false;
      if (recognitionRef.current) {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onstart = null;
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