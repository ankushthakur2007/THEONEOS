import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MadeWithDyad } from '@/components/made-with-dyad';
import { useSession } from '@/components/SessionContextProvider';
import VoiceInputModal from '@/components/VoiceInputModal'; // New import

const Home: React.FC = () => {
  const { supabase } = useSession();
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedText, setRecordedText] = useState('');

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error logging out:', error.message);
    }
    // The SessionContextProvider will handle the redirect to /login
  };

  const handleStartVoiceInput = () => {
    setIsVoiceModalOpen(true);
    // Placeholder for actual voice recording logic
    // For now, we'll simulate recording
    setIsRecording(true);
    setRecordedText('');
    setTimeout(() => {
      setIsRecording(false);
      setRecordedText("This is a simulated voice input. Actual speech-to-text coming soon!");
    }, 3000); // Simulate 3 seconds of recording
  };

  const handleStopRecording = () => {
    setIsRecording(false);
    // In a real scenario, this would stop the microphone and process the audio
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <div className="text-center space-y-6">
        <h1 className="text-5xl font-extrabold text-gray-900 dark:text-white">
          Welcome to <span className="text-blue-600">THEONEOS</span>
        </h1>
        <p className="text-xl text-gray-700 dark:text-gray-300 max-w-2xl mx-auto">
          Your cross-platform smart assistant. Get ready to interact with AI, control your devices, and manage your smart home.
        </p>
        <div className="flex justify-center space-x-4">
          <Button onClick={handleStartVoiceInput} className="px-8 py-4 text-lg">
            Start Voice Input
          </Button>
          <Button variant="outline" onClick={handleLogout} className="px-8 py-4 text-lg">
            Logout
          </Button>
        </div>
      </div>
      <MadeWithDyad />

      <VoiceInputModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        onStartRecording={handleStartVoiceInput} // This will restart the simulation
        onStopRecording={handleStopRecording}
        isRecording={isRecording}
        recordedText={recordedText}
      />
    </div>
  );
};

export default Home;