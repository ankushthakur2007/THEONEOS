import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Mic, StopCircle } from 'lucide-react';

interface VoiceInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  isRecording: boolean;
  recordedText: string;
}

const VoiceInputModal: React.FC<VoiceInputModalProps> = ({
  isOpen,
  onClose,
  onStartRecording,
  onStopRecording,
  isRecording,
  recordedText,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] p-6">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center">Voice Input</DialogTitle>
          <DialogDescription className="text-center text-gray-600 dark:text-gray-400">
            {isRecording ? "Listening..." : "Click the mic to start speaking."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center justify-center py-8 space-y-4">
          {isRecording ? (
            <Button
              variant="destructive"
              size="icon"
              className="w-24 h-24 rounded-full animate-pulse"
              onClick={onStopRecording}
            >
              <StopCircle className="h-12 w-12" />
            </Button>
          ) : (
            <Button
              variant="default"
              size="icon"
              className="w-24 h-24 rounded-full"
              onClick={onStartRecording}
            >
              <Mic className="h-12 w-12" />
            </Button>
          )}
          {recordedText && (
            <p className="mt-4 text-lg text-gray-800 dark:text-gray-200 text-center px-4">
              {recordedText}
            </p>
          )}
        </div>
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VoiceInputModal;