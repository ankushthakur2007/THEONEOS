import React from 'react';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/SessionContextProvider';
import { X } from 'lucide-react';
import { useVoiceLoop } from '@/hooks/use-voice-loop';
import { WakeWordListener } from '@/components/WakeWordListener';

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
    displayMessage = "Say 'jarvis' to activate"; // Updated idle message
  };

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-900 text-white p-4">
      <div className="flex flex-col items-center justify-center w-full max-w-3xl px-4 flex-grow">
        {/* Conditional rendering for the visual states */}
        {!isVoiceLoopActive && !isSpeakingAI && (
          // Initial state: Single large ball
          <div className="relative w-48 h-48 rounded-full bg-blue-600 flex items-center justify-center animate-pulse">
            <span className="text-xl font-bold">THEONEOS</span>
          </div>
        )}

        {isVoiceLoopActive && !isSpeakingAI && (
          // Wake word detected / Listening / Thinking state: Three smaller balls
          <div className="flex space-x-4">
            <div className="w-24 h-24 rounded-full bg-blue-500 flex items-center justify-center animate-bounce-slow" style={{ animationDelay: '0s' }}></div>
            <div className="w-24 h-24 rounded-full bg-blue-500 flex items-center justify-center animate-bounce-slow" style={{ animationDelay: '0.2s' }}></div>
            <div className="w-24 h-24 rounded-full bg-blue-500 flex items-center justify-center animate-bounce-slow" style={{ animationDelay: '0.4s' }}></div>
          </div>
        )}

        {/* Text display for user input or AI thinking */}
        {(isVoiceLoopActive && (isRecordingUser || isThinkingAI)) && (
          <p className="text-2xl font-semibold text-gray-300 text-center mt-8">
            {displayMessage}
          </p>
        )}

        {/* AI Response Text (highlighted like subtitles) */}
        {isSpeakingAI && (
          <div className="text-center mt-8">
            <p className="text-4xl font-bold text-blue-400 animate-fade-in-up">
              {aiResponseText}
            </p>
          </div>
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

      {/* WakeWordListener is always active in the background */}
      <WakeWordListener onWake={startVoiceLoop} />
    </div>
  );
};

export default Home;