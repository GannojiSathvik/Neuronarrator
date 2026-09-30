import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function badRequest(message: string): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// About 7.5 MB of audio; push-to-name recordings are a few seconds long.
const MAX_AUDIO_BASE64_LENGTH = 10_000_000;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const SARVAM_API_KEY = Deno.env.get('SARVAM_API_KEY');
    if (!SARVAM_API_KEY) {
      console.error("SARVAM_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Sarvam API key not configured" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Expect JSON with base64 audio
    let body;
    try {
      body = await req.json();
    } catch {
      return badRequest("Request body must be valid JSON");
    }
    const { audioBase64, language_code = "en-IN" } = body ?? {};

    if (!audioBase64) {
      return new Response(
        JSON.stringify({ error: "No audio data provided" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log("Decoding base64 audio, length:", audioBase64.length);

    if (typeof audioBase64 !== "string" || audioBase64.length > MAX_AUDIO_BASE64_LENGTH) {
      return badRequest("audioBase64 must be a base64 string under 10 MB");
    }
    if (typeof language_code !== "string" || !/^[a-z]{2}-[A-Z]{2}$/.test(language_code)) {
      return badRequest("language_code must look like en-IN");
    }

    // Decode base64 to binary
    let binaryString: string;
    try {
      binaryString = atob(audioBase64);
    } catch {
      return badRequest("audioBase64 is not valid base64");
    }
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Create FormData with audio file
    const formData = new FormData();
    const audioBlob = new Blob([bytes], { type: 'audio/webm' });
    formData.append('file', audioBlob, 'recording.webm');
    formData.append('model', 'saarika:v2.5');
    formData.append('language_code', language_code);

    console.log("Calling Sarvam STT API with model: saarika:v2.5, language:", language_code);

    const response = await fetch("https://api.sarvam.ai/speech-to-text", {
      method: "POST",
      headers: {
        "api-subscription-key": SARVAM_API_KEY,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Sarvam STT API error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: `STT API error: ${response.status}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    // Don't log the transcript itself: it is the user's speech.
    console.log("Sarvam STT response received, transcript length:", (data.transcript || data.text || "").length);

    // Sarvam returns { transcript: "..." } or similar
    const transcript = data.transcript || data.text || "";

    return new Response(
      JSON.stringify({ transcript }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("Edge function error:", error);
    // Details stay in the server log; don't echo internal error text to the client.
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
