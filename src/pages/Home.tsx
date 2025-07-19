import React from 'react';
import { useSession } from '@/components/SessionContextProvider';
import { useVoiceLoop } from '@/hooks/use-voice-loop';
import { ChatHistory } from '@/components/ChatHistory';
import { ChatInput } from '@/components/ChatInput';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

const Home: React.FC = () => {
  const { supabase, session } = useSession();
  const {
    isVoiceLoopActive,
    startVoiceLoop,
    stopVoiceLoop,
    isThinkingAI,
    isSearchingAI,
    audioRef,
    processUserInput,
    messages,
  } = useVoiceLoop(supabase, session);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const handleSendMessage = async (message: string) => {
    if (message) {
      await processUserInput(message);
    }
  };

  const isThinking = isThinkingAI || isSearchingAI;

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="p-4 border-b flex justify-between items-center">
        <h1 className="text-xl font-bold">Jarvis</h1>
        <Button variant="ghost" size="icon" onClick={handleSignOut}>
          <LogOut className="h-5 w-5" />
        </Button>
      </header>
      <main className="flex-grow flex flex-col overflow-hidden">
        <ChatHistory messages={messages} isThinking={isThinking} />
        <ChatInput
          onSendMessage={handleSendMessage}
          isVoiceLoopActive={isVoiceLoopActive}
          startVoiceLoop={startVoiceLoop}
          stopVoiceLoop={stopVoiceLoop}
          isThinking={isThinking}
        />
      </main>
      <audio ref={audioRef} className="hidden" />
    </div>
  );
};

export default Home;