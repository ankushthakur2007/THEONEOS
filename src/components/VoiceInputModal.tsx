import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Mic, StopCircle } from 'lucide-react';
import { toast } from 'sonner';

interface VoiceInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTranscriptionComplete: (text: string) => void;
}

const VoiceInputModal: React.FC<VoiceInputModalProps> = ({
  isOpen,
  onClose,
  onTranscriptionComplete,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [currentInterimText, setCurrentInterimText] = useState(''); // To display interim results
  const finalTranscriptionRef = useRef<string>(''); // To store the final accumulated text
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    // Check for browser support for Speech Recognition API
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      toast.error("Speech recognition is not supported in your browser. Please try Chrome or Edge.");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    const recognition = recognitionRef.current;

    recognition.continuous = true; // Keep listening until stopped
    recognition.interimResults = true; // Show results as they come in
    recognition.lang = 'en-US'; // Set language to US English

    recognition.onstart = () => {
      setIsRecording(true);
      setCurrentInterimText(''); // Clear displayed text
      finalTranscriptionRef.current = ''; // Reset final text
      toast.info("Voice input started. Please speak clearly.");
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
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
      
      // Accumulate final transcript in the ref
      finalTranscriptionRef.current += currentFinalTranscript;
      // Display current interim + accumulated final for the user
      setCurrentInterimText(finalTranscriptionRef.current + interimTranscript);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      toast.error(`Speech recognition error: ${event.error}. Please check microphone permissions.`);
      setIsRecording(false);
      finalTranscriptionRef.current = ''; // Clear on error
    };

    recognition.onend = () => {
      setIsRecording(false);
      const finalTranscribedText = finalTranscriptionRef.current.trim(); // Get the accumulated final text

      if (finalTranscribedText) {
        onTranscriptionComplete(finalTranscribedText);
        toast.success("Voice input stopped. Text transcribed.");
      } else {
        toast.info("No speech detected or transcription failed.");
      }
      finalTranscriptionRef.current = ''; // Reset for next session
      setCurrentInterimText(''); // Clear displayed text
    };

    // Cleanup function: stop recognition if component unmounts or modal closes
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, [onTranscriptionComplete]); // Dependency array: re-run if onTranscriptionComplete changes

  // Effect to handle modal open/close state
  useEffect(() => {
    if (!isOpen) {
      // If modal is closed, stop recording if active and reset states
      if (recognitionRef.current && isRecording) {
        recognitionRef.current.stop();
      }
      setCurrentInterimText('');
      finalTranscriptionRef.current = ''; // Ensure ref is cleared on close
      setIsRecording(false);
    }
  }, [isOpen, isRecording]);

  const handleStartRecording = () => {
    if (recognitionRef.current && !isRecording) {
      try {
        setCurrentInterimText(''); // Clear displayed text before starting new recording
        finalTranscriptionRef.current = ''; // Clear final text ref
        recognitionRef.current.start();
      } catch (error) {
        console.error("Error starting speech recognition:", error);
        toast.error("Failed to start voice input. Please ensure microphone is connected and permissions are granted.");
        setIsRecording(false);
      }
    }
  };

  const handleStopRecording = () => {
    if (recognitionRef.current && isRecording) {
      recognitionRef.current.stop();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] p-6">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center">Voice Input</DialogTitle>
          <DialogDescription className="text-center text-gray-600 dark:text-gray-400">
            {isRecording ? "Listening..." : "Click the mic to start speaking."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center justify-center py-8 space-y-4">
          {isRecording ? (
            <Button
              variant="destructive"
              size="icon"
              className="w-24 h-24 rounded-full animate-pulse"
              onClick={handleStopRecording}
            >
              <StopCircle className="h-12 w-12" />
            </Button>
          ) : (
            <Button
              variant="default"
              size="icon"
              className="w-24 h-24 rounded-full"
              onClick={handleStartRecording}
            >
              <Mic className="h-12 w-12" />
            </Button>
          )}
          {currentInterimText && (
            <p className="mt-4 text-lg text-gray-800 dark:text-gray-200 text-center px-4">
              {currentInterimText}
            </p>
          )}
        </div>
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VoiceInputModal;