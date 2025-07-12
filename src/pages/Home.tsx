import React from 'react';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/SessionContextProvider';
import { Sparkles, X } from 'lucide-react';
import { useVoiceLoop } from '@/hooks/use-voice-loop';
import WakeWordListener from '@/components/WakeWordListener'; // New import

const Home: React.FC = () => {
  const { supabase, session } = useSession();
  const {
    isVoiceLoopActive,
    startVoiceLoop,
    stopVoiceLoop,
    isRecordingUser,
    isSpeakingAI,
    isThinkingAI,
    currentInterimText,
    aiResponseText,
    isRecognitionReady,
    audioRef,
  } = useVoiceLoop(supabase, session);

  // Determine the main status text to display
  let displayMessage: string;
  if (isRecordingUser) {
    displayMessage = currentInterimText || "Listening...";
  } else if (isThinkingAI) {
    displayMessage = "Thinking...";
  } else if (isSpeakingAI) {
    displayMessage = aiResponseText || "AI is speaking...";
  } else {
    displayMessage = "Tap to speak";
  };

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
            onClick={startVoiceLoop}
            disabled={!isRecognitionReady}
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
            onClick={stopVoiceLoop}
          >
            <X className="h-8 w-8" />
          </Button>
        </div>
      )}

      {/* Render WakeWordListener only when the voice loop is inactive */}
      {!isVoiceLoopActive && <WakeWordListener onWake={startVoiceLoop} />}
    </div>
  );
};

export default Home;