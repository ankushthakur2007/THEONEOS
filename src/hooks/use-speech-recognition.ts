import React, { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

interface UseSpeechRecognitionReturn {
  startRecognition: () => void;
  stopRecognition: () => void;
  isRecording: boolean;
  currentInterimText: string;
  finalTranscriptionRef: React.MutableRefObject<string>;
  isRecognitionReady: boolean;
}

export function useSpeechRecognition(
  onFinalResult: (text: string) => void,
  onRecognitionError: (event: SpeechRecognitionErrorEvent) => void,
  onRecognitionEnd: () => void
): UseSpeechRecognitionReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [currentInterimText, setCurrentInterimText] = useState('');
  const [isRecognitionReady, setIsRecognitionReady] = useState(false);
  const finalTranscriptionRef = useRef<string>('');
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const handleRecognitionResult = useCallback((event: SpeechRecognitionEvent) => {
    let interimTranscript = '';
    let currentFinalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        currentFinalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }
    finalTranscriptionRef.current += currentFinalTranscript;
    setCurrentInterimText(finalTranscriptionRef.current + interimTranscript);
  }, []);

  const handleRecognitionEnd = useCallback(() => {
    console.log("Speech recognition session ended.");
    setIsRecording(false);
    onRecognitionEnd(); // Notify parent hook/component
  }, [onRecognitionEnd]);

  const handleRecognitionError = useCallback((event: SpeechRecognitionErrorEvent) => {
    console.error('Speech recognition error:', event.error);
    setIsRecording(false);
    onRecognitionError(event); // Notify parent hook/component
  }, [onRecognitionError]);

  const startRecognition = useCallback(() => {
    if (!recognitionRef.current) {
      console.error("SpeechRecognition object not initialized when trying to start.");
      toast.error("Voice input not ready. Please try again.");
      return;
    }

    if (recognitionRef.current.recognizing || (recognitionRef.current as any).readyState === SpeechRecognition.State.ACTIVE) {
      recognitionRef.current.stop();
      console.log("SpeechRecognition: Forced stop before new start.");
    }

    setTimeout(() => {
      try {
        recognitionRef.current?.start();
        toast.info("Listening...");
      } catch (error) {
        console.error("Error starting speech recognition after delay:", error);
        toast.error("Failed to start voice input.");
        setIsRecording(false);
      }
    }, 500);
  }, []);

  const stopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  useEffect(() => {
    const initializeSpeechRecognition = () => {
      if (typeof window === 'undefined') {
        console.warn("Window object not available, skipping SpeechRecognition initialization.");
        return;
      }

      let SpeechRecognitionConstructor: typeof SpeechRecognition | undefined;

      if (typeof window.SpeechRecognition === 'function') {
        SpeechRecognitionConstructor = window.SpeechRecognition;
      } else if (typeof (window as any).webkitSpeechRecognition === 'function') {
        SpeechRecognitionConstructor = (window as any).webkitSpeechRecognition;
      }

      if (!SpeechRecognitionConstructor) {
        console.error("Speech recognition API not found or not a valid constructor.");
        toast.error("Speech recognition is not supported in your browser. Please try Chrome or Edge.");
        setIsRecognitionReady(false);
        return;
      }

      recognitionRef.current = new SpeechRecognitionConstructor();
      const recognition = recognitionRef.current;

      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        console.log("SpeechRecognition: Started.");
        setIsRecording(true);
        setCurrentInterimText('');
        finalTranscriptionRef.current = '';
      };

      recognition.onresult = handleRecognitionResult;
      recognition.onerror = handleRecognitionError;
      recognition.onend = handleRecognitionEnd;

      setIsRecognitionReady(true);
    };

    const timeoutId = setTimeout(initializeSpeechRecognition, 0);

    return () => {
      clearTimeout(timeoutId);
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, [handleRecognitionResult, handleRecognitionError, handleRecognitionEnd]);

  // Effect to process final transcription when recognition ends
  useEffect(() => {
    if (!isRecording && finalTranscriptionRef.current.trim() !== '') {
      onFinalResult(finalTranscriptionRef.current.trim());
      finalTranscriptionRef.current = ''; // Clear after processing
    }
  }, [isRecording, onFinalResult]);

  return {
    startRecognition,
    stopRecognition,
    isRecording,
    currentInterimText,
    finalTranscriptionRef,
    isRecognitionReady,
  };
}