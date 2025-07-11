import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/SessionContextProvider';
import { toast } from 'sonner';
import { Sparkles, StopCircle } from 'lucide-react'; // Changed Star to Sparkles

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
    if (recognitionRef.current && !isRecordingUser && !isSpeakingAI && !isThinkingAI) {
      try {
        recognitionRef.current.start();
      } catch (error) {
        console.error("Error starting speech recognition:", error);
        toast.error("Failed to start voice input. Please tap the sparkle button.");
        setIsRecordingUser(false);
      }
    }
  }, [isRecordingUser, isSpeakingAI, isThinkingAI]);

  // Function to play audio and then automatically start recognition
  const playAudioAndThenListen = useCallback((audioUrl: string, aiText: string) => {
    if (audioRef.current) {
      audioRef.current.src = audioUrl;
      setIsSpeakingAI(true);
      setAiResponseText(aiText);
      setCurrentInterimText('');

      audioRef.current.play().then(() => {
        // Audio started playing successfully, nothing to do here yet.
        // The onended/onerror handlers will manage the next state.
      }).catch(e => {
        console.error("Error attempting to play audio:", e);
        toast.error(`Audio playback failed: ${e.message}. You may need to tap the sparkle button to start.`);
        setIsSpeakingAI(false);
        setAiResponseText('');
        startRecognition(); // Try to start recognition even if audio fails
      });

      audioRef.current.onended = () => {
        setIsSpeakingAI(false);
        setAiResponseText('');
        startRecognition(); // Automatically start listening for user input after AI finishes speaking
      };

      audioRef.current.onerror = () => {
        console.error("Audio playback error event.");
        setIsSpeakingAI(false);
        setAiResponseText('');
        startRecognition(); // Try to start recognition if audio errors
      };
    }
  }, [startRecognition]);

  // Initialize Speech Recognition
  useEffect(() => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      toast.error("Speech recognition is not supported in your browser. Please try Chrome or Edge.");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    const recognition = recognitionRef.current;

    recognition.continuous = false; // Still false for single utterance
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
      toast.error(`Speech recognition error: ${event.error}. Please check microphone permissions.`);
      setIsRecordingUser(false);
      finalTranscriptionRef.current = '';
      setCurrentInterimText('');
      setAiResponseText('');
      // If an error occurs, try to restart listening for user input to maintain the loop
      try {
        recognitionRef.current?.start();
      } catch (err) {
        console.error("Error restarting recognition after error:", err);
        toast.error("Failed to automatically restart voice input. Please tap the sparkle button.");
      }
    };

    recognition.onend = () => {
      setIsRecordingUser(false);
      const finalTranscribedText = finalTranscriptionRef.current.trim();
      if (finalTranscribedText) {
        handleTranscriptionComplete(finalTranscribedText);
      } else {
        toast.info("No speech detected. AI is waiting for your input.");
        setCurrentInterimText('');
        // If no speech detected, automatically try to start listening again
        // This ensures the continuous loop even if user doesn't speak
        try {
          recognitionRef.current?.start();
        } catch (e) {
          console.error("Error automatically starting speech recognition after no speech detected:", e);
          toast.error("Failed to automatically restart voice input. Please tap the sparkle button.");
        }
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
      return;
    }

    if (isRecordingUser) {
      recognitionRef.current?.stop();
    } else {
      startRecognition();
    }
  };

  const handleTranscriptionComplete = async (text: string) => {
    setIsThinkingAI(true);
    setCurrentInterimText('');
    setAiResponseText('');

    try {
      // 1. Call Gemini AI Edge Function
      const geminiResponse = await supabase.functions.invoke('gemini-chat', {
        body: { prompt: text },
      });

      if (geminiResponse.error) {
        throw new Error(geminiResponse.error.message);
      }

      const aiText = geminiResponse.data.text;

      // 2. Call Eleven Labs TTS Edge Function
      const elevenLabsResponse = await supabase.functions.invoke('elevenlabs-tts', {
        body: { text: aiText },
      });

      if (elevenLabsResponse.error) {
        throw new Error(elevenLabsResponse.error.message);
      }

      if (!elevenLabsResponse.data || typeof elevenLabsResponse.data !== 'object' || !elevenLabsResponse.data.audioUrl) {
        const errorMessage = elevenLabsResponse.data?.error || JSON.stringify(elevenLabsResponse.data);
        throw new Error(`Invalid response from Eleven Labs TTS function: ${errorMessage}`);
      }

      const audioUrl = elevenLabsResponse.data.audioUrl;
      playAudioAndThenListen(audioUrl, aiText);

      // 3. Store interaction in Supabase
      if (session?.user?.id) {
        const { error: dbError } = await supabase.from('interactions').insert({
          user_id: session.user.id,
          input_text: text,
          response_text: aiText,
          audio_url: audioUrl,
        });
        if (dbError) {
          console.error('Error saving interaction:', dbError.message);
          toast.error('Failed to save interaction history.');
        }
      }

      toast.success("AI response received!");

    } catch (error: any) {
      console.error('Error interacting with AI or TTS:', error);
      toast.error(`Failed to get AI response: ${error.message}`);
      setIsSpeakingAI(false);
      setAiResponseText('');
      startRecognition();
    } finally {
      setIsThinkingAI(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gray-900 text-white p-4">
      <div className="flex flex-col items-center justify-center w-full max-w-3xl px-4">
        {/* Live transcription text, AI response text, or Thinking text */}
        {(currentInterimText || aiResponseText || isThinkingAI) && (
          <p className="text-3xl font-semibold text-gray-300 text-center mb-8">
            {isThinkingAI ? "Thinking..." : (currentInterimText || aiResponseText)}
          </p>
        )}

        {/* Microphone button */}
        <div className="relative flex flex-col items-center justify-center">
          {/* Only show the button when neither recording, speaking, nor thinking */}
          {!isRecordingUser && !isSpeakingAI && !isThinkingAI && (
            <Button
              variant="default"
              size="icon"
              className="w-24 h-24 rounded-full transition-all duration-300 relative z-10 bg-blue-600 hover:bg-blue-700"
              onClick={handleToggleRecording}
            >
              <Sparkles className="h-12 w-12" />
            </Button>
          )}
          <p className="text-sm text-gray-400 mt-4">
            {isRecordingUser ? "Tap to stop recording" : (isSpeakingAI ? "AI is speaking..." : (isThinkingAI ? "AI is thinking..." : "Tap to speak"))}
          </p>
        </div>
      </div>
      <audio ref={audioRef} className="hidden" />
    </div>
  );
};

export default Home;