import React, { useState, useEffect, useRef } from 'react';
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
import { LogOut, Mic, Send, User, Settings as SettingsIcon, PanelLeftClose, PanelLeftOpen, Trash2, Edit2, Paperclip, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { ConversationSidebar } from '@/components/ConversationSidebar';
import { useIsMobile } from '@/hooks/use-mobile';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import TextareaAutosize from 'react-textarea-autosize';

const chatSchema = z.object({ message: z.string() });
type ChatFormValues = z.infer<typeof chatSchema>;

const Home: React.FC = () => {
  const { supabase, session } = useSession();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<{ first_name: string } | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [refreshSidebarKey, setRefreshSidebarKey] = useState(0);
  const isMobile = useIsMobile();
  const [isSidebarOpen, setIsSidebarOpen] = useState(!isMobile);
  const [conversationTitle, setConversationTitle] = useState('New Chat');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [originalTitle, setOriginalTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { processUserInput, isThinkingAI, messages, isLoadingHistory } = useAIInteraction(
    supabase, session, selectedConversationId,
    (id) => {
      setSelectedConversationId(id);
      setRefreshSidebarKey(prev => prev + 1);
    }
  );

  const form = useForm<ChatFormValues>({
    resolver: zodResolver(chatSchema),
    defaultValues: { message: '' },
  });

  const { startListening, stopListening, isListening } = useSpeechRecognition({
    onTranscriptChange: (transcript) => form.setValue('message', transcript, { shouldValidate: true }),
    onError: (error) => toast.error(`Voice input error: ${error}`),
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.size > 5 * 1024 * 1024) { // 5MB limit
        toast.error("File is too large. Please select a file smaller than 5MB.");
        return;
      }
      setFile(selectedFile);
      if (selectedFile.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => setFilePreview(reader.result as string);
        reader.readAsDataURL(selectedFile);
      } else {
        setFilePreview(null);
      }
    }
  };

  const handleRemoveFile = () => {
    setFile(null);
    setFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleAttachmentClick = () => fileInputRef.current?.click();

  useEffect(() => {
    const fetchConversationTitle = async () => {
      if (!selectedConversationId || !session?.user) {
        setConversationTitle('New Chat');
        setIsEditingTitle(false);
        return;
      }
      const { data, error } = await supabase.from('conversations').select('title').eq('id', selectedConversationId).single();
      if (error) {
        toast.error('Could not load conversation title.');
        setConversationTitle('Untitled Chat');
      } else if (data) {
        const title = data.title || 'Untitled Chat';
        setConversationTitle(title);
        setOriginalTitle(title);
      }
    };
    fetchConversationTitle();
  }, [selectedConversationId, session, supabase, refreshSidebarKey]);

  const handleTitleSave = async () => {
    if (!selectedConversationId) return;
    const newTitle = conversationTitle.trim();
    if (!newTitle) {
      toast.error("Title cannot be empty.");
      setConversationTitle(originalTitle);
      setIsEditingTitle(false);
      return;
    }
    setIsEditingTitle(false);
    if (newTitle === originalTitle) return;
    const { error } = await supabase.from('conversations').update({ title: newTitle }).eq('id', selectedConversationId);
    if (error) {
      toast.error(`Failed to rename chat: ${error.message}`);
      setConversationTitle(originalTitle);
    } else {
      toast.success('Chat renamed successfully.');
      setOriginalTitle(newTitle);
      setRefreshSidebarKey(prev => prev + 1);
    }
  };

  const handleTextSubmit = async (values: ChatFormValues) => {
    if (isListening) stopListening();
    if (values.message.trim() || file) {
      await processUserInput(values.message.trim(), file);
      form.reset({ message: '' });
      handleRemoveFile();
    }
  };

  const handleMicClick = () => {
    if (isListening) {
      stopListening();
      const currentTranscript = form.getValues('message');
      if (currentTranscript.trim()) handleTextSubmit({ message: currentTranscript });
    } else {
      form.reset({ message: '' });
      startListening();
    }
  };

  useEffect(() => {
    const fetchInitialData = async () => {
      if (session?.user) {
        const { data: profileData } = await supabase.from('profiles').select('first_name').eq('id', session.user.id).single();
        setProfile(profileData);
        const { data: convData } = await supabase.from('conversations').select('id').eq('user_id', session.user.id).order('updated_at', { ascending: false }).limit(1).single();
        if (convData) setSelectedConversationId(convData.id);
      }
    };
    fetchInitialData();
  }, [session, supabase]);

  const handleSignOut = async () => { await supabase.auth.signOut(); };
  const handleNewChat = () => { setSelectedConversationId(null); if (isMobile) setIsSidebarOpen(false); };
  const handleSelectConversation = (id: string) => { setSelectedConversationId(id); if (isMobile) setIsSidebarOpen(false); };

  const handleDeleteCurrentConversation = async () => {
    if (!selectedConversationId) return;
    const { error } = await supabase.rpc('delete_user_conversation', { p_conversation_id: selectedConversationId });
    if (error) toast.error(`Failed to delete chat: ${error.message}`);
    else {
      toast.success('Chat deleted successfully.');
      handleNewChat();
      setRefreshSidebarKey(prev => prev + 1);
    }
  };

  useEffect(() => { setIsSidebarOpen(!isMobile); }, [isMobile]);

  const sidebarContent = <ConversationSidebar selectedConversationId={selectedConversationId} onSelectConversation={handleSelectConversation} onNewChat={handleNewChat} refreshKey={refreshSidebarKey} />;

  const mainContent = (
    <div className="flex flex-col h-full bg-background">
      <main className="flex-1 flex flex-col overflow-hidden">
        {messages.length === 0 && !isLoadingHistory ? (
          <div className="flex-1 flex flex-col justify-center items-center text-center p-4 animate-slide-up-fade">
            <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-6 animate-pulse-glow">
              <h1 className="text-5xl font-bold text-primary tracking-tighter">J</h1>
            </div>
            <p className="text-3xl font-medium text-foreground">How can I help you today, {profile?.first_name || 'friend'}?</p>
          </div>
        ) : (
          <ChatInterface messages={messages} isLoadingHistory={isLoadingHistory} conversationId={selectedConversationId} />
        )}
      </main>
      <footer className="p-4 w-full max-w-3xl mx-auto shrink-0 bg-transparent">
        {file && (
          <div className="relative mb-2 p-2 border rounded-lg bg-muted/50 flex items-center gap-3 animate-slide-up-fade">
            {filePreview ? (
              <img src={filePreview} alt="File preview" className="h-12 w-12 rounded object-cover" />
            ) : (
              <div className="h-12 w-12 bg-muted rounded flex items-center justify-center">
                <Paperclip className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <div className="text-sm text-muted-foreground truncate flex-1">
              {file.name}
              <div className="text-xs">{(file.size / 1024).toFixed(2)} KB</div>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleRemoveFile}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleTextSubmit)} className="relative">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*,application/pdf,.doc,.docx,.txt" />
            <FormField control={form.control} name="message" render={({ field }) => (
              <FormItem>
                <FormControl>
                  <TextareaAutosize
                    placeholder="Message JARVIS..."
                    className="w-full rounded-2xl p-4 pr-32 resize-none bg-muted border-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-all"
                    {...field}
                    disabled={isThinkingAI || isLoadingHistory || isListening}
                    autoComplete="off" maxRows={6}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.handleSubmit(handleTextSubmit)(); } }}
                  />
                </FormControl>
              </FormItem>
            )} />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <Button type="button" size="icon" variant="ghost" onClick={handleAttachmentClick} disabled={isThinkingAI || isLoadingHistory || isListening}><Paperclip /></Button>
              <Button type="button" size="icon" variant="ghost" onClick={handleMicClick} disabled={isThinkingAI || isLoadingHistory}><Mic className={isListening ? "text-red-500 animate-pulse" : ""} /></Button>
              <Button type="submit" size="icon" variant="ghost" disabled={isThinkingAI || isLoadingHistory || isListening || (!form.watch('message') && !file)}><Send /></Button>
            </div>
          </form>
        </Form>
      </footer>
    </div>
  );

  return (
    <div className="flex flex-col h-dvh bg-background text-foreground">
      <header className="p-2 flex justify-between items-center z-10 bg-background/70 backdrop-blur-xl shrink-0 border-b sticky top-0">
        <div className="flex items-center gap-2 min-w-0">
          {isMobile ? (
            <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
              <SheetTrigger asChild><Button variant="ghost" size="icon"><PanelLeftOpen /></Button></SheetTrigger>
              <SheetContent side="left" className="p-0 w-80 bg-background/95 backdrop-blur-sm"><SheetHeader><SheetTitle className="p-4 text-left text-lg font-semibold tracking-tight">Conversations</SheetTitle></SheetHeader>{sidebarContent}</SheetContent>
            </Sheet>
          ) : (
            <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>{isSidebarOpen ? <PanelLeftClose /> : <PanelLeftOpen />}</Button>
          )}
          {isEditingTitle ? (
            <Input value={conversationTitle} onChange={(e) => setConversationTitle(e.target.value)} onBlur={handleTitleSave} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleTitleSave(); } if (e.key === 'Escape') { setIsEditingTitle(false); setConversationTitle(originalTitle); } }} className="h-9 text-lg font-semibold bg-transparent" autoFocus />
          ) : (
            <h1 className="text-lg font-semibold truncate" title={conversationTitle}>{conversationTitle}</h1>
          )}
          {selectedConversationId && !isEditingTitle && (<Button variant="ghost" size="icon" onClick={() => setIsEditingTitle(true)} className="shrink-0"><Edit2 className="h-4 w-4" /></Button>)}
        </div>
        <div className="flex items-center gap-2 pr-2">
          {selectedConversationId && (
            <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10"><Trash2 className="h-5 w-5" /></Button></AlertDialogTrigger>
              <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone. This will permanently delete this conversation and all of its messages.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDeleteCurrentConversation} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
            </AlertDialog>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><User className="h-5 w-5" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end"><DropdownMenuLabel>My Account</DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuItem onClick={() => navigate('/settings')}><SettingsIcon className="mr-2 h-4 w-4" /><span>Settings</span></DropdownMenuItem><DropdownMenuItem onClick={handleSignOut}><LogOut className="mr-2 h-4 w-4" /><span>Log out</span></DropdownMenuItem></DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      {isMobile ? (
        <div className="flex-1 overflow-hidden">{mainContent}</div>
      ) : (
        <ResizablePanelGroup direction="horizontal" className="flex-1 overflow-hidden">
          {isSidebarOpen && (<><ResizablePanel defaultSize={20} minSize={15} maxSize={30}>{sidebarContent}</ResizablePanel><ResizableHandle withHandle /></>)}
          <ResizablePanel>{mainContent}</ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  );
};

export default Home;