import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Mic, Send, Square } from 'lucide-react';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  isVoiceLoopActive: boolean;
  startVoiceLoop: () => void;
  stopVoiceLoop: () => void;
  isThinking: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  isVoiceLoopActive,
  startVoiceLoop,
  stopVoiceLoop,
  isThinking,
}) => {
  const [inputValue, setInputValue] = useState('');

  const handleSend = () => {
    if (inputValue.trim()) {
      onSendMessage(inputValue.trim());
      setInputValue('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  return (
    <div className="p-4 border-t w-full bg-background">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={isVoiceLoopActive ? stopVoiceLoop : startVoiceLoop}
          disabled={isThinking}
        >
          {isVoiceLoopActive ? <Square className="h-5 w-5 text-red-500" /> : <Mic className="h-5 w-5" />}
        </Button>
        <Input
          placeholder="Type a message or say 'jarvis'..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={isThinking || isVoiceLoopActive}
        />
        <Button onClick={handleSend} disabled={isThinking || !inputValue.trim()}>
          <Send className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
};