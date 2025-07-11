import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/SessionContextProvider';
import { toast } from 'sonner';
import { Sparkles } from 'lucide-react';

const Home: React.FC = () => {
  const { supabase, session } = useSession();
  const [isRecordingUser, setIsRecordingUser] = useState(false);
  const [isSpeakingAI, setIsSpeakingAI] = useState(false);
  const [isThinkingAI, setIsThinkingAI] = useState(false);
  const [currentInterimText, setCurrentInterimText] = useState('');
  const [aiResponseText, setAiResponseText] = useState('');
  const finalTranscriptionRef = useRef<string>('');
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Function to start speech recognition
  const startRecognition = useCallback(() => {
    // Only start if not already recording, speaking, or thinking
    if (!isRecordingUser && !isSpeakingAI && !isThinkingAI) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (error) {
          console.error("Error starting speech recognition:", error);
          toast.error("Failed to start voice input. Please tap the sparkle button.");
          setIsRecordingUser(false); // Ensure recording state is false on error
        }
      }
    }
  }, [isRecordingUser, isSpeakingAI, isThinkingAI]);

  // Function to play audio and then transition to idle state
  const playAudioAndThenListen = useCallback((audioUrl: string, aiText: string) => {
    if (audioRef.current) {
      audioRef.current.src = audioUrl;
      setIsSpeakingAI(true);
      setAiResponseText(aiText);
      setCurrentInterimText(''); // Clear interim text when AI starts speaking

      audioRef.current.play().then(() => {
        // Audio started playing successfully
      }).catch(e => {
        console.error("Error attempting to play audio:", e);
        toast.error(`Audio playback failed: ${e.message}. Tap the sparkle button to speak.`);
        setIsSpeakingAI(false);
        setAiResponseText('');
        // No automatic restart here, return to idle
      });

      audioRef.current.onended = () => {
        setIsSpeakingAI(false);
        setAiResponseText('');
        // No automatic restart here, return to idle
      };

      audioRef.current.onerror = () => {
        console.error("Audio playback error event.");
        toast.error("Audio playback error. Tap the sparkle button to speak.");
        setIsSpeakingAI(false);
        setAiResponseText('');
        // No automatic restart here, return to idle
      };
    }
  }, []);

  // Initialize Speech Recognition
  useEffect(() => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      toast.error("Speech recognition is not supported in your browser. Please try Chrome or Edge.");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    const recognition = recognitionRef.current;

    recognition.continuous = false; // For single utterance, then restart
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsRecordingUser(true);
      setCurrentInterimText('');
      setAiResponseText('');
      finalTranscriptionRef.current = '';
      toast.info("Listening...");
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
      finalTranscriptionRef.current += currentFinalTranscript;
      setCurrentInterimText(finalTranscriptionRef.current + interimTranscript);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      toast.error(`Speech recognition error: ${event.error}. Please check microphone permissions. Tap the sparkle button to try again.`);
      setIsRecordingUser(false);
      finalTranscriptionRef.current = '';
      setCurrentInterimText('');
      setAiResponseText('');
      // No automatic restart here, return to idle
    };

    recognition.onend = () => {
      setIsRecordingUser(false);
      const finalTranscribedText = finalTranscriptionRef.current.trim();
      if (finalTranscribedText) {
        // Since AI functions are removed, we'll just log the transcription
        console.log("Transcription complete (AI functions disabled):", finalTranscribedText);
        toast.info("Transcription received, but AI features are disabled.");
      } else {
        toast.info("No speech detected. Tap the sparkle button to speak.");
        setCurrentInterimText('');
      }
      finalTranscriptionRef.current = '';
    };

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, []);

  const handleToggleRecording = () => {
    if (isSpeakingAI || isThinkingAI) {
      return; // Do nothing if AI is speaking or thinking
    }

    if (isRecordingUser) {
      recognitionRef.current?.stop();
    } else {
      // Prevent starting recognition if AI features are disabled
      toast.error("AI features are currently disabled. Please re-enable the necessary Edge Functions.");
      return;
    }
  };

  // Determine the main status text to display
  const displayMessage = isRecordingUser
    ? currentInterimText || "Listening..." // Show interim text if available, else "Listening..."
    : isThinkingAI
    ? "Thinking..."
    : isSpeakingAI
    ? aiResponseText || "AI is speaking..." // Show AI response text if available, else "AI is speaking..."
    : "AI features disabled"; // Default message when idle

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gray-900 text-white p-4">
      <div className="flex flex-col items-center justify-center w-full max-w-3xl px-4">
        {/* Display message or button */}
        {isRecordingUser || isSpeakingAI || isThinkingAI ? (
          <p className="text-3xl font-semibold text-gray-300 text-center">
            {displayMessage}
          </p>
        ) : (
          <Button
            variant="default"
            size="icon"
            className="w-32 h-32 rounded-full transition-all duration-300 relative z-10 bg-gray-600 hover:bg-gray-700 cursor-not-allowed" // Changed color and cursor
            onClick={handleToggleRecording}
            disabled={true} // Disable the button
          >
            <Sparkles className="h-36 w-36" />
          </Button>
        )}
      </div>
      <audio ref={audioRef} className="hidden" />
    </div>
  );
};

export default Home;