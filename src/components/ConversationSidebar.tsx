import React, { useState, useEffect } from 'react';
import { useSession } from '@/components/SessionContextProvider';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { PlusCircle, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from 'sonner';

interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

interface ConversationSidebarProps {
  selectedConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  refreshKey: number;
}

export const ConversationSidebar: React.FC<ConversationSidebarProps> = ({
  selectedConversationId,
  onSelectConversation,
  onNewChat,
  refreshKey,
}) => {
  const { supabase, session } = useSession();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);

  useEffect(() => {
    const fetchConversations = async () => {
      if (!session?.user) return;
      setLoading(true);
      const { data, error } = await supabase
        .from('conversations')
        .select('id, title, updated_at')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Error fetching conversations:', error);
      } else {
        setConversations(data || []);
      }
      setLoading(false);
    };

    fetchConversations();
  }, [session, supabase, refreshKey]);

  const handleDeleteConversation = async () => {
    if (!conversationToDelete) return;

    const { error } = await supabase.rpc('delete_user_conversation', {
      p_conversation_id: conversationToDelete,
    });

    if (error) {
      toast.error(`Failed to delete chat: ${error.message}`);
    } else {
      toast.success('Chat deleted successfully.');
      setConversations(convs => convs.filter(c => c.id !== conversationToDelete));
      if (selectedConversationId === conversationToDelete) {
        onNewChat();
      }
    }
    setConversationToDelete(null);
  };

  return (
    <div className="h-full flex flex-col bg-muted/50">
      <div className="p-2 border-b">
        <Button onClick={onNewChat} className="w-full justify-start">
          <PlusCircle className="mr-2 h-4 w-4" />
          New Chat
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))
          ) : (
            conversations.map((conv) => (
              <div key={conv.id} className="flex items-center group pr-2">
                <Button
                  variant="ghost"
                  className={cn(
                    'w-full justify-start truncate',
                    selectedConversationId === conv.id && 'bg-accent text-accent-foreground'
                  )}
                  onClick={() => onSelectConversation(conv.id)}
                >
                  {conv.title || 'Untitled Chat'}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConversationToDelete(conv.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete this
                        conversation and all of its messages.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={() => setConversationToDelete(null)}>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDeleteConversation}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
};