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

  // Function to play audio from URL (for ElevenLabs)
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
        toast.error(`Audio playback failed: ${e.message}.`);
        setIsSpeakingAI(false);
        setAiResponseText('');
      });

      audioRef.current.onended = () => {
        setIsSpeakingAI(false);
        setAiResponseText('');
        // Recognition should already be running if continuous is true.
        // No need to call startRecognition() here.
      };

      audioRef.current.onerror = () => {
        console.error("Audio playback error event.");
        toast.error("Audio playback error.");
        setIsSpeakingAI(false);
        setAiResponseText('');
      };
    }
  }, []);

  // Function to speak using Web Speech API (fallback)
  const speakWithWebSpeechAPI = useCallback((text: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.pitch = 1;
      utterance.rate = 1;
      utterance.volume = 1;

      utterance.onstart = () => {
        setIsSpeakingAI(true);
        setAiResponseText(text);
        setCurrentInterimText('');
      };

      utterance.onend = () => {
        setIsSpeakingAI(false);
        setAiResponseText('');
        // Recognition should already be running if continuous is true.
        // No need to call startRecognition() here.
      };

      utterance.onerror = (event) => {
        console.error('Web Speech API error:', event.error);
        toast.error("Browser speech synthesis failed.");
        setIsSpeakingAI(false);
        setAiResponseText('');
      };

      window.speechSynthesis.speak(utterance);
    } else {
      toast.error("Browser does not support Web Speech API for text-to-speech.");
      setIsSpeakingAI(false);
      setAiResponseText('');
    }
  }, []);

  // Function to handle transcription completion and AI interaction
  const handleTranscriptionComplete = useCallback(async (text: string) => {
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

      let audioUrl: string | null = null;
      let ttsUsedFallback = false;

      try {
        // 2. Try calling Eleven Labs TTS Edge Function
        const elevenLabsResponse = await supabase.functions.invoke('elevenlabs-tts', {
          body: { text: aiText },
        });

        if (elevenLabsResponse.error || !elevenLabsResponse.data || typeof elevenLabsResponse.data !== 'object' || !elevenLabsResponse.data.audioUrl) {
          console.warn('ElevenLabs TTS failed, attempting fallback to Web Speech API:', elevenLabsResponse.error?.message || 'Invalid data');
          speakWithWebSpeechAPI(aiText);
          ttsUsedFallback = true;
          toast.info("ElevenLabs failed, using browser's voice.");
        } else {
          audioUrl = elevenLabsResponse.data.audioUrl;
          playAudioAndThenListen(audioUrl, aiText);
        }
      } catch (elevenLabsError: any) {
        console.warn('ElevenLabs TTS failed completely, attempting fallback to Web Speech API:', elevenLabsError.message);
        speakWithWebSpeechAPI(aiText);
        ttsUsedFallback = true;
        toast.info("ElevenLabs failed, using browser's voice.");
      }

      // If neither ElevenLabs nor Web Speech API could be used, then it's an overall failure for TTS
      if (!audioUrl && !ttsUsedFallback) {
        throw new Error("Failed to generate speech from both ElevenLabs and Web Speech API.");
      }

      // 3. Store interaction in Supabase
      if (session?.user?.id) {
        const { error: dbError } = await supabase.from('interactions').insert({
          user_id: session.user.id,
          input_text: text,
          response_text: aiText,
          audio_url: audioUrl, // Store audioUrl if available, else null
        });
        if (dbError) {
          console.error('Error saving interaction:', dbError.message);
          toast.error('Failed to save interaction history.');
        }
      }

      toast.success("AI response received!");

    } catch (error: any) {
      console.error('Error interacting with AI or TTS:', error);
      toast.error(`Failed to get AI response: ${error.message}. Tap the sparkle button to try again.`);
      setIsSpeakingAI(false); // Ensure speaking state is false on error
      setAiResponseText('');
    } finally {
      setIsThinkingAI(false);
    }
  }, [supabase, session, playAudioAndThenListen, speakWithWebSpeechAPI, setIsThinkingAI, setCurrentInterimText, setAiResponseText]);

  // Initialize Speech Recognition
  useEffect(() => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      toast.error("Speech recognition is not supported in your browser. Please try Chrome or Edge.");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    const recognition = recognitionRef.current;

    recognition.continuous = true; // IMPORTANT CHANGE: Set to true for continuous listening
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

      // If a final result is received, process it
      if (currentFinalTranscript.trim()) {
        handleTranscriptionComplete(currentFinalTranscript.trim());
        finalTranscriptionRef.current = ''; // Clear for next segment
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      toast.error(`Speech recognition error: ${event.error}. Please check microphone permissions. Attempting to restart.`);
      setIsRecordingUser(false); // Recognition session has ended due to error
      finalTranscriptionRef.current = '';
      setCurrentInterimText('');
      setAiResponseText('');
      // Attempt to restart recognition after an error
      // A small delay might be beneficial here to avoid rapid restarts if the error is persistent.
      setTimeout(() => {
        if (recognitionRef.current) { // Check if component is still mounted
          startRecognition();
        }
      }, 1000); // Wait 1 second before attempting restart
    };

    recognition.onend = () => {
      console.log("Speech recognition session ended.");
      setIsRecordingUser(false); // Recognition session has ended
      finalTranscriptionRef.current = '';
      setCurrentInterimText('');
      setAiResponseText('');
      // If the session ended unexpectedly (not by user stopping it), restart it.
      // We only restart if AI is not currently speaking or thinking.
      if (!isSpeakingAI && !isThinkingAI) {
        toast.info("Speech recognition session ended. Restarting listening.");
        setTimeout(() => {
          if (recognitionRef.current) { // Check if component is still mounted
            startRecognition();
          }
        }, 500); // Small delay before restarting
      }
    };

    // Initial start when component mounts
    startRecognition();

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, [handleTranscriptionComplete, startRecognition, isSpeakingAI, isThinkingAI]);

  const handleToggleRecording = () => {
    if (isSpeakingAI || isThinkingAI) {
      return; // Do nothing if AI is speaking or thinking
    }

    if (isRecordingUser) {
      // If currently recording, stop it. This is the manual stop.
      recognitionRef.current?.stop();
      setIsRecordingUser(false); // Manually set state to false
      toast.info("Voice input stopped.");
    } else {
      // If not recording, start it.
      startRecognition();
    }
  };

  // Determine the main status text to display
  const displayMessage = isRecordingUser
    ? currentInterimText || "Listening..." // Show interim text if available, else "Listening..."
    : isThinkingAI
    ? "Thinking..."
    : isSpeakingAI
    ? aiResponseText || "AI is speaking..." // Show AI response text if available, else "AI is speaking..."
    : "Tap to speak"; // Default message when idle

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
            className="w-32 h-32 rounded-full transition-all duration-300 relative z-10 bg-blue-600 hover:bg-blue-700"
            onClick={handleToggleRecording}
          >
            <Sparkles className="h-36 w-36" /> {/* Increased icon size to fill button better */}
          </Button>
        )}
      </div>
      <audio ref={audioRef} className="hidden" />
    </div>
  );
};

export default Home;