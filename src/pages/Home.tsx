import React, { useState, useEffect } from 'react';
import { useSession } from '@/components/SessionContextProvider';
import { useVoiceLoop } from '@/hooks/use-voice-loop';
import { JarvisSphere } from '@/components/JarvisSphere';
import { ChatInterface } from '@/components/ChatInterface';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { LogOut, Mic, Square, User, Settings as SettingsIcon, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

const Home: React.FC = () => {
  const { supabase, session } = useSession();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'voice' | 'chat'>('voice');
  
  const {
    isVoiceLoopActive,
    startVoiceLoop,
    stopVoiceLoop,
    isRecordingUser,
    isSpeakingAI,
    isThinkingAI,
    isLoadingHistory,
    currentInterimText,
    aiResponseText,
    messages,
    processUserInput,
  } = useVoiceLoop(supabase, session);

  useEffect(() => {
    if (mode === 'chat' && isVoiceLoopActive) {
      stopVoiceLoop();
    }
  }, [mode, isVoiceLoopActive, stopVoiceLoop]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const isThinking = isThinkingAI || isLoadingHistory;
  const displayText = isLoadingHistory ? "Loading conversation..." : (isSpeakingAI ? aiResponseText : currentInterimText);

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden animate-fade-in">
      <header className="p-4 flex justify-between items-center absolute top-0 left-0 right-0 z-10 bg-background/80 backdrop-blur-sm">
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

      <main className="flex-grow flex flex-col items-center justify-center text-center pt-16 pb-32">
        {mode === 'voice' ? (
          <div className="flex flex-col items-center justify-center space-y-6">
            <JarvisSphere
              isRecordingUser={isRecordingUser}
              isThinking={isThinking}
              isSpeaking={isSpeakingAI}
            />
            <div className="min-h-[6rem] w-full max-w-3xl flex items-center justify-center p-4">
              <p className={cn(
                "text-2xl md:text-3xl font-medium transition-opacity duration-300",
                displayText ? "opacity-100" : "opacity-0"
              )}>
                {displayText || "..."}
              </p>
            </div>
          </div>
        ) : (
          <ChatInterface
            messages={messages}
            processUserInput={processUserInput}
            isThinking={isThinking}
            isLoadingHistory={isLoadingHistory}
          />
        )}
      </main>

      <footer className="p-4 flex flex-col items-center space-y-4 absolute bottom-0 left-0 right-0 z-10">
        {mode === 'voice' && (
          <Button
            size="lg"
            className="rounded-full w-16 h-16"
            onClick={isVoiceLoopActive ? stopVoiceLoop : startVoiceLoop}
            disabled={isThinking}
          >
            {isVoiceLoopActive ? <Square className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
          </Button>
        )}
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(value) => {
            if (value) setMode(value as 'voice' | 'chat');
          }}
          className="bg-muted p-1 rounded-full shadow-md"
          disabled={isThinking}
        >
          <ToggleGroupItem value="voice" aria-label="Voice mode">
            <Mic className="h-4 w-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="chat" aria-label="Chat mode">
            <MessageSquare className="h-4 w-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </footer>
    </div>
  );
};

export default Home;