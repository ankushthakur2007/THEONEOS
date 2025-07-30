import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "https://esm.sh/@google/generative-ai@0.15.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-conversation-id',
  'Access-Control-Expose-Headers': 'x-conversation-id',
};

const systemInstructionText = `You are JARVIS — an intelligent, voice-powered assistant. Your personality should be: {{personality}}.

Act like a normal, thoughtful person who’s knowledgeable but doesn’t write like a robot. I want your responses to feel conversational, relatable, and human. Not like a formal essay or a customer support script.

Please avoid the following common mistakes:

- Don’t follow the same rigid structure in every reply (intro, bullets, summary).
- Don’t over-explain. Be concise when the answer is simple.
- Avoid using repetitive connectors like “however,” “on the other hand,” or “nevertheless” too much.
- Keep the tone balanced, not overly cheerful or overly formal.
- Don’t confidently state anything you’re unsure about. If something might be wrong, say so.
- Don’t flatter me unnecessarily. Keep it real.
- If you're speaking aloud (voice mode), don’t overuse unnatural filler sounds like “umm” or dramatic pauses.
- Try to use natural expressions and regional or cultural nuance when appropriate.
- Be sensitive to subtle context. Don’t miss the point or default to generic answers.
- Avoid em dashes.

You must always respond using Markdown format.
---
🧠 Relevant Memories:
Based on the user's query, here are some relevant past interactions or facts you should consider. If none are provided, you have no relevant memories.
---
{{memories}}
---
📜 Recent Conversation History:
Here are the last few messages from your most recent conversation with the user.
---
{{recent_messages}}
---
`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, conversationId: initialConversationId } = await req.json();
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');

    if (!geminiApiKey) throw new Error('Gemini API key not set.');

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const authHeader = req.headers.get('Authorization')!;
    const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!user) throw new Error('User not authenticated.');

    const { data: prefsData, error: prefsError } = await supabaseAdmin
      .from('user_preferences')
      .select('prefs')
      .eq('user_id', user.id)
      .single();

    if (prefsError && prefsError.code !== 'PGRST116') throw prefsError;
    const personality = (prefsData?.prefs as any)?.ai_personality || 'A helpful and friendly assistant.';

    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const chatModel = genAI.getGenerativeModel({ model: "gemini-pro" });
    const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });

    const embeddingResult = await embeddingModel.embedContent(prompt);
    const queryEmbedding = embeddingResult.embedding.values;

    const { data: memories, error: memoriesError } = await supabaseAdmin.rpc('match_memories', {
      query_embedding: queryEmbedding,
      match_threshold: 0.75,
      match_count: 5,
      requesting_user_id: user.id,
    });
    if (memoriesError) throw memoriesError;

    const memoryText = memories.length > 0
      ? memories.map((m: any) => `- ${m.memory_text}`).join('\n')
      : 'No relevant memories found.';

    let recentMessagesText = 'No recent conversations found.';
    if (initialConversationId) {
      const { data: lastMessages } = await supabaseAdmin
        .from('messages')
        .select('role, content')
        .eq('conversation_id', initialConversationId)
        .order('created_at', { ascending: false })
        .limit(4);
      if (lastMessages && lastMessages.length > 0) {
        recentMessagesText = lastMessages.reverse().map((m: any) => `${m.role}: ${m.content}`).join('\n');
      }
    }

    const finalSystemInstruction = systemInstructionText
      .replace('{{memories}}', memoryText)
      .replace('{{personality}}', personality)
      .replace('{{recent_messages}}', recentMessagesText);

    let conversationId = initialConversationId;
    if (!conversationId) {
      const { data: newConversation, error: convError } = await supabaseAdmin
        .from('conversations')
        .insert({ user_id: user.id, title: prompt.substring(0, 50) })
        .select('id').single();
      if (convError) throw convError;
      conversationId = newConversation.id;
    }

    await supabaseAdmin.from('messages').insert({ conversation_id: conversationId, role: 'user', content: prompt });

    const { data: messages, error: messagesError } = await supabaseAdmin
      .from('messages').select('role, content').eq('conversation_id', conversationId)
      .order('created_at', { ascending: false }).limit(10);
    if (messagesError) throw messagesError;

    const history = messages.reverse().map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    }));
    if (history.length > 0 && history[0].role === 'model') history.shift();

    const chat = chatModel.startChat({
      history: history.slice(0, -1),
      systemInstruction: { role: 'system', parts: [{ text: finalSystemInstruction }] },
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ],
    });

    const result = await chat.sendMessageStream(prompt);

    const stream = new ReadableStream({
      async start(controller) {
        let fullText = "";
        for await (const chunk of result.stream) {
          const chunkText = chunk.text();
          controller.enqueue(new TextEncoder().encode(chunkText));
          fullText += chunkText;
        }

        await supabaseAdmin.from('messages').insert({ conversation_id: conversationId, role: 'model', content: fullText });
        await supabaseAdmin.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);

        const newMemoryText = `User asked: "${prompt}". JARVIS responded: "${fullText}"`;
        const memoryEmbeddingResult = await embeddingModel.embedContent(newMemoryText);
        const newMemoryEmbedding = memoryEmbeddingResult.embedding.values;

        await supabaseAdmin.from('user_memories').insert({
          user_id: user.id,
          memory_text: newMemoryText,
          embedding: newMemoryEmbedding,
        });

        controller.close();
      },
    });

    const responseHeaders = { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8', 'X-Conversation-Id': conversationId };
    return new Response(stream, { headers: responseHeaders, status: 200 });

  } catch (error) {
    console.error('Error in Gemini chat function:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});