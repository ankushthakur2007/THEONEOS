import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text } = await req.json();
    const elevenLabsApiKey = Deno.env.get('ELEVENLABS_API_KEY');
    const elevenLabsVoiceId = Deno.env.get('ELEVENLABS_VOICE_ID') || '21m00Tcm4TlvDq8ikWAM'; // Default to Rachel if not set

    if (!elevenLabsApiKey) {
      throw new Error('ELEVENLABS_API_KEY not set in environment variables.');
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoiceId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': elevenLabsApiKey,
        },
        body: JSON.stringify({
          text: text,
          model_id: "eleven_turbo_v2", // Using a fast model
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Eleven Labs API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const audioBlob = await response.blob();
    const audioBuffer = await audioBlob.arrayBuffer();

    return new Response(audioBuffer, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'audio/mpeg', // Or 'audio/wav' depending on Eleven Labs output
        'Cache-Control': 'public, max-age=3600',
      },
      status: 200,
    });
  } catch (error) {
    console.error('Error in Eleven Labs TTS function:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});