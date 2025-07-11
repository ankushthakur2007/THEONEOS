import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/SessionContextProvider';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MessageSquare, Mic, StopCircle, User } from 'lucide-react';
import AudioVisualizer from '@/components/AudioVisualizer'; // New import

interface Message {
  id: string;
  type: 'user' | 'ai';
  text: string;
  timestamp: string;
}

const Home: React.FC = () => {
  const { supabase, session } = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isRecordingUser, setIsRecordingUser] = useState(false);
  const [isSpeakingAI, setIsSpeakingAI] = useState(false);
  const [currentInterimText, setCurrentInterimText] = useState('');
  const finalTranscriptionRef = useRef<string>('');
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom of messages
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages, currentInterimText]);

  // Initialize Speech Recognition
  useEffect(() => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      toast.error("Speech recognition is not supported in your browser. Please try Chrome or Edge.");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    const recognition = recognitionRef.current;

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsRecordingUser(true);
      setCurrentInterimText('');
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
    };

    recognition.onend = () => {
      setIsRecordingUser(false);
      const finalTranscribedText = finalTranscriptionRef.current.trim();
      if (finalTranscribedText) {
        handleTranscriptionComplete(finalTranscribedText);
      } else {
        toast.info("No speech detected.");
      }
      finalTranscriptionRef.current = '';
      setCurrentInterimText('');
    };

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, []);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error logging out:', error.message);
      toast.error('Failed to log out.');
    }
  };

  const handleStartRecording = () => {
    if (recognitionRef.current && !isRecordingUser && !isSpeakingAI) {
      try {
        recognitionRef.current.start();
      } catch (error) {
        console.error("Error starting speech recognition:", error);
        toast.error("Failed to start voice input. Ensure microphone is connected and permissions are granted.");
        setIsRecordingUser(false);
      }
    } else if (isRecordingUser) {
      recognitionRef.current?.stop();
    }
  };

  const playAudio = (audioUrl: string) => {
    if (audioRef.current) {
      audioRef.current.src = audioUrl;
      setIsSpeakingAI(true);
      audioRef.current.play().catch(e => {
        console.error("Error playing audio:", e);
        toast.error(`Audio playback failed: ${e.message}. Check console for details.`);
        setIsSpeakingAI(false);
      });
      audioRef.current.onended = () => {
        setIsSpeakingAI(false);
      };
      audioRef.current.onerror = () => {
        setIsSpeakingAI(false);
      };
    }
  };

  const handleTranscriptionComplete = async (text: string) => {
    const userMessage: Message = {
      id: Date.now().toString() + '-user',
      type: 'user',
      text: text,
      timestamp: new Date().toLocaleTimeString(),
    };
    setMessages((prev) => [...prev, userMessage]);
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
      playAudio(audioUrl); // Start playing audio immediately

      // Add AI response to messages after audio starts
      const aiMessage: Message = {
        id: Date.now().toString() + '-ai',
        type: 'ai',
        text: aiText,
        timestamp: new Date().toLocaleTimeString(),
      };
      setMessages((prev) => [...prev, aiMessage]);

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
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <div className="text-center space-y-6 w-full max-w-3xl">
        <h1 className="text-5xl font-extrabold text-gray-900 dark:text-white">
          Welcome to <span className="text-blue-600">THEONEOS</span>
        </h1>
        <p className="text-xl text-gray-700 dark:text-gray-300 max-w-2xl mx-auto">
          Your cross-platform smart assistant. Interact with AI, control your devices, and manage your smart home.
        </p>

        <Card className="w-full max-w-3xl mx-auto mt-8">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-2xl font-bold">
              <MessageSquare className="inline-block mr-2" /> Conversation
            </CardTitle>
            <Button variant="outline" onClick={handleLogout} className="text-lg">
              Logout
            </Button>
          </CardHeader>
          <CardContent className="pt-4">
            <ScrollArea className="h-[400px] w-full rounded-md border p-4 bg-background">
              <div ref={scrollAreaRef} className="h-full overflow-y-auto pr-2"> {/* Inner div for scrolling */}
                {messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
                    Start by speaking to the AI!
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex items-start gap-3 ${
                          msg.type === 'user' ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        {msg.type === 'ai' && (
                          <Avatar>
                            <AvatarFallback>AI</AvatarFallback>
                          </Avatar>
                        )}
                        <div
                          className={`p-3 rounded-lg max-w-[70%] ${
                            msg.type === 'user'
                              ? 'bg-blue-500 text-white rounded-br-none'
                              : 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200 rounded-bl-none'
                          }`}
                        >
                          <p className="text-sm">{msg.text}</p>
                          <span className="block text-xs mt-1 opacity-75">
                            {msg.timestamp}
                          </span>
                        </div>
                        {msg.type === 'user' && (
                          <Avatar>
                            <AvatarFallback><User className="h-5 w-5" /></AvatarFallback>
                          </Avatar>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
            <div className="mt-4 flex flex-col items-center justify-center space-y-4">
              {currentInterimText && (
                <p className="text-lg text-gray-800 dark:text-gray-200 text-center px-4 min-h-[2rem]">
                  {currentInterimText}
                </p>
              )}
              {(isRecordingUser || isSpeakingAI) && (
                <AudioVisualizer isAnimating={true} className="h-10 w-40" />
              )}
              <Button
                variant="default"
                size="icon"
                className={`w-20 h-20 rounded-full transition-all duration-300 ${
                  isRecordingUser ? 'bg-red-500 hover:bg-red-600 animate-pulse' : ''
                } ${isSpeakingAI ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={handleStartRecording}
                disabled={isSpeakingAI}
              >
                {isRecordingUser ? (
                  <StopCircle className="h-10 w-10" />
                ) : (
                  <Mic className="h-10 w-10" />
                )}
              </Button>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {isRecordingUser ? "Tap to stop recording" : (isSpeakingAI ? "AI is speaking..." : "Tap to speak")}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <audio ref={audioRef} className="hidden" />
    </div>
  );
};

export default Home;