import React, { useState, useEffect } from 'react';
import { useSession } from '@/components/SessionContextProvider';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { PlusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

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
              <Button
                key={conv.id}
                variant="ghost"
                className={cn(
                  'w-full justify-start h-auto py-2',
                  selectedConversationId === conv.id && 'bg-accent text-accent-foreground'
                )}
                onClick={() => onSelectConversation(conv.id)}
              >
                <span className="truncate block text-left">
                  {conv.title || 'Untitled Chat'}
                </span>
              </Button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
};