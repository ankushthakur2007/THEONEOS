import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log("--- [searchWithSerper START] ---");
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();
    const serperApiKey = Deno.env.get("SERPER_API_KEY");

    if (!serperApiKey) {
      console.error('SERPER_API_KEY not set in environment variables.');
      return new Response(JSON.stringify({ error: 'Serper API key not set.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": serperApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('Serper.dev API error:', errorText);
      throw new Error(`Serper.dev failed: ${res.status} - ${errorText}`);
    }

    const data = await res.json();

    const result =
      data.answerBox?.answer ||
      data.answerBox?.snippet ||
      data.organic?.[0]?.snippet ||
      "I couldn't find anything helpful online.";

    return new Response(JSON.stringify({ result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Error in searchWithSerper function:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});