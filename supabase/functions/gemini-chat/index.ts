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

const systemInstructionText = `You are JARVIS — an intelligent, voice-powered assistant. Your personality should be: {{personality}}.

Act like a normal, thoughtful person who’s knowledgeable but doesn’t write like a robot. I want your responses to feel conversational, relatable, and human. Not like a formal essay or a customer support script.

To answer questions requiring real-time information (like current events, weather, or stock prices), you must use the 'searchTheWeb' tool. Do not try to answer these from your own knowledge.

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
📜 Conversation Summary:
Here is a summary of the conversation so far. Use it to maintain context over long discussions.
---
{{summary}}
---
🧠 Relevant Memories:
Based on the user's query, here are some relevant past interactions or facts you should consider. If none are provided, you have no relevant memories.
---
{{memories}}
---
👍 User Feedback:
Use this recent user feedback to improve your future responses.
---
{{feedback}}
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

  let conversationId: string | null = null;

  try {
    const { prompt, conversationId: initialConversationId } = await req.json();
    conversationId = initialConversationId;
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

    if (!conversationId) {
      const { data: newConversation, error: convError } = await supabaseAdmin
        .from('conversations')
        .insert({ user_id: user.id, title: prompt.substring(0, 50) })
        .select('id').single();
      if (convError) throw convError;
      conversationId = newConversation.id;
    }

    let recentMessagesText = 'No recent conversations found.';
    let conversationSummary = 'No summary yet.';
    if (conversationId) {
      const { data: convData } = await supabaseAdmin
        .from('conversations')
        .select('summary')
        .eq('id', conversationId)
        .single();
      if (convData?.summary) {
        conversationSummary = convData.summary;
      }

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

    const finalSystemInstruction = systemInstructionText
      .replace('{{summary}}', conversationSummary)
      .replace('{{memories}}', memoryText)
      .replace('{{personality}}', personality)
      .replace('{{feedback}}', feedbackText)
      .replace('{{recent_messages}}', recentMessagesText);

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
          let finalResponseText = "";

          if (response.functionCalls && response.functionCalls.length > 0) {
            const call = response.functionCalls[0];
            if (call.name === 'searchTheWeb') {
              const { query } = call.args;
              console.log(`AI is searching the web for: "${query}"`);
              
              const { data: searchData, error: searchError } = await supabaseAdmin.functions.invoke('searchWithSerper', { body: { query } });
              if (searchError) throw searchError;

              const toolResponsePart: Part = {
                functionResponse: {
                  name: 'searchTheWeb',
                  response: { result: searchData.result },
                },
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

          // Post-response background tasks
          (async () => {
            try {
              await supabaseAdmin.from('messages').insert({ conversation_id: conversationId, role: 'model', content: finalResponseText });
              await supabaseAdmin.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId!);

              const newMemoryText = `User asked: "${prompt}". JARVIS responded: "${finalResponseText}"`;
              const memoryEmbeddingResult = await embeddingModel.embedContent(newMemoryText);
              const newMemoryEmbedding = memoryEmbeddingResult.embedding.values;

              await supabaseAdmin.from('user_memories').insert({
                user_id: user.id,
                memory_text: newMemoryText,
                embedding: newMemoryEmbedding,
              });
              
              // Summarization logic can go here if needed
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
    console.error('Error in Gemini chat function:', error.message);
    const responseHeaders = { ...corsHeaders, 'Content-Type': 'application/json', 'X-Conversation-Id': conversationId || '' };
    return new Response(JSON.stringify({ error: error.message }), {
      headers: responseHeaders,
      status: 500,
    });
  }
});