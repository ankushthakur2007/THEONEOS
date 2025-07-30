import { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

interface UseSpeechRecognitionReturn {
  startListening: () => void;
  stopListening: () => void;
  isListening: boolean;
  transcript: string;
  isReady: boolean;
}

export function useContinuousSpeechRecognition(
  onFinalTranscript: (transcript: string) => void,
  onError: (error: string) => void
): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const handleResult = useCallback((event: SpeechRecognitionEvent) => {
    let finalTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      }
    }
    setTranscript(finalTranscript);
    if (finalTranscript) {
      onFinalTranscript(finalTranscript.trim());
    }
  }, [onFinalTranscript]);

  const handleError = useCallback((event: SpeechRecognitionErrorEvent) => {
    console.error('Speech recognition error:', event.error);
    onError(event.error);
    setIsListening(false);
  }, [onError]);

  const handleEnd = useCallback(() => {
    setIsListening(false);
    console.log("Speech recognition ended.");
  }, []);

  const startListening = useCallback(async () => {
    if (!recognitionRef.current || isListening) return;

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setTranscript('');
      recognitionRef.current.start();
      setIsListening(true);
    } catch (err: any) {
      console.error("Microphone access denied:", err);
      toast.error("Microphone access denied. Please enable it in your browser settings.");
      onError(`Microphone access denied: ${err.name || err.message}`);
      setIsListening(false);
    }
  }, [isListening, onError]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  }, [isListening]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Speech recognition not supported in this browser.");
      setIsReady(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = handleResult;
    recognition.onerror = handleError;
    recognition.onend = handleEnd;

    setIsReady(true);

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [handleResult, handleError, handleEnd]);

  return { startListening, stopListening, isListening, transcript, isReady };
}