import React from 'react';
import { useSession } from '@/components/SessionContextProvider';
import { useVoiceLoop } from '@/hooks/use-voice-loop';
import { JarvisSphere } from '@/components/JarvisSphere';
import { Button } from '@/components/ui/button';
import { LogOut, Mic, Square } from 'lucide-react';
import { cn } from '@/lib/utils';

const Home: React.FC = () => {
  const { supabase, session } = useSession();
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
    audioRef,
  } = useVoiceLoop(supabase, session);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const isThinking = isThinkingAI || isSearchingAI;
  const displayText = isSpeakingAI ? aiResponseText : currentInterimText;

  return (
    <div className="dark flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <header className="p-4 flex justify-between items-center absolute top-0 left-0 right-0 z-10">
        <h1 className="text-xl font-bold">JARVIS</h1>
        <Button variant="ghost" size="icon" onClick={handleSignOut}>
          <LogOut className="h-5 w-5" />
        </Button>
      </header>

      <main className="flex-grow flex flex-col items-center justify-center text-center p-4">
        <div className="flex-grow flex items-center justify-center">
          <JarvisSphere
            isRecordingUser={isRecordingUser}
            isThinking={isThinking}
            isSpeaking={isSpeakingAI}
          />
        </div>

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

      <audio ref={audioRef} className="hidden" />
    </div>
  );
};

export default Home;