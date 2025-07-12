import React, { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

interface UseSpeechRecognitionReturn {
  listen: () => Promise<string>;
  stopRecognition: () => void;
  isRecording: boolean;
  currentInterimText: string;
  isRecognitionReady: boolean;
}

export function useSpeechRecognition(): UseSpeechRecognitionReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [currentInterimText, setCurrentInterimText] = useState('');
  const [isRecognitionReady, setIsRecognitionReady] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const resolvePromiseRef = useRef<((value: string | PromiseLike<string>) => void) | null>(null);
  const rejectPromiseRef = useRef<((reason?: any) => void) | null>(null);
  const finalTranscriptionRef = useRef<string>('');

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
    console.log("SpeechRecognition session ended.");
    setIsRecording(false);
    if (resolvePromiseRef.current) {
      const finalTranscribedText = finalTranscriptionRef.current.trim();
      if (finalTranscribedText) {
        resolvePromiseRef.current(finalTranscribedText);
      } else {
        rejectPromiseRef.current?.(new Error("No speech detected."));
      }
      resolvePromiseRef.current = null;
      rejectPromiseRef.current = null;
    }
    finalTranscriptionRef.current = '';
    setCurrentInterimText('');
  }, []);

  const handleRecognitionError = useCallback((event: SpeechRecognitionErrorEvent) => {
    console.error('Speech recognition error:', event.error);
    setIsRecording(false);
    rejectPromiseRef.current?.(new Error(`Speech recognition error: ${event.error}`));
    resolvePromiseRef.current = null;
    rejectPromiseRef.current = null;
    finalTranscriptionRef.current = '';
    setCurrentInterimText('');
  }, []);

  const listen = useCallback((): Promise<string> => {
    return new Promise(async (resolve, reject) => {
      if (!recognitionRef.current) {
        toast.error("Voice input not ready. Please try again.");
        return reject(new Error("SpeechRecognition object not initialized."));
      }

      // Explicitly request microphone access before starting recognition
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log("Microphone access granted for speech recognition.");
      } catch (err) {
        console.error("Microphone access denied for speech recognition:", err);
        toast.error("Microphone access denied. Please enable microphone permissions in your browser settings.");
        setIsRecording(false);
        return reject(new Error("Microphone access denied."));
      }

      if ((recognitionRef.current as any).recognizing) {
        recognitionRef.current.stop();
        console.log("SpeechRecognition: Forced stop before new start.");
      }

      resolvePromiseRef.current = resolve;
      rejectPromiseRef.current = reject;

      try {
        recognitionRef.current.start();
        toast.info("Listening...");
        setIsRecording(true);
        finalTranscriptionRef.current = '';
        setCurrentInterimText('');
      } catch (error) {
        console.error("Error starting speech recognition:", error);
        toast.error("Failed to start voice input.");
        setIsRecording(false);
        reject(error);
      }
    });
  }, []);

  const stopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
      rejectPromiseRef.current?.(new Error("Speech recognition stopped by user."));
      resolvePromiseRef.current = null;
      rejectPromiseRef.current = null;
      finalTranscriptionRef.current = '';
      setCurrentInterimText('');
    }
  }, []);

  useEffect(() => {
    const initializeSpeechRecognition = () => {
      if (typeof window === 'undefined') {
        console.warn("Window object not available, skipping SpeechRecognition initialization.");
        return;
      }

      const SpeechRecognitionConstructor =
        window.SpeechRecognition || (window as any).webkitSpeechRecognition || null;

      if (!SpeechRecognitionConstructor) {
        console.error("Speech recognition API not found or not a valid constructor.");
        toast.error("Speech recognition is not supported in your browser. Please try Chrome or Edge.");
        setIsRecognitionReady(false);
        return;
      }

      const recognition = new SpeechRecognitionConstructor();
      recognitionRef.current = recognition;

      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = handleRecognitionResult;
      recognition.onerror = handleRecognitionError;
      recognition.onend = handleRecognitionEnd;

      setIsRecognitionReady(true);
    };

    initializeSpeechRecognition();

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, [handleRecognitionResult, handleRecognitionError, handleRecognitionEnd]);

  return {
    listen,
    stopRecognition,
    isRecording,
    currentInterimText,
    isRecognitionReady,
  };
}