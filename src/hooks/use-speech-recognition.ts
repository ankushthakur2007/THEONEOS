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

  const handleResult = useCallback((event: SpeechRecognitionEvent) => {
    let interimTranscript = '';
    let finalTranscript = '';
    for (let i = 0; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript + ' ';
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }
    onTranscriptChange(finalTranscript + interimTranscript);
  }, [onTranscriptChange]);

  const handleError = useCallback((event: SpeechRecognitionErrorEvent) => {
    if (event.error === 'no-speech' || event.error === 'audio-capture') {
      return; // Ignore common, non-critical errors.
    }
    console.error('Speech recognition error:', event.error);
    if (onError) {
      onError(event.error);
    }
  }, [onError]);

  const handleEnd = useCallback(() => {
    setIsListening(false);
  }, []);

  const startListening = useCallback(async () => {
    if (isListening || !recognitionRef.current) return;

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      onTranscriptChange('');
      recognitionRef.current.start();
      setIsListening(true);
    } catch (err: any) {
      console.error("Microphone access denied:", err);
      toast.error("Microphone access denied. Please enable it in your browser settings.");
      if (onError) {
        onError(`Microphone access denied: ${err.name || err.message}`);
      }
    }
  }, [isListening, onError, onTranscriptChange]);

  const stopListening = useCallback(() => {
    if (!isListening || !recognitionRef.current) return;
    recognitionRef.current.stop();
    // The 'onend' event will fire, which calls handleEnd to set isListening to false.
  }, [isListening]);

  useEffect(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      toast.error("Speech recognition not supported in this browser.");
      setIsReady(false);
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = handleResult;
    recognition.onerror = handleError;
    recognition.onend = handleEnd;

    setIsReady(true);

    return () => {
      recognitionRef.current?.abort();
    };
  }, [handleResult, handleError, handleEnd]);

  return { startListening, stopListening, isListening, isReady };
}