import React, { useRef, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { MarkdownRenderer } from './MarkdownRenderer';
import { motion } from 'framer-motion';

interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

interface ChatInterfaceProps {
  messages: ChatMessage[];
  isLoadingHistory: boolean;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  messages,
  isLoadingHistory,
}) => {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport) {
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages]);

  return (
    <ScrollArea className="w-full max-w-3xl mx-auto flex-grow" ref={scrollAreaRef} viewportRef={viewportRef}>
      <div className="p-4 space-y-4">
        {isLoadingHistory ? (
          <div className="space-y-4">
            <Skeleton className="h-16 w-3/4 animate-pulse" />
            <Skeleton className="h-16 w-3/4 ml-auto animate-pulse" />
            <Skeleton className="h-16 w-3/4 animate-pulse" />
          </div>
        ) : (
          messages.map((msg, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className={cn(
                'flex items-start gap-2',
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              <div
                className={cn(
                  'p-3 rounded-lg max-w-sm md:max-w-md lg:max-w-2xl shadow-sm',
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                )}
              >
                <MarkdownRenderer content={msg.parts[0].text} />
              </div>
            </motion.div>
          ))
        )}
      </div>
    </ScrollArea>
  );
};