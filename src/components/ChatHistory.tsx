import React, { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { User, Bot } from 'lucide-react';

interface Message {
  role: 'user' | 'model';
  parts: { text: string }[];
}

interface ChatHistoryProps {
  messages: Message[];
  isThinking: boolean;
}

export const ChatHistory: React.FC<ChatHistoryProps> = ({ messages, isThinking }) => {
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({
        top: scrollAreaRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages, isThinking]);

  return (
    <ScrollArea className="flex-grow w-full p-4" ref={scrollAreaRef}>
      <div className="flex flex-col space-y-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={cn(
              'flex items-start gap-3',
              message.role === 'user' ? 'justify-end' : 'justify-start'
            )}
          >
            {message.role === 'model' && (
              <div className="p-2 bg-primary rounded-full">
                <Bot className="h-6 w-6 text-primary-foreground" />
              </div>
            )}
            <Card
              className={cn(
                'max-w-lg',
                message.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted'
              )}
            >
              <CardContent className="p-3">
                <p>{message.parts[0].text}</p>
              </CardContent>
            </Card>
            {message.role === 'user' && (
              <div className="p-2 bg-muted rounded-full">
                <User className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}
        {isThinking && (
          <div className="flex items-start gap-3 justify-start">
            <div className="p-2 bg-primary rounded-full">
              <Bot className="h-6 w-6 text-primary-foreground" />
            </div>
            <Card className="bg-muted">
              <CardContent className="p-3 flex items-center space-x-2">
                <span className="w-2 h-2 bg-foreground rounded-full animate-pulse" style={{ animationDelay: '0s' }}></span>
                <span className="w-2 h-2 bg-foreground rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></span>
                <span className="w-2 h-2 bg-foreground rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></span>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </ScrollArea>
  );
};