import React, { useRef, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

interface ChatInterfaceProps {
  messages: ChatMessage[];
  isThinking: boolean;
  isLoadingHistory: boolean;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  messages,
  isThinking,
  isLoadingHistory,
}) => {
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollElement = scrollAreaRef.current.querySelector('div');
      if (scrollElement) {
        scrollElement.scrollTo({
          top: scrollElement.scrollHeight,
          behavior: 'smooth',
        });
      }
    }
  }, [messages, isThinking]);

  return (
    <ScrollArea className="w-full max-w-3xl mx-auto flex-grow" ref={scrollAreaRef}>
      <div className="p-4 space-y-4">
        {isLoadingHistory ? (
          <div className="space-y-4">
            <Skeleton className="h-16 w-3/4 animate-pulse" />
            <Skeleton className="h-16 w-3/4 ml-auto animate-pulse" />
            <Skeleton className="h-16 w-3/4 animate-pulse" />
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={index}
              className={cn(
                'flex items-end gap-2 animate-fade-in',
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              <div
                className={cn(
                  'p-3 rounded-lg max-w-sm md:max-w-md shadow-sm',
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                )}
              >
                <p className="whitespace-pre-wrap">{msg.parts[0].text}</p>
              </div>
            </div>
          ))
        )}
        {isThinking && (
          <div className="flex items-end gap-2 justify-start animate-fade-in">
            <div className="p-3 rounded-lg bg-muted shadow-sm">
              <p className="text-muted-foreground">Thinking...</p>
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
};