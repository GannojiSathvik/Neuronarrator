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

// bulbul:v2 (and its speakers "anushka"/"abhilash") was deprecated by Sarvam. Clients still
// send the old names, so map them to comparable bulbul:v3 voices.
const SPEAKERS: Record<string, string> = { anushka: "priya", abhilash: "rahul" };
// The app's narration voice and speed can be changed without a redeploy:
//   npx supabase secrets set TTS_SPEAKER=kavya TTS_PACE=0.85
// bulbul:v3 has no pitch control, so a calmer voice comes from the speaker and a slower pace (0.5–2).
const NARRATION_SPEAKER = Deno.env.get('TTS_SPEAKER');
const PACE = Math.min(2, Math.max(0.5, Number(Deno.env.get('TTS_PACE')) || 0.9));

// Simple in-memory rate limiter: max 1 request per 2 seconds per client
const lastRequestTime = new Map<string, number>();
const RATE_LIMIT_MS = 2000;

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Rate limit by authorization header (per-client)
    const clientKey = req.headers.get('authorization') || 'anonymous';
    const now = Date.now();
    const lastTime = lastRequestTime.get(clientKey) || 0;

    if (now - lastTime < RATE_LIMIT_MS) {
      console.log("Rate limited client, returning cached silence");
      return new Response(
        JSON.stringify({ error: "Rate limited - please wait before next request", rateLimited: true }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    lastRequestTime.set(clientKey, now);

    // Clean old entries periodically
    if (lastRequestTime.size > 100) {
      for (const [key, time] of lastRequestTime) {
        if (now - time > 60000) lastRequestTime.delete(key);
      }
    }

    const SARVAM_API_KEY = Deno.env.get('SARVAM_API_KEY');
    if (!SARVAM_API_KEY) {
      console.error("SARVAM_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Sarvam API key not configured" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return badRequest("Request body must be valid JSON");
    }
    const { text, speaker = "anushka" } = body ?? {};

    if (typeof text !== "string" || !text.trim()) {
      return new Response(
        JSON.stringify({ error: "No text provided" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (typeof speaker !== "string" || !Object.hasOwn(SPEAKERS, speaker)) {
      return badRequest(`speaker must be one of: ${Object.keys(SPEAKERS).join(", ")}`);
    }

    // Truncate text to 500 chars max to keep response fast
    const truncatedText = text.slice(0, 500);

    console.log("Calling Sarvam TTS API with speaker:", speaker, "text length:", truncatedText.length);

    // 8-second timeout to avoid 504 gateway timeouts stalling the loop
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    let response: Response;
    try {
      response = await fetch("https://api.sarvam.ai/text-to-speech", {
        method: "POST",
        headers: {
          "api-subscription-key": SARVAM_API_KEY,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          text: truncatedText,
          language_code: "en-IN",
          speaker: (speaker === "anushka" && NARRATION_SPEAKER) || SPEAKERS[speaker],
          model: "bulbul:v3",
          pace: PACE,
          speech_sample_rate: 24000,
        }),
      });
    } catch (fetchErr) {
      clearTimeout(timeout);
      const isTimeout = fetchErr instanceof DOMException && fetchErr.name === "AbortError";
      console.error(isTimeout ? "Sarvam TTS timed out after 8s" : "Sarvam TTS fetch error:", fetchErr);
      return new Response(
        JSON.stringify({ 
          error: isTimeout ? "TTS request timed out" : "TTS request failed", 
          useBrowserFallback: true 
        }),
        { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Sarvam TTS API error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: `TTS API error: ${response.status}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log("Sarvam TTS response received");

    const audioBase64 = data.audios?.[0];

    if (!audioBase64) {
      console.error("No audio in Sarvam response:", data);
      return new Response(
        JSON.stringify({ error: "No audio returned from TTS API" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ audioBase64 }),
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