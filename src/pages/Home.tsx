import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/SessionContextProvider';
import VoiceInputModal from '@/components/VoiceInputModal';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MessageSquare, Bot, User } from 'lucide-react';

interface Message {
  id: string;
  type: 'user' | 'ai';
  text: string;
  timestamp: string;
}

const Home: React.FC = () => {
  const { supabase, session } = useSession();
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error logging out:', error.message);
      toast.error('Failed to log out.');
    }
    // The SessionContextProvider will handle the redirect to /login
  };

  const handleOpenVoiceInput = () => {
    setIsVoiceModalOpen(true);
  };

  const playAudio = (audioBlob: Blob) => {
    if (audioRef.current) {
      const audioUrl = URL.createObjectURL(audioBlob);
      audioRef.current.src = audioUrl;
      audioRef.current.play().catch(e => console.error("Error playing audio:", e));
      audioRef.current.onended = () => {
        URL.revokeObjectURL(audioUrl); // Clean up the object URL
      };
    }
  };

  const handleTranscriptionComplete = async (text: string) => {
    setIsVoiceModalOpen(false);
    if (!text.trim()) {
      toast.info("No speech detected or transcription was empty.");
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString() + '-user',
      type: 'user',
      text: text,
      timestamp: new Date().toLocaleTimeString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoadingAI(true);
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
      const aiMessage: Message = {
        id: Date.now().toString() + '-ai',
        type: 'ai',
        text: aiText,
        timestamp: new Date().toLocaleTimeString(),
      };
      setMessages((prev) => [...prev, aiMessage]);

      // 2. Call Eleven Labs TTS Edge Function
      const elevenLabsResponse = await supabase.functions.invoke('elevenlabs-tts', {
        body: { text: aiText },
      });

      if (elevenLabsResponse.error) {
        throw new Error(elevenLabsResponse.error.message);
      }

      // The response data is an ArrayBuffer, convert it to a Blob
      const audioBlob = new Blob([elevenLabsResponse.data], { type: 'audio/mpeg' });
      playAudio(audioBlob);

      // 3. Store interaction in Supabase
      if (session?.user?.id) {
        const { error: dbError } = await supabase.from('interactions').insert({
          user_id: session.user.id,
          input_text: text,
          response_text: aiText,
        });
        if (dbError) {
          console.error('Error saving interaction:', dbError.message);
          toast.error('Failed to save interaction history.');
        }
      }

      toast.dismiss(loadingToastId);
      toast.success("AI response received and audio playing!");

    } catch (error: any) {
      console.error('Error interacting with AI or TTS:', error);
      toast.dismiss(loadingToastId);
      toast.error(`Failed to get AI response: ${error.message}`);
    } finally {
      setIsLoadingAI(false);
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
                          <AvatarFallback><Bot className="h-5 w-5" /></AvatarFallback>
                        </Avatar>
                      )}
                      <div
                        className={`p-3 rounded-lg max-w-[70%] ${
                          msg.type === 'user'
                            ? 'bg-blue-500 text-white rounded-br-none'
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-bl-none'
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
                  {isLoadingAI && (
                    <div className="flex items-start gap-3 justify-start">
                      <Avatar>
                        <AvatarFallback><Bot className="h-5 w-5" /></AvatarFallback>
                      </Avatar>
                      <div className="p-3 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-bl-none">
                        <p className="text-sm italic">AI is typing...</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
            <div className="mt-4 flex justify-center">
              <Button onClick={handleOpenVoiceInput} className="px-8 py-4 text-lg" disabled={isLoadingAI}>
                {isLoadingAI ? "AI is Responding..." : "Start Voice Input"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <VoiceInputModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        onTranscriptionComplete={handleTranscriptionComplete}
      />
      <audio ref={audioRef} className="hidden" /> {/* Hidden audio element for playback */}
    </div>
  );
};

export default Home;