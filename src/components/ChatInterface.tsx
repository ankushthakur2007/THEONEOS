import React, { useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem } from '@/components/ui/form';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Send } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

interface ChatInterfaceProps {
  messages: ChatMessage[];
  processUserInput: (text: string) => Promise<any>;
  isThinking: boolean;
  isLoadingHistory: boolean;
}

const chatSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty'),
});

type ChatFormValues = z.infer<typeof chatSchema>;

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  messages,
  processUserInput,
  isThinking,
  isLoadingHistory,
}) => {
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const form = useForm<ChatFormValues>({
    resolver: zodResolver(chatSchema),
    defaultValues: { message: '' },
  });

  const onSubmit = async (values: ChatFormValues) => {
    await processUserInput(values.message);
    form.reset();
  };

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
    <div className="flex flex-col h-full w-full max-w-3xl mx-auto">
      <ScrollArea className="flex-grow" ref={scrollAreaRef}>
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
      <div className="p-4 border-t bg-background">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex gap-2">
            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem className="flex-grow">
                  <FormControl>
                    <Input
                      placeholder="Type your message..."
                      {...field}
                      disabled={isThinking || isLoadingHistory}
                      autoComplete="off"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <Button type="submit" disabled={isThinking || isLoadingHistory}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
};