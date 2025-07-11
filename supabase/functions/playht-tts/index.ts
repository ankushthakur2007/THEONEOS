import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

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
    const playHtApiKey = Deno.env.get('PLAYHT_API_KEY');
    const playHtUserId = Deno.env.get('PLAYHT_USER_ID');

    if (!playHtApiKey || !playHtUserId) {
      console.error('PLAYHT_API_KEY or PLAYHT_USER_ID not set in environment variables.');
      return new Response(JSON.stringify({ error: 'Play.ht API keys not set.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    // 1. Initiate TTS generation with Play.ht
    const initRes = await fetch("https://api.play.ht/api/v2/tts", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${playHtApiKey}`,
        "X-User-ID": playHtUserId,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        voice: "s3://voice-cloning-zero-shot/en_us_001", // Default voice, can be configured
        content: [text],
        speed: 1.0
      })
    });

    if (!initRes.ok) {
      const errorData = await initRes.json();
      console.error('Play.ht initiation error response:', errorData);
      throw new Error(`Play.ht initiation failed: ${initRes.status} - ${JSON.stringify(errorData)}`);
    }

    const { transcriptionId } = await initRes.json();

    let audioUrl = null;
    // 2. Poll for audio URL
    for (let i = 0; i < 15; i++) { // Increased polling attempts
      const checkRes = await fetch(`https://api.play.ht/api/v2/tts/${transcriptionId}`, {
        headers: {
          "Authorization": `Bearer ${playHtApiKey}`,
          "X-User-ID": playHtUserId
        }
      });

      const data = await checkRes.json();
      if (data.audioUrl) {
        audioUrl = data.audioUrl;
        break;
      }

      await new Promise(r => setTimeout(r, 2000)); // wait 2 seconds
    }

    if (!audioUrl) {
      throw new Error("Play.ht audio not ready after multiple attempts.");
    }

    // 3. Fetch the generated audio
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to fetch audio from Play.ht URL: ${audioResponse.status}`);
    }
    const audioBlob = await audioResponse.blob();
    const audioBuffer = await audioBlob.arrayBuffer();

    // Initialize Supabase client for storage
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('Supabase URL or Service Role Key not set in environment variables.');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // 4. Upload audio to Supabase Storage
    const fileName = `${crypto.randomUUID()}.mp3`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('audio-responses') // Ensure this bucket exists in Supabase Storage
      .upload(fileName, audioBuffer, {
        contentType: 'audio/mpeg',
        upsert: false,
      });

    if (uploadError) {
      console.error('Supabase Storage upload error:', uploadError.message);
      throw new Error(`Failed to upload audio to storage: ${uploadError.message}`);
    }

    // 5. Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('audio-responses')
      .getPublicUrl(fileName);

    if (!publicUrlData || !publicUrlData.publicUrl) {
      throw new Error('Failed to get public URL for uploaded audio.');
    }

    return new Response(JSON.stringify({ audioUrl: publicUrlData.publicUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Error in Play.ht TTS function:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});