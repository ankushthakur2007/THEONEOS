import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.15.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Destructure prompt and history from the request body
    const { prompt, history } = await req.json();
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');

    if (!geminiApiKey) {
      console.error('GEMINI_API_KEY not set in environment variables.');
      return new Response(JSON.stringify({ error: 'Gemini API key not set.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    // Define the system instruction for tool awareness
    const systemInstruction = `You are JARVIS — an intelligent, voice-powered assistant who talks to users and can optionally use external tools.

You must always:
- Think before responding
- Determine if you can confidently answer yourself
- If not, use a tool

---

🛠️ You have access to one tool:

🔧 \`www.go.io\` — Internet Search Tool  
Purpose: Use this when a user asks for **factual** or **real-time** information that may change frequently or is not built into your memory.

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

    // Start a chat session with the provided history and system instruction
    const chat = model.startChat({
      history: history || [], // Use provided history, or an empty array if none
      generationConfig: {
        maxOutputTokens: 200, // Limit output length to prevent excessively long responses
      },
      systemInstruction: systemInstruction, // Apply the system instruction
    });

    // Send the current prompt
    const result = await chat.sendMessage(prompt);
    const response = await result.response;
    const text = response.text();

    return new Response(JSON.stringify({ text }), {
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