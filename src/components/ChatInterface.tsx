import React, { useRef, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { MarkdownRenderer } from './MarkdownRenderer';
import { motion } from 'framer-motion';
import { Button } from './ui/button';
import { Copy, ThumbsDown, ThumbsUp } from 'lucide-react';
import { toast } from 'sonner';

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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  };

  return (
    <ScrollArea className="w-full flex-grow">
      <div className="p-4 space-y-6 max-w-3xl mx-auto w-full">
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
                'flex items-start gap-3',
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              <div
                className={cn(
                  'p-3 rounded-lg max-w-sm md:max-w-md lg:max-w-2xl',
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                )}
              >
                <MarkdownRenderer content={msg.parts[0].text || '...'} />
                {msg.role === 'model' && msg.parts[0].text && (
                  <div className="flex items-center gap-1 mt-2 text-muted-foreground">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleCopy(msg.parts[0].text)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <ThumbsUp className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <ThumbsDown className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </motion.div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
    </ScrollArea>
  );
};