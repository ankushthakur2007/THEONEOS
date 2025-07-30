import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, FunctionDeclaration, Part } from "https://esm.sh/@google/generative-ai@0.15.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-conversation-id',
  'Access-Control-Expose-Headers': 'x-conversation-id',
};

const searchTool: { functionDeclarations: FunctionDeclaration[] } = {
  functionDeclarations: [
    {
      name: "searchTheWeb",
      description: "Searches the web for real-time information on a given topic, question, or query. Use this for current events, facts, or any information you don't know.",
      parameters: {
        type: "OBJECT",
        properties: {
          query: {
            type: "STRING",
            description: "The search query or question to look up.",
          },
        },
        required: ["query"],
      },
    },
  ],
};

const systemInstructionText = `You are JARVIS, an intelligent assistant. Your personality is: {{personality}}.
Your goal is to be conversational, relatable, and human. Write concisely and vary your response structure.
When you are unsure about something, state it clearly.
To answer questions requiring real-time information (like current events or facts), you MUST use the 'searchTheWeb' tool. Do not answer from memory.
You must always respond using Markdown format.
---
📜 Conversation Summary:
{{summary}}
---
🧠 Relevant Memories:
{{memories}}
---
👍 User Feedback:
{{feedback}}
---
📜 Recent Conversation History:
{{recent_messages}}
---
`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let conversationId: string | null = null;
  console.log("--- [GEMINI-CHAT START] ---");

  try {
    const { prompt, conversationId: initialConversationId } = await req.json();
    conversationId = initialConversationId;
    console.log(`Initial Conversation ID: ${conversationId}`);
    console.log(`User Prompt: "${prompt}"`);

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) throw new Error('Gemini API key not set.');

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const authHeader = req.headers.get('Authorization')!;
    const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!user) throw new Error('User not authenticated.');
    console.log(`Authenticated User ID: ${user.id}`);

    const { data: prefsData, error: prefsError } = await supabaseAdmin
      .from('user_preferences')
      .select('prefs')
      .eq('user_id', user.id)
      .single();

    if (prefsError && prefsError.code !== 'PGRST116') throw prefsError;
    const personality = (prefsData?.prefs as any)?.ai_personality || 'A helpful and friendly assistant.';
    console.log(`AI Personality: "${personality}"`);

    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const chatModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash", tools: [searchTool] });
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
    console.log("--- Matched Memories ---\n" + memoryText);

    if (!conversationId) {
      const { data: newConversation, error: convError } = await supabaseAdmin
        .from('conversations')
        .insert({ user_id: user.id, title: prompt.substring(0, 50) })
        .select('id').single();
      if (convError) throw convError;
      conversationId = newConversation.id;
      console.log(`Created new conversation with ID: ${conversationId}`);
    }

    let recentMessagesText = 'No recent conversations found.';
    let conversationSummary = 'No summary yet.';
    if (conversationId) {
      const { data: convData } = await supabaseAdmin
        .from('conversations')
        .select('summary')
        .eq('id', conversationId)
        .single();
      if (convData?.summary) conversationSummary = convData.summary;

      const { data: lastMessages } = await supabaseAdmin
        .from('messages')
        .select('role, content')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(4);
      if (lastMessages && lastMessages.length > 0) {
        recentMessagesText = lastMessages.reverse().map((m: any) => `${m.role}: ${m.content}`).join('\n');
      }
    }
    console.log("--- Conversation Summary ---\n" + conversationSummary);
    console.log("--- Recent Messages ---\n" + recentMessagesText);

    let feedbackText = 'No recent feedback has been provided.';
    const { data: feedbackData } = await supabaseAdmin
      .from('message_feedback')
      .select('feedback, comment')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(3);

    if (feedbackData && feedbackData.length > 0) {
      feedbackText = 'Here is some recent feedback from the user on your past responses:\n' +
        feedbackData.map((f: any) =>
          `- A response was marked as '${f.feedback}'. User comment: "${f.comment || 'No comment'}"`
        ).join('\n');
    }
    console.log("--- User Feedback ---\n" + feedbackText);

    const finalSystemInstruction = systemInstructionText
      .replace('{{summary}}', conversationSummary)
      .replace('{{memories}}', memoryText)
      .replace('{{personality}}', personality)
      .replace('{{feedback}}', feedbackText)
      .replace('{{recent_messages}}', recentMessagesText);
    console.log("--- FINAL SYSTEM INSTRUCTION ---\n" + finalSystemInstruction);

    const { data: messages, error: messagesError } = await supabaseAdmin
      .from('messages').select('role, content').eq('conversation_id', conversationId)
      .order('created_at', { ascending: false }).limit(10);
    if (messagesError) throw messagesError;

    const history = messages.reverse().map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    }));
    console.log("--- CHAT HISTORY FOR API ---\n" + JSON.stringify(history, null, 2));

    const chat = chatModel.startChat({
      history: history,
      systemInstruction: { role: 'system', parts: [{ text: finalSystemInstruction }] },
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ],
    });

    const stream = new ReadableStream({
      async start(controller) {
        try {
          await supabaseAdmin.from('messages').insert({ conversation_id: conversationId, role: 'user', content: prompt });

          const result = await chat.sendMessage(prompt);
          const response = result.response;
          console.log("--- GEMINI RAW RESPONSE ---\n" + JSON.stringify(response, null, 2));
          
          if (response.promptFeedback?.blockReason) {
            throw new Error(`Model provided invalid content. Response reason: ${response.promptFeedback.blockReason}`);
          }

          let finalResponseText = "";

          if (response.functionCalls && response.functionCalls.length > 0) {
            const call = response.functionCalls[0];
            console.log(`Attempting to call tool: ${call.name} with args: ${JSON.stringify(call.args)}`);
            
            if (call.name === 'searchTheWeb') {
              const { query } = call.args;
              const { data: searchData, error: searchError } = await supabaseAdmin.functions.invoke('searchWithSerper', { body: { query } });
              if (searchError) throw searchError;

              const toolResponsePart: Part = {
                functionResponse: { name: 'searchTheWeb', response: { result: searchData.result } },
              };

              const finalResultStream = await chat.sendMessageStream([toolResponsePart]);
              for await (const chunk of finalResultStream.stream) {
                const chunkText = chunk.text();
                finalResponseText += chunkText;
                controller.enqueue(new TextEncoder().encode(chunkText));
              }
            } else {
              finalResponseText = `Error: Model tried to call unknown function ${call.name}`;
              controller.enqueue(new TextEncoder().encode(finalResponseText));
            }
          } else {
            finalResponseText = response.text();
            controller.enqueue(new TextEncoder().encode(finalResponseText));
          }

          controller.close();

          (async () => {
            try {
              await supabaseAdmin.from('messages').insert({ conversation_id: conversationId, role: 'model', content: finalResponseText });
              await supabaseAdmin.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId!);
              const newMemoryText = `User asked: "${prompt}". JARVIS responded: "${finalResponseText}"`;
              const memoryEmbeddingResult = await embeddingModel.embedContent(newMemoryText);
              await supabaseAdmin.from('user_memories').insert({
                user_id: user.id,
                memory_text: newMemoryText,
                embedding: memoryEmbeddingResult.embedding.values,
              });
            } catch (bgError) {
              console.error("Error in background DB tasks:", bgError);
            }
          })();

        } catch (streamError) {
          console.error('Error within stream:', streamError.message);
          controller.error(streamError);
        }
      },
    });

    const responseHeaders = { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8', 'X-Conversation-Id': conversationId };
    return new Response(stream, { headers: responseHeaders, status: 200 });

  } catch (error) {
    console.error('--- [GEMINI-CHAT END WITH ERROR] ---');
    console.error('Error in Gemini chat function:', error.message);
    console.error('Stack trace:', error.stack);
    const responseHeaders = { ...corsHeaders, 'Content-Type': 'application/json', 'X-Conversation-Id': conversationId || '' };
    return new Response(JSON.stringify({ error: error.message }), {
      headers: responseHeaders,
      status: 500,
    });
  }
});