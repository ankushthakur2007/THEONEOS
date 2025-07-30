import { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

interface UseSpeechRecognitionOptions {
  onTranscriptChange: (transcript: string) => void;
  onError?: (error: string) => void;
}

interface UseSpeechRecognitionReturn {
  startListening: () => void;
  stopListening: () => void;
  isListening: boolean;
  isReady: boolean;
}

export function useSpeechRecognition({
  onTranscriptChange,
  onError,
}: UseSpeechRecognitionOptions): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const finalTranscriptRef = useRef<string>('');

  const handleResult = useCallback((event: SpeechRecognitionEvent) => {
    let interimTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscriptRef.current += event.results[i][0].transcript + ' ';
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }
    onTranscriptChange(finalTranscriptRef.current + interimTranscript);
  }, [onTranscriptChange]);

  const handleError = useCallback((event: SpeechRecognitionErrorEvent) => {
    console.error('Speech recognition error:', event.error);
    if (onError) {
      onError(event.error);
    }
    setIsListening(false);
  }, [onError]);

  const handleEnd = useCallback(() => {
    setIsListening(false);
  }, []);

  const startListening = useCallback(async () => {
    if (!recognitionRef.current || isListening) return;

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      finalTranscriptRef.current = ''; // Reset transcript on start
      onTranscriptChange('');
      recognitionRef.current.start();
      setIsListening(true);
    } catch (err: any) {
      console.error("Microphone access denied:", err);
      toast.error("Microphone access denied. Please enable it in your browser settings.");
      if (onError) {
        onError(`Microphone access denied: ${err.name || err.message}`);
      }
      setIsListening(false);
    }
  }, [isListening, onError, onTranscriptChange]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
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
    recognition.continuous = true;
    recognition.interimResults = true;
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

  return { startListening, stopListening, isListening, isReady };
}