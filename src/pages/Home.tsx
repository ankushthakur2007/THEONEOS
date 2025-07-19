import React from 'react';
import { useSession } from '@/components/SessionContextProvider';
import { useVoiceLoop } from '@/hooks/use-voice-loop';
import { JarvisSphere } from '@/components/JarvisSphere';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { LogOut, Mic, Square, User, Settings as SettingsIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

const Home: React.FC = () => {
  const { supabase, session } = useSession();
  const navigate = useNavigate();
  const {
    isVoiceLoopActive,
    startVoiceLoop,
    stopVoiceLoop,
    isRecordingUser,
    isSpeakingAI,
    isThinkingAI,
    isSearchingAI,
    currentInterimText,
    aiResponseText,
  } = useVoiceLoop(supabase, session);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const isThinking = isThinkingAI || isSearchingAI;
  const displayText = isSpeakingAI ? aiResponseText : currentInterimText;

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <header className="p-4 flex justify-between items-center absolute top-0 left-0 right-0 z-10">
        <h1 className="text-xl font-bold">JARVIS</h1>
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

      <main className="flex-grow flex flex-col items-center justify-center text-center p-4 space-y-8">
        <JarvisSphere
          isRecordingUser={isRecordingUser}
          isThinking={isThinking}
          isSpeaking={isSpeakingAI}
        />

        <div className="h-24 w-full max-w-3xl flex items-center justify-center">
          <p className={cn(
            "text-2xl md:text-3xl font-medium transition-opacity duration-300",
            displayText ? "opacity-100" : "opacity-0"
          )}>
            {displayText || "..."}
          </p>
        </div>
      </main>

      <footer className="p-4 flex justify-center items-center absolute bottom-0 left-0 right-0 z-10">
        <Button
          size="lg"
          className="rounded-full w-16 h-16"
          onClick={isVoiceLoopActive ? stopVoiceLoop : startVoiceLoop}
          disabled={isThinking}
        >
          {isVoiceLoopActive ? <Square className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
        </Button>
      </footer>
    </div>
  );
};

export default Home;