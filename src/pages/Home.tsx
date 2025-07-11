import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/SessionContextProvider';
import { toast } from 'sonner';
import { Mic, StopCircle } from 'lucide-react';
import AudioVisualizer from '@/components/AudioVisualizer';

const Home: React.FC = () => {
  const { supabase, session } = useSession();
  const [isRecordingUser, setIsRecordingUser] = useState(false);
  const [isSpeakingAI, setIsSpeakingAI] = useState(false);
  const [currentInterimText, setCurrentInterimText] = useState('');
  const [aiResponseText, setAiResponseText] = useState('');
  const finalTranscriptionRef = useRef<string>('');
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Function to start speech recognition
  const startRecognition = useCallback(() => {
    if (recognitionRef.current && !isRecordingUser && !isSpeakingAI) {
      try {
        recognitionRef.current.start();
      } catch (error) {
        console.error("Error starting speech recognition:", error);
        toast.error("Failed to start voice input. Please tap the mic button.");
        setIsRecordingUser(false);
      }
    }
  }, [isRecordingUser, isSpeakingAI]);

  // Function to play audio and then automatically start recognition
  const playAudioAndThenListen = useCallback((audioUrl: string, aiText: string) => {
    if (audioRef.current) {
      audioRef.current.src = audioUrl;
      setIsSpeakingAI(true);
      setAiResponseText(aiText);
      setCurrentInterimText('');

      audioRef.current.play().catch(e => {
        console.error("Error playing audio:", e);
        toast.error(`Audio playback failed: ${e.message}. Check console for details.`);
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
      // Do not auto-restart here, let the main flow handle it after AI response or user click
    };

    recognition.onend = () => {
      setIsRecordingUser(false);
      const finalTranscribedText = finalTranscriptionRef.current.trim();
      if (finalTranscribedText) {
        handleTranscriptionComplete(finalTranscribedText);
      } else {
        toast.info("No speech detected. Tap the mic to speak.");
        setCurrentInterimText('');
        // Do not auto-restart here, wait for user or AI response to trigger next listening phase
      }
      finalTranscriptionRef.current = '';
    };

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, []); // No dependencies, runs once on mount

  // Initial greeting and auto-start listening
  useEffect(() => {
    const initiateConversation = async () => {
      if (!session?.user?.id) {
        // Wait for session to be available
        return;
      }

      try {
        // Fetch user's first name
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('first_name')
          .eq('id', session.user.id)
          .single();

        const userName = profileData?.first_name || 'there';
        const greetingText = `Hi ${userName}! How can I help you today?`;

        // Get audio for greeting
        const elevenLabsResponse = await supabase.functions.invoke('elevenlabs-tts', {
          body: { text: greetingText },
        });

        if (elevenLabsResponse.error) {
          throw new Error(elevenLabsResponse.error.message);
        }

        if (!elevenLabsResponse.data || typeof elevenLabsResponse.data !== 'object' || !elevenLabsResponse.data.audioUrl) {
          const errorMessage = elevenLabsResponse.data?.error || JSON.stringify(elevenLabsResponse.data);
          throw new Error(`Invalid response from Eleven Labs TTS function for greeting: ${errorMessage}`);
        }

        const audioUrl = elevenLabsResponse.data.audioUrl;
        playAudioAndThenListen(audioUrl, greetingText); // Play greeting and then auto-start listening

      } catch (error: any) {
        console.error('Error initiating conversation:', error);
        toast.error(`Failed to start conversation: ${error.message}. Please tap the mic button to begin.`);
        startRecognition(); // Attempt to start recognition even if greeting fails
      }
    };

    if (session?.user?.id) {
      initiateConversation();
    }
  }, [session?.user?.id, supabase, playAudioAndThenListen, startRecognition]);

  const handleToggleRecording = () => {
    if (isSpeakingAI) {
      return;
    }

    if (isRecordingUser) {
      recognitionRef.current?.stop();
    } else {
      startRecognition();
    }
  };

  const handleTranscriptionComplete = async (text: string) => {
    const loadingToastId = toast.loading("Thinking...");

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
      playAudioAndThenListen(audioUrl, aiText); // Start playing audio and display AI text

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

      toast.dismiss(loadingToastId);
      toast.success("AI response received!");

    } catch (error: any) {
      console.error('Error interacting with AI or TTS:', error);
      toast.dismiss(loadingToastId);
      toast.error(`Failed to get AI response: ${error.message}`);
      setIsSpeakingAI(false); // Ensure AI speaking state is reset on error
      setAiResponseText(''); // Clear AI text on error
      startRecognition(); // Attempt to start recognition even if AI interaction fails
    }
  };

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-900 text-white p-4">
      {/* Live transcription text or AI response text in the center */}
      <div className="flex-grow flex items-center justify-center w-full max-w-3xl px-4 overflow-y-auto max-h-[calc(100vh-200px)]">
        {(currentInterimText || aiResponseText) && (
          <p className="text-3xl font-semibold text-gray-300 text-center">
            {currentInterimText || aiResponseText}
          </p>
        )}
      </div>

      {/* Microphone button and visualizer */}
      <div className="relative flex flex-col items-center justify-center mb-8">
        {(isRecordingUser || isSpeakingAI) && (
          <AudioVisualizer isAnimating={true} className="absolute inset-0 m-auto h-40 w-40" />
        )}
        <Button
          variant="default"
          size="icon"
          className={`w-24 h-24 rounded-full transition-all duration-300 relative z-10
            ${isRecordingUser ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 'bg-blue-600 hover:bg-blue-700'}
            ${isSpeakingAI ? 'opacity-50 cursor-not-allowed' : ''}`}
          onClick={handleToggleRecording}
          disabled={isSpeakingAI}
        >
          {isRecordingUser ? (
            <StopCircle className="h-12 w-12" />
          ) : (
            <Mic className="h-12 w-12" />
          )}
        </Button>
        <p className="text-sm text-gray-400 mt-4">
          {isRecordingUser ? "Tap to stop recording" : (isSpeakingAI ? "AI is speaking..." : "Tap to speak")}
        </p>
      </div>

      <audio ref={audioRef} className="hidden" />
    </div>
  );
};

export default Home;