import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/SessionContextProvider';
import { toast } from 'sonner';
import { Sparkles, X } from 'lucide-react'; // Import X icon

interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

// Define a constant for the maximum number of historical messages to fetch
// const MAX_HISTORY_MESSAGES = 10; // Removed to fetch all history

const Home: React.FC = () => {
  const { supabase, session } = useSession();
  const [isVoiceLoopActive, setIsVoiceLoopActive] = useState(false);
  const [isRecordingUser, setIsRecordingUser] = useState(false);
  const [isSpeakingAI, setIsSpeakingAI] = useState(false);
  const [isThinkingAI, setIsThinkingAI] = useState(false);
  const [currentInterimText, setCurrentInterimText] = useState('');
  const [aiResponseText, setAiResponseText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]); // State for conversation history
  const finalTranscriptionRef = useRef<string>('');
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Ref to hold the current state of isVoiceLoopActive for stable callbacks
  const isVoiceLoopActiveRef = useRef(isVoiceLoopActive);
  useEffect(() => {
    isVoiceLoopActiveRef.current = isVoiceLoopActive;
  }, [isVoiceLoopActive]);

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
    if (!recognitionRef.current) {
      console.error("SpeechRecognition object not initialized when trying to start.");
      toast.error("Voice input not ready. Please try again.");
      setIsVoiceLoopActive(false); // Critical error, stop loop
      return;
    }
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
  }, [cancelSpeech]);

  // Function to play audio from URL (for ElevenLabs)
  const playAudioAndThenListen = useCallback((audioUrl: string, aiText: string) => {
    if (audioRef.current) {
      audioRef.current.src = audioUrl;
      setIsSpeakingAI(true);
      setAiResponseText(aiText);
      setCurrentInterimText('');

      audioRef.current.play().then(() => {
        console.log("ElevenLabs Audio: Playback started.");
      }).catch(e => {
        console.error("Error attempting to play ElevenLabs audio:", e);
        toast.error(`Audio playback failed: ${e.message}.`);
        setIsSpeakingAI(false);
        setAiResponseText('');
        if (isVoiceLoopActiveRef.current) { // Use ref
          startRecognition();
        }
      });

      audioRef.current.onended = () => {
        console.log("ElevenLabs Audio: Playback ended.");
        setIsSpeakingAI(false);
        setAiResponseText('');
        if (isVoiceLoopActiveRef.current) { // Use ref
          startRecognition();
        }
      };

      audioRef.current.onerror = () => {
        console.error("ElevenLabs Audio: Playback error event.");
        toast.error("Audio playback error.");
        setIsSpeakingAI(false);
        setAiResponseText('');
        if (isVoiceLoopActiveRef.current) { // Use ref
          startRecognition();
        }
      };
    }
  }, [startRecognition]); // Removed isVoiceLoopActive from dependencies, using ref instead

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
        setAiResponseText(text);
        setCurrentInterimText('');
      };

      utterance.onend = () => {
        console.log("Web Speech API: Speech ended.");
        setIsSpeakingAI(false);
        setAiResponseText('');
        if (isVoiceLoopActiveRef.current) { // Use ref
          startRecognition();
        }
      };

      utterance.onerror = (event) => {
        console.error('Web Speech API error:', event.error);
        toast.error("Browser speech synthesis failed.");
        setIsSpeakingAI(false);
        setAiResponseText('');
        if (isVoiceLoopActiveRef.current) { // Use ref
          startRecognition();
        }
      };

      console.log("Web Speech API: Attempting to speak:", text);
      window.speechSynthesis.speak(utterance);
    } else {
      console.warn("Web Speech API: Not supported.");
      toast.error("Browser does not support Web Speech API for text-to-speech.");
      setIsSpeakingAI(false);
      setAiResponseText('');
      if (isVoiceLoopActiveRef.current) { // Use ref
        startRecognition();
      }
    }
  }, [startRecognition]); // Removed isVoiceLoopActive from dependencies, using ref instead

  // Function to handle transcription completion and AI interaction
  const processUserSpeech = useCallback(async (text: string) => {
    setIsThinkingAI(true);
    setCurrentInterimText('');
    setAiResponseText('');

    const newUserMessage: ChatMessage = { role: 'user', parts: [{ text }] };
    // Optimistically add user message to local state for immediate display
    setMessages(prevMessages => [...prevMessages, newUserMessage]);

    let aiText = '';
    let audioUrl: string | null = null;

    try {
      let conversationHistory: ChatMessage[] = [];

      // Fetch past interactions for memory
      if (session?.user?.id) {
        const { data: pastInteractions, error: fetchError } = await supabase
          .from('interactions')
          .select('input_text, response_text')
          .eq('user_id', session.user.id)
          .order('timestamp', { ascending: true });
          // .limit(MAX_HISTORY_MESSAGES); // Removed limit to fetch all history

        if (fetchError) {
          console.error('Error fetching past interactions:', fetchError.message);
          toast.error('Failed to load conversation history.');
          // Continue without history if there's an error
        } else if (pastInteractions) {
          // Format fetched interactions into Gemini's expected history format
          conversationHistory = pastInteractions.flatMap(interaction => [
            { role: 'user', parts: [{ text: interaction.input_text }] },
            { role: 'model', parts: [{ text: interaction.response_text }] },
          ]);
        }
      }

      // Combine fetched history with the current user message for the AI
      const fullHistoryForAI = [...conversationHistory, newUserMessage];

      const geminiResponse = await supabase.functions.invoke('gemini-chat', {
        body: { prompt: text, history: fullHistoryForAI }, // Pass the full history
      });

      if (geminiResponse.error) {
        setIsThinkingAI(false);
        setMessages(prevMessages => prevMessages.slice(0, -1)); // Remove optimistic user message on error
        throw new Error(geminiResponse.error.message);
      }
      aiText = geminiResponse.data.text;

      if (!aiText) {
        setIsThinkingAI(false);
        toast.info("AI returned an empty response. Listening again...");
        setMessages(prevMessages => prevMessages.slice(0, -1)); // Remove optimistic user message
        if (isVoiceLoopActiveRef.current) { // Use ref
          startRecognition();
        }
        return;
      }

      setAiResponseText(aiText);
      setIsThinkingAI(false);

      let ttsAttempted = false;
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

      if (!ttsAttempted && isVoiceLoopActiveRef.current) { // Use ref
        console.warn("No TTS method was attempted. Manually restarting recognition.");
        startRecognition();
      }

      // Save the new interaction to the database (including the AI's response)
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
      setIsSpeakingAI(false);
      setAiResponseText('');
      setMessages(prevMessages => prevMessages.slice(0, -1)); // Remove optimistic user message on error
      if (isVoiceLoopActiveRef.current) { // Use ref
        startRecognition();
      }
    }
  }, [supabase, session, playAudioAndThenListen, speakWithWebSpeechAPI, setCurrentInterimText, setAiResponseText, startRecognition, messages]); // Removed isVoiceLoopActive from dependencies, using ref instead

  // Stable SpeechRecognition event handlers
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

  const handleRecognitionError = useCallback((event: SpeechRecognitionErrorEvent) => {
    console.error('Speech recognition error:', event.error);
    setIsRecordingUser(false);
    finalTranscriptionRef.current = '';
    setCurrentInterimText('');
    setAiResponseText('');

    if (event.error === 'not-allowed') {
      toast.error("Microphone access denied. Please enable microphone permissions.");
      setIsVoiceLoopActive(false); // Critical error, stop loop
    } else {
      toast.info(`Speech recognition error: ${event.error}. Listening again...`);
      if (isVoiceLoopActiveRef.current) { // Use ref
        startRecognition();
      }
    }
  }, [startRecognition]); // Depends on startRecognition

  const handleRecognitionEnd = useCallback(() => {
    console.log("Speech recognition session ended.");
    setIsRecordingUser(false);
    const finalTranscribedText = finalTranscriptionRef.current.trim();
    if (finalTranscribedText) {
      processUserSpeech(finalTranscribedText);
    } else {
      toast.info("No speech detected. Listening again...");
      setCurrentInterimText('');
      if (isVoiceLoopActiveRef.current) { // Use ref
        startRecognition();
      }
    }
    finalTranscriptionRef.current = '';
  }, [processUserSpeech, startRecognition]); // Depends on processUserSpeech and startRecognition

  // Initialize Speech Recognition (this useEffect should only run once for setup)
  useEffect(() => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      toast.error("Speech recognition is not supported in your browser. Please try Chrome or Edge.");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    const recognition = recognitionRef.current;

    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      console.log("SpeechRecognition: Started.");
      setIsRecordingUser(true);
      setCurrentInterimText('');
      setAiResponseText('');
      finalTranscriptionRef.current = '';
    };

    recognition.onresult = handleRecognitionResult;
    recognition.onerror = handleRecognitionError;
    recognition.onend = handleRecognitionEnd;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, [handleRecognitionResult, handleRecognitionError, handleRecognitionEnd]); // Dependencies are now the stable callbacks

  // Effect to manage the voice loop: starts recognition when active, stops when inactive
  useEffect(() => {
    if (isVoiceLoopActive) {
      startRecognition();
    } else {
      recognitionRef.current?.stop();
      setIsRecordingUser(false);
      setIsSpeakingAI(false);
      setIsThinkingAI(false);
      setCurrentInterimText('');
      setAiResponseText('');
    }
  }, [isVoiceLoopActive, startRecognition]);

  // Function to start the voice loop
  const handleStartVoiceLoop = () => {
    if (!isVoiceLoopActive) {
      setIsVoiceLoopActive(true); // This will trigger the useEffect to start recognition
    }
  };

  // Function to stop the voice loop
  const handleStopVoiceLoop = () => {
    setIsVoiceLoopActive(false); // This will trigger the useEffect to stop recognition
    cancelSpeech();
    toast.info("Voice loop stopped."); // Only show this toast when explicitly stopped
  };

  // Determine the main status text to display
  const displayMessage = isRecordingUser
    ? currentInterimText || "Listening..."
    : isThinkingAI
    ? "Thinking..."
    : isSpeakingAI
    ? aiResponseText || "AI is speaking..."
    : "Tap to speak";

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-900 text-white p-4">
      <div className="flex flex-col items-center justify-center w-full max-w-3xl px-4 flex-grow">
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
            <Sparkles className="h-36 w-36" />
          </Button>
        )}
      </div>
      <audio ref={audioRef} className="hidden" />

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