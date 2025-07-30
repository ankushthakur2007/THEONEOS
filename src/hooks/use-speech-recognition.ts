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
  const manualStopRef = useRef<boolean>(false);

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
    if (event.error === 'no-speech' || event.error === 'audio-capture') {
      return; // Ignore common errors that can occur during continuous listening
    }
    console.error('Speech recognition error:', event.error);
    if (onError) {
      onError(event.error);
    }
    manualStopRef.current = true;
    setIsListening(false);
  }, [onError]);

  const handleEnd = useCallback(() => {
    if (manualStopRef.current) {
      setIsListening(false);
    } else {
      // If the session ended automatically (e.g., browser timeout), restart it
      // to maintain the continuous listening experience.
      recognitionRef.current?.start();
    }
  }, []);

  const startListening = useCallback(async () => {
    if (!recognitionRef.current || isListening) return;

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      
      finalTranscriptRef.current = '';
      manualStopRef.current = false;
      onTranscriptChange(''); // Clear previous transcript
      
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
      manualStopRef.current = true;
      recognitionRef.current.stop();
    }
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
      manualStopRef.current = true;
      recognitionRef.current?.stop();
    };
  }, [handleResult, handleError, handleEnd]);

  return { startListening, stopListening, isListening, isReady };
}