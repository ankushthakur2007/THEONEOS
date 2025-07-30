import React, { useState, useEffect } from 'react';
import { useSession } from '@/components/SessionContextProvider';
import { useAIInteraction } from '@/hooks/use-ai-interaction';
import { useTextToSpeech } from '@/hooks/use-text-to-speech';
import { useContinuousSpeechRecognition } from '@/hooks/use-continuous-speech-recognition';
import { ChatInterface } from '@/components/ChatInterface';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { LogOut, Mic, Send, User, Settings as SettingsIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const chatSchema = z.object({
  message: z.string(),
});
type ChatFormValues = z.infer<typeof chatSchema>;

const Home: React.FC = () => {
  const { supabase, session } = useSession();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<{ first_name: string } | null>(null);

  const { speakAIResponse } = useTextToSpeech();
  const { processUserInput, isThinkingAI, messages, isLoadingHistory } = useAIInteraction(supabase, session, speakAIResponse);

  const handleFinalTranscript = async (transcript: string) => {
    if (transcript) {
      form.setValue('message', transcript);
      await processUserInput(transcript, { speak: true });
      form.reset();
    }
  };

  const { startListening, stopListening, isListening } = useContinuousSpeechRecognition(
    handleFinalTranscript,
    (error) => {
      toast.error(`Voice input error: ${error}`);
    }
  );

  const form = useForm<ChatFormValues>({
    resolver: zodResolver(chatSchema),
    defaultValues: { message: '' },
  });

  const handleTextSubmit = async (values: ChatFormValues) => {
    if (values.message) {
      await processUserInput(values.message, { speak: false });
      form.reset();
    }
  };

  const handleMicClick = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  useEffect(() => {
    const fetchProfile = async () => {
      if (session?.user) {
        const { data, error } = await supabase
          .from('profiles')
          .select('first_name')
          .eq('id', session.user.id)
          .single();
        if (error && error.code !== 'PGRST116') {
          console.error('Error fetching profile:', error);
        } else {
          setProfile(data);
        }
      }
    };
    fetchProfile();
  }, [session, supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const isThinking = isThinkingAI || isLoadingHistory;

  return (
    <div className="flex flex-col h-screen bg-background text-foreground animate-fade-in">
      <header className="p-4 flex justify-between items-center z-10 bg-background/80 backdrop-blur-sm shrink-0 border-b">
        <h1 className="text-xl font-bold">THEONEOS</h1>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <User className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/settings')}>
              <SettingsIcon className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <main className="flex-1 flex flex-col overflow-y-auto">
        {messages.length === 0 && !isThinking ? (
          <div className="flex-1 flex flex-col justify-center items-center text-center p-4">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold">
              Hi {profile?.first_name || 'there'}, what should we dive into today?
            </h2>
          </div>
        ) : (
          <ChatInterface
            messages={messages}
            isThinking={isThinkingAI}
            isLoadingHistory={isLoadingHistory}
          />
        )}
      </main>

      <footer className="p-4 w-full max-w-3xl mx-auto shrink-0 border-t bg-background">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleTextSubmit)} className="relative">
            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      placeholder="Message JARVIS..."
                      className="pr-20"
                      {...field}
                      disabled={isThinking || isListening}
                      autoComplete="off"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <Button type="button" size="icon" variant="ghost" onClick={handleMicClick} disabled={isThinking}>
                <Mic className={isListening ? "text-red-500" : ""} />
              </Button>
              <Button type="submit" size="icon" variant="ghost" disabled={isThinking || isListening}>
                <Send />
              </Button>
            </div>
          </form>
        </Form>
      </footer>
    </div>
  );
};

export default Home;