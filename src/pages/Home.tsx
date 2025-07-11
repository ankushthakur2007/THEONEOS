import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/SessionContextProvider';
import { toast } from 'sonner';
import { Sparkles, X } from 'lucide-react'; // Import X icon

interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

const Home: React.FC = () => {
  const { supabase, session } = useSession();
  const [isVoiceLoopActive, setIsVoiceLoopActive] = useState(false); // New state for loop control
  const [isRecordingUser, setIsRecordingUser] = useState(false);
  const [isSpeakingAI, setIsSpeakingAI] = useState(false);
  const [isThinkingAI, setIsThinkingAI] = useState(false);
  const [currentInterimText, setCurrentInterimText] = useState('');
  const [aiResponseText, setAiResponseText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]); // State for conversation history
  const finalTranscriptionRef = useRef<string>('');
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Helper function to cancel any ongoing speech (browser or audio element)
  const cancelSpeech = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      console.log("SpeechSynthesis: Canceled existing speech.");
    }
  }, []);

  // Function to start speech recognition
  const startRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try {
        cancelSpeech(); // Ensure any previous speech is stopped before listening
        recognitionRef.current.start();
        toast.info("Listening..."); // Show toast when recognition actually starts
      } catch (error) {
        console.error("Error starting speech recognition:", error);
        toast.error("Failed to start voice input. Please tap the sparkle button.");
        setIsRecordingUser(false);
        setIsVoiceLoopActive(false); // Stop loop on recognition start error
      }
    } else {
      console.warn("SpeechRecognition object not initialized.");
      setIsVoiceLoopActive(false); // Stop loop if recognition object is null
    }
  }, [cancelSpeech]);

  // Function to play audio from URL (for ElevenLabs)
  const playAudioAndThenListen = useCallback((audioUrl: string, aiText: string) => {
    if (audioRef.current) {
      audioRef.current.src = audioUrl;
      setIsSpeakingAI(true);
      setAiResponseText(aiText); // Display AI text while audio plays
      setCurrentInterimText(''); // Clear interim text when AI starts speaking

      audioRef.current.play().then(() => {
        console.log("ElevenLabs Audio: Playback started.");
      }).catch(e => {
        console.error("Error attempting to play ElevenLabs audio:", e);
        toast.error(`Audio playback failed: ${e.message}.`);
        setIsSpeakingAI(false);
        setAiResponseText(''); // Clear AI text on audio playback error
        if (isVoiceLoopActive) { // Only restart if loop is still active
          startRecognition();
        }
      });

      audioRef.current.onended = () => {
        console.log("ElevenLabs Audio: Playback ended.");
        setIsSpeakingAI(false);
        setAiResponseText(''); // Clear AI text after speaking
        if (isVoiceLoopActive) { // Automatically restart listening after AI finishes speaking, if loop is active
          startRecognition();
        }
      };

      audioRef.current.onerror = () => {
        console.error("ElevenLabs Audio: Playback error event.");
        toast.error("Audio playback error.");
        setIsSpeakingAI(false);
        setAiResponseText(''); // Clear AI text on audio error
        if (isVoiceLoopActive) { // Restart listening on audio error, if loop is active
          startRecognition();
        }
      };
    }
  }, [isVoiceLoopActive, startRecognition]);

  // Function to speak using Web Speech API (fallback)
  const speakWithWebSpeechAPI = useCallback((text: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.pitch = 1;
      utterance.rate = 1;
      utterance.volume = 1;

      utterance.onstart = () => {
        console.log("Web Speech API: Speech started.");
        setIsSpeakingAI(true);
        setAiResponseText(text); // Display AI text while speaking
        setCurrentInterimText('');
      };

      utterance.onend = () => {
        console.log("Web Speech API: Speech ended.");
        setIsSpeakingAI(false);
        setAiResponseText(''); // Clear AI text after speaking
        if (isVoiceLoopActive) { // Automatically restart listening after AI finishes speaking, if loop is active
          startRecognition();
        }
      };

      utterance.onerror = (event) => {
        console.error('Web Speech API error:', event.error);
        toast.error("Browser speech synthesis failed.");
        setIsSpeakingAI(false);
        setAiResponseText(''); // Clear AI text on Web Speech API error
        if (isVoiceLoopActive) { // Restart listening on Web Speech API error, if loop is active
          startRecognition();
        }
      };

      console.log("Web Speech API: Attempting to speak:", text);
      window.speechSynthesis.speak(utterance);
    } else {
      console.warn("Web Speech API: Not supported.");
      toast.error("Browser does not support Web Speech API for text-to-speech.");
      setIsSpeakingAI(false);
      setAiResponseText(''); // Clear AI text if no support
      if (isVoiceLoopActive) { // If Web Speech API is not supported, we still need to restart recognition if loop is active
        startRecognition();
      }
    }
  }, [isVoiceLoopActive, startRecognition]);

  // Function to handle transcription completion and AI interaction
  // This function orchestrates the AI response and subsequent TTS.
  const processUserSpeech = useCallback(async (text: string) => {
    setIsThinkingAI(true);
    setCurrentInterimText('');
    setAiResponseText(''); // Clear previous AI text

    const newUserMessage: ChatMessage = { role: 'user', parts: [{ text }] };
    const updatedMessagesForAI = [...messages, newUserMessage];
    setMessages(prevMessages => [...prevMessages, newUserMessage]); // Optimistic update

    let aiText = '';
    let audioUrl: string | null = null;

    try {
      // 1. Call Gemini AI Edge Function
      const geminiResponse = await supabase.functions.invoke('gemini-chat', {
        body: { prompt: text, history: updatedMessagesForAI },
      });

      if (geminiResponse.error) {
        setIsThinkingAI(false);
        setMessages(prevMessages => prevMessages.slice(0, -1)); // Remove optimistic user message
        throw new Error(geminiResponse.error.message); // Re-throw to be caught by outer catch
      }
      aiText = geminiResponse.data.text;

      // If aiText is empty, there's nothing to speak.
      if (!aiText) {
        setIsThinkingAI(false);
        toast.info("AI returned an empty response. Listening again...");
        setMessages(prevMessages => prevMessages.slice(0, -1)); // Remove optimistic user message
        if (isVoiceLoopActive) { // If AI returns empty, but loop is active, restart listening
          startRecognition();
        }
        return; // Do not proceed to TTS
      }

      // Set AI response text immediately for display, and stop thinking state
      setAiResponseText(aiText);
      setIsThinkingAI(false); // AI has finished thinking, now it's about speaking

      // 2. Attempt TTS
      let ttsAttempted = false; // Flag to ensure at least one TTS method is tried
      try {
        const elevenLabsResponse = await supabase.functions.invoke('elevenlabs-tts', {
          body: { text: aiText },
        });

        if (elevenLabsResponse.error || !elevenLabsResponse.data || typeof elevenLabsResponse.data !== 'object' || !elevenLabsResponse.data.audioUrl) {
          console.warn('ElevenLabs TTS failed, attempting fallback to Web Speech API:', elevenLabsResponse.error?.message || 'Invalid data');
          speakWithWebSpeechAPI(aiText);
          ttsAttempted = true;
          toast.info("ElevenLabs failed, using browser's voice.");
        } else {
          audioUrl = elevenLabsResponse.data.audioUrl;
          playAudioAndThenListen(audioUrl, aiText);
          ttsAttempted = true;
        }
      } catch (elevenLabsError: any) {
        console.warn('ElevenLabs TTS failed completely, attempting fallback to Web Speech API:', elevenLabsError.message);
        speakWithWebSpeechAPI(aiText);
        ttsAttempted = true;
        toast.info("ElevenLabs failed, using browser's voice.");
      }

      // If no TTS was attempted (shouldn't happen with current logic, but as a safeguard)
      if (!ttsAttempted && isVoiceLoopActive) {
        console.warn("No TTS method was attempted. Manually restarting recognition.");
        startRecognition(); // Fallback if somehow no TTS path was taken, and loop is active
      }

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
      console.error('Overall error in AI interaction:', error);
      toast.error(`Failed to get AI response: ${error.message}. Listening again...`);
      setIsSpeakingAI(false); // Ensure speaking state is false on error
      setAiResponseText(''); // Clear AI text on error
      setMessages(prevMessages => prevMessages.slice(0, -1)); // Remove optimistic user message
      if (isVoiceLoopActive) { // If an error occurs, but loop is active, restart listening
        startRecognition();
      }
    }
  }, [supabase, session, playAudioAndThenListen, speakWithWebSpeechAPI, setCurrentInterimText, setAiResponseText, startRecognition, messages, isVoiceLoopActive]);

  // Effect to manage the voice loop: starts recognition when active, stops when inactive
  useEffect(() => {
    if (isVoiceLoopActive) {
      startRecognition();
    } else {
      // When loop is deactivated, ensure recognition is stopped
      recognitionRef.current?.stop();
      setIsRecordingUser(false);
      setIsSpeakingAI(false);
      setIsThinkingAI(false);
      setCurrentInterimText('');
      setAiResponseText('');
    }
  }, [isVoiceLoopActive, startRecognition]);

  // Initialize Speech Recognition (this useEffect should only run once for setup)
  useEffect(() => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      toast.error("Speech recognition is not supported in your browser. Please try Chrome or Edge.");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    const recognition = recognitionRef.current;

    recognition.continuous = false; // IMPORTANT: Set to false for single utterance
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      console.log("SpeechRecognition: Started.");
      setIsRecordingUser(true);
      setCurrentInterimText('');
      setAiResponseText('');
      finalTranscriptionRef.current = '';
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
      setIsRecordingUser(false);
      finalTranscriptionRef.current = '';
      setCurrentInterimText('');
      setAiResponseText('');

      if (event.error === 'not-allowed') {
        toast.error("Microphone access denied. Please enable microphone permissions.");
        setIsVoiceLoopActive(false); // Critical error, stop loop
      } else {
        // For 'no-speech' or other non-critical errors, attempt to restart if loop is active
        toast.info(`Speech recognition error: ${event.error}. Listening again...`);
        if (isVoiceLoopActive) { // Only restart if loop is active
          startRecognition();
        }
        // Do NOT set isVoiceLoopActive(false) here or show "Voice loop stopped."
      }
    };

    recognition.onend = () => {
      console.log("Speech recognition session ended.");
      setIsRecordingUser(false); // Recognition session has ended
      const finalTranscribedText = finalTranscriptionRef.current.trim();
      if (finalTranscribedText) {
        processUserSpeech(finalTranscribedText); // Process the transcribed speech
      } else {
        toast.info("No speech detected. Listening again...");
        setCurrentInterimText('');
        if (isVoiceLoopActive) { // If no speech, go back to listening state, if loop is active
          startRecognition();
        }
        // Do NOT set isVoiceLoopActive(false) here or show "Voice loop stopped."
      }
      finalTranscriptionRef.current = '';
    };

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, [processUserSpeech, startRecognition]); // Removed isVoiceLoopActive from this dependency array

  // Function to start the voice loop
  const handleStartVoiceLoop = () => {
    if (!isVoiceLoopActive) {
      setIsVoiceLoopActive(true); // This will trigger the new useEffect to start recognition
    }
  };

  // Function to stop the voice loop
  const handleStopVoiceLoop = () => {
    setIsVoiceLoopActive(false); // This will trigger the new useEffect to stop recognition
    cancelSpeech();
    toast.info("Voice loop stopped."); // Only show this toast when explicitly stopped
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
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-900 text-white p-4">
      <div className="flex flex-col items-center justify-center w-full max-w-3xl px-4 flex-grow">
        {/* Display message or start button */}
        {isVoiceLoopActive ? (
          <p className="text-3xl font-semibold text-gray-300 text-center">
            {displayMessage}
          </p>
        ) : (
          <Button
            variant="default"
            size="icon"
            className="w-32 h-32 rounded-full transition-all duration-300 relative z-10 bg-blue-600 hover:bg-blue-700"
            onClick={handleStartVoiceLoop}
          >
            <Sparkles className="h-36 w-36" /> {/* Increased icon size to fill button better */}
          </Button>
        )}
      </div>
      <audio ref={audioRef} className="hidden" />

      {/* Stop button, visible only when the voice loop is active */}
      {isVoiceLoopActive && (
        <div className="absolute bottom-8">
          <Button
            variant="destructive"
            size="icon"
            className="w-16 h-16 rounded-full"
            onClick={handleStopVoiceLoop}
          >
            <X className="h-8 w-8" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default Home;