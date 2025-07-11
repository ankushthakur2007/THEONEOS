import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/SessionContextProvider';
import VoiceInputModal from '@/components/VoiceInputModal';
import { toast } from 'sonner';

const Home: React.FC = () => {
  const { supabase } = useSession();
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [transcribedText, setTranscribedText] = useState(''); // State to hold the transcribed text

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
    setTranscribedText(''); // Clear any previous transcription when opening the modal
  };

  const handleTranscriptionComplete = (text: string) => {
    setTranscribedText(text);
    console.log("Transcription completed:", text);
    toast.success(`Transcribed: "${text}"`);
    // You can now use this 'text' for further processing, e.g., sending it to an AI backend
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
          <Button onClick={handleOpenVoiceInput} className="px-8 py-4 text-lg">
            Start Voice Input
          </Button>
          <Button variant="outline" onClick={handleLogout} className="px-8 py-4 text-lg">
            Logout
          </Button>
        </div>
        {transcribedText && (
          <div className="mt-8 p-4 bg-white dark:bg-gray-800 rounded-lg shadow-md max-w-xl mx-auto">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">Last Transcribed Text:</h2>
            <p className="text-lg text-gray-700 dark:text-gray-300 italic">"{transcribedText}"</p>
          </div>
        )}
      </div>

      <VoiceInputModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        onTranscriptionComplete={handleTranscriptionComplete}
      />
    </div>
  );
};

export default Home;