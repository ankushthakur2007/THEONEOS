import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "https://esm.sh/@google/generative-ai@0.15.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const systemInstructionText = `You are JARVIS — an intelligent, voice-powered assistant who talks to users and can optionally use external tools.
Your personality should be: {{personality}}.

You must always:
- Think before responding
- Determine if you can confidently answer yourself
- If not, use a tool

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
🛠️ You have access to one tool:

🔧 \`www.go.io\` — Google-powered internet search tool via Serper.dev.
Purpose: Use this when a user asks for **factual** or **real-time** information that may change frequently or is not built into your memory.
When using this tool for real-time data (e.g., weather, current events), formulate precise and concise queries that are likely to yield direct answers. For example, instead of "weather in Ludhiana", try "current weather Ludhiana".

Examples:
- Definitions (“what is a blockchain?”)
- Distances (“how far is Earth from Mars?”)
- Facts (“who is the CEO of OpenAI?”)
- Capital cities (“capital of Egypt”)
- Populations, temperatures, live data

---

🧠 When you detect that a search is needed, reply ONLY with this exact JSON format:

\`\`\`json
{
  "tool": "www.go.io",
  "params": {
    "query": "..." // exact search query to run on the web
  }
}
\`\`\`
You must not explain anything when using the tool.

💬 If you already know the answer, or the user is being conversational (e.g. "tell me a joke", "what do you think about AI?"), respond normally as a helpful assistant.

🛑 Do not use the tool unless you are unsure or the question clearly needs external data.

Remember:

Think first

Search if needed

Otherwise, reply naturally`;

async function runSearchTool(query: string): Promise<string> {
  const serperApiKey = Deno.env.get("SERPER_API_KEY");
  if (!serperApiKey) {
    console.error('SERPER_API_KEY not set.');
    return "Search tool is not configured.";
  }
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": serperApiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query }),
  });
  if (!res.ok) {
    const errorText = await res.text();
    console.error('Serper.dev API error:', errorText);
    return "I couldn't find anything helpful online.";
  }
  const data = await res.json();
  return data.answerBox?.answer || data.answerBox?.snippet || data.organic?.[0]?.snippet || "I couldn't find anything helpful online.";
}

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

    if (prefsError && prefsError.code !== 'PGRST116') {
      throw prefsError;
    }

    const personality = (prefsData?.prefs as any)?.ai_personality || 'default';

    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const chatModel = genAI.getGenerativeModel({ model: "gemini-pro" });
    const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });

    // --- RECALL ---
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

    // --- FETCH RECENT MESSAGES FOR CONTEXT ---
    let recentMessagesText = 'No recent conversations found.';
    const { data: lastConversation } = await supabaseAdmin
      .from('conversations')
      .select('id')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (lastConversation) {
      const { data: lastMessages, error: lastMessagesError } = await supabaseAdmin
        .from('messages')
        .select('role, content')
        .eq('conversation_id', lastConversation.id)
        .order('created_at', { ascending: false })
        .limit(4); // Fetch the last 4 messages

      if (lastMessages && lastMessages.length > 0) {
        recentMessagesText = lastMessages.reverse().map((m: any) => `${m.role}: ${m.content}`).join('\n');
      }
    }

    let finalSystemInstruction = systemInstructionText
      .replace('{{memories}}', memoryText)
      .replace('{{personality}}', personality)
      .replace('{{recent_messages}}', recentMessagesText);

    // --- REASON ---
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

    let history = messages.reverse().map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    }));

    // Ensure the history starts with a user message
    if (history.length > 0 && history[0].role === 'model') {
      history.shift();
    }

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

    const result = await chat.sendMessage(prompt);
    const response = await result.response;
    let aiText = response.text();

    const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
    const match = aiText.match(jsonBlockRegex);

    if (match && match[1]) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed.tool === "www.go.io" && parsed.params?.query) {
          const searchResult = await runSearchTool(parsed.params.query);
          const summarizePrompt = `Based on the user's question "${prompt}", summarize the following search result in a conversational way: ${searchResult}`;
          const summaryResult = await chat.sendMessage(summarizePrompt);
          aiText = (await summaryResult.response).text();
        }
      } catch (e) {
        console.log("Could not parse tool call, treating as text.", e.message);
      }
    }

    // --- LEARN ---
    await supabaseAdmin.from('messages').insert({ conversation_id: conversationId, role: 'model', content: aiText });
    await supabaseAdmin.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);

    const newMemoryText = `User asked: "${prompt}". JARVIS responded: "${aiText}"`;
    const memoryEmbeddingResult = await embeddingModel.embedContent(newMemoryText);
    const newMemoryEmbedding = memoryEmbeddingResult.embedding.values;

    await supabaseAdmin.from('user_memories').insert({
      user_id: user.id,
      memory_text: newMemoryText,
      embedding: newMemoryEmbedding,
    });

    return new Response(JSON.stringify({ text: aiText, conversationId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Error in Gemini chat function:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});