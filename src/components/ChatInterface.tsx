import React, { useState, useRef, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { MarkdownRenderer } from './MarkdownRenderer';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from './ui/button';
import { Copy, ThumbsDown, ThumbsUp } from 'lucide-react';
import { toast } from 'sonner';
import { ChatMessage } from '@/hooks/use-ai-interaction';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/components/SessionContextProvider';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  isLoadingHistory: boolean;
  conversationId: string | null;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages, isLoadingHistory, conversationId }) => {
  const { session } = useSession();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isFeedbackDialogOpen, setIsFeedbackDialogOpen] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<ChatMessage | null>(null);
  const [feedbackType, setFeedbackType] = useState<'good' | 'bad' | null>(null);
  const [feedbackComment, setFeedbackComment] = useState('');

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  };

  const handleFeedbackClick = (message: ChatMessage, type: 'good' | 'bad') => {
    if (!message.id) {
      toast.error("Cannot provide feedback on a message that hasn't been saved yet.");
      return;
    }
    setFeedbackMessage(message);
    setFeedbackType(type);
    setIsFeedbackDialogOpen(true);
  };

  const handleSubmitFeedback = async () => {
    if (!feedbackMessage || !feedbackType || !conversationId || !feedbackMessage.id || !session?.user) return;
    const { error } = await supabase.from('message_feedback').insert({
      message_id: feedbackMessage.id, conversation_id: conversationId, user_id: session.user.id,
      feedback: feedbackType, comment: feedbackComment,
    });
    if (error) toast.error(`Failed to save feedback: ${error.message}`);
    else toast.success('Thanks for your feedback!');
    setIsFeedbackDialogOpen(false);
    setFeedbackComment('');
    setFeedbackMessage(null);
    setFeedbackType(null);
  };

  const messageVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <>
      <ScrollArea className="w-full flex-grow">
        <div className="p-4 space-y-4 max-w-3xl mx-auto w-full">
          {isLoadingHistory ? (
            <div className="space-y-4">
              <Skeleton className="h-16 w-3/4 rounded-2xl" />
              <Skeleton className="h-20 w-3/4 ml-auto rounded-2xl" />
              <Skeleton className="h-16 w-3/4 rounded-2xl" />
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {messages.map((msg, index) => (
                <motion.div
                  key={msg.id || `msg-${index}`}
                  variants={messageVariants}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  layout
                  className={cn('flex items-start gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}
                >
                  <div className={cn('p-3 rounded-2xl max-w-sm md:max-w-md lg:max-w-2xl',
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-lg'
                      : 'bg-muted text-foreground rounded-bl-lg'
                  )}>
                    <MarkdownRenderer content={msg.parts[0].text || '...'} invertInDarkMode={msg.role !== 'user'} />
                    {msg.role === 'model' && msg.parts[0].text && (
                      <div className="flex items-center gap-1 mt-2 text-muted-foreground/60">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleCopy(msg.parts[0].text)}><Copy className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleFeedbackClick(msg, 'good')}><ThumbsUp className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleFeedbackClick(msg, 'bad')}><ThumbsDown className="h-3.5 w-3.5" /></Button>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>
      <AlertDialog open={isFeedbackDialogOpen} onOpenChange={setIsFeedbackDialogOpen}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Provide Additional Feedback</AlertDialogTitle><AlertDialogDescription>Your feedback is valuable. Please share any additional thoughts to help JARVIS improve.</AlertDialogDescription></AlertDialogHeader><Textarea placeholder="Why was this response good or bad?" value={feedbackComment} onChange={(e) => setFeedbackComment(e.target.value)} /><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleSubmitFeedback}>Submit Feedback</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </>
  );
};