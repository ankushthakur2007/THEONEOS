import React, { useState, useEffect } from 'react';
import { useSession } from '@/components/SessionContextProvider';
import { useAIInteraction } from '@/hooks/use-ai-interaction';
import { useSpeechRecognition } from '@/hooks/use-speech-recognition';
import { ChatInterface } from '@/components/ChatInterface';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { LogOut, Mic, Send, User, Settings as SettingsIcon, PanelLeftClose, PanelLeftOpen, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { ConversationSidebar } from '@/components/ConversationSidebar';
import { useIsMobile } from '@/hooks/use-mobile';
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
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

const chatSchema = z.object({
  message: z.string(),
});
type ChatFormValues = z.infer<typeof chatSchema>;

const Home: React.FC = () => {
  const { supabase, session } = useSession();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<{ first_name: string } | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [refreshSidebarKey, setRefreshSidebarKey] = useState(0);
  const isMobile = useIsMobile();
  const [isSidebarOpen, setIsSidebarOpen] = useState(!isMobile);

  const { processUserInput, isThinkingAI, messages, isLoadingHistory } = useAIInteraction(
    supabase,
    session,
    selectedConversationId,
    (id) => {
      setSelectedConversationId(id);
      setRefreshSidebarKey(prev => prev + 1); // Refresh sidebar when new chat is created
    }
  );

  const form = useForm<ChatFormValues>({
    resolver: zodResolver(chatSchema),
    defaultValues: { message: '' },
  });

  const { startListening, stopListening, isListening } = useSpeechRecognition({
    onTranscriptChange: (transcript) => {
      form.setValue('message', transcript, { shouldValidate: true });
    },
    onError: (error) => {
      toast.error(`Voice input error: ${error}`);
    },
  });

  const handleTextSubmit = async (values: ChatFormValues) => {
    if (isListening) {
      stopListening();
    }
    if (values.message.trim()) {
      await processUserInput(values.message.trim());
      form.reset({ message: '' });
    }
  };

  const handleMicClick = () => {
    if (isListening) {
      stopListening();
    } else {
      form.reset({ message: '' });
      startListening();
    }
  };

  useEffect(() => {
    const fetchInitialData = async () => {
      if (session?.user) {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('first_name')
          .eq('id', session.user.id)
          .single();
        if (profileError && profileError.code !== 'PGRST116') {
          console.error('Error fetching profile:', profileError);
        } else {
          setProfile(profileData);
        }

        const { data: convData, error: convError } = await supabase
          .from('conversations')
          .select('id')
          .eq('user_id', session.user.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .single();
        
        if (convError && convError.code !== 'PGRST116') {
          console.error('Error fetching last conversation:', convError);
        } else if (convData) {
          setSelectedConversationId(convData.id);
        }
      }
    };
    fetchInitialData();
  }, [session, supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const handleNewChat = () => {
    setSelectedConversationId(null);
    if (isMobile) setIsSidebarOpen(false);
  };

  const handleSelectConversation = (id: string) => {
    setSelectedConversationId(id);
    if (isMobile) setIsSidebarOpen(false);
  };

  const handleDeleteCurrentConversation = async () => {
    if (!selectedConversationId) return;

    const { error } = await supabase.rpc('delete_user_conversation', {
      p_conversation_id: selectedConversationId,
    });

    if (error) {
      toast.error(`Failed to delete chat: ${error.message}`);
    } else {
      toast.success('Chat deleted successfully.');
      handleNewChat();
      setRefreshSidebarKey(prev => prev + 1);
    }
  };

  useEffect(() => {
    setIsSidebarOpen(!isMobile);
  }, [isMobile]);

  const isThinking = isThinkingAI || isLoadingHistory;

  const sidebarContent = (
    <ConversationSidebar
      selectedConversationId={selectedConversationId}
      onSelectConversation={handleSelectConversation}
      onNewChat={handleNewChat}
      refreshKey={refreshSidebarKey}
    />
  );

  const mainContent = (
    <div className="flex flex-col h-full">
      <main className="flex-1 flex flex-col overflow-hidden">
        {messages.length === 0 && !isThinking ? (
          <div className="flex-1 flex flex-col justify-center items-center text-center p-4">
            <h1 className="text-5xl font-bold mb-4 text-primary">
              THEONEOS
            </h1>
            <p className="text-xl text-muted-foreground">
              How can I help you today, {profile?.first_name || 'there'}?
            </p>
          </div>
        ) : (
          <ChatInterface
            messages={messages}
            isLoadingHistory={isLoadingHistory}
          />
        )}
      </main>

      <footer className="p-4 w-full max-w-3xl mx-auto shrink-0 bg-background">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleTextSubmit)} className="relative">
            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      placeholder="Message JARVIS..."
                      className="w-full rounded-full py-6 pl-6 pr-24 bg-muted border-muted-foreground/20 focus-visible:ring-primary"
                      {...field}
                      disabled={isThinking || isListening}
                      autoComplete="off"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <Button type="button" size="icon" variant="ghost" onClick={handleMicClick} disabled={isThinking}>
                <Mic className={isListening ? "text-red-500" : ""} />
              </Button>
              <Button type="submit" size="icon" variant="ghost" disabled={isThinking || isListening || !form.watch('message')}>
                <Send />
              </Button>
            </div>
          </form>
        </Form>
      </footer>
    </div>
  );

  return (
    <div className="flex flex-col h-dvh bg-background text-foreground animate-fade-in">
      <header className="p-4 flex justify-between items-center z-10 bg-background/80 backdrop-blur-sm shrink-0 border-b">
        <div className="flex items-center gap-2">
          {isMobile ? (
            <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <PanelLeftOpen />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-80">
                {sidebarContent}
              </SheetContent>
            </Sheet>
          ) : (
            <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
              {isSidebarOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
            </Button>
          )}
          <h1 className="text-xl font-bold">THEONEOS</h1>
        </div>
        <div className="flex items-center gap-2">
          {selectedConversationId && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-5 w-5" />
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
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteCurrentConversation} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <User className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/settings')}>
                <SettingsIcon className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {isMobile ? (
        <div className="flex-1 overflow-hidden">{mainContent}</div>
      ) : (
        <ResizablePanelGroup direction="horizontal" className="flex-1 overflow-hidden">
          {isSidebarOpen && (
            <>
              <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
                {sidebarContent}
              </ResizablePanel>
              <ResizableHandle withHandle />
            </>
          )}
          <ResizablePanel>
            {mainContent}
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  );
};

export default Home;