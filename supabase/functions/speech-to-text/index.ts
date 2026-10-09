import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { audioUpload, whisperLanguage } from "../_shared/audio.ts";

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

// Short voice clips should come back in 1-2 s; give up well before the client does.
const STT_BUDGET_MS = 9_000;
// Not worth starting the Sarvam fallback with less time than this left.
const MIN_ATTEMPT_MS = 1_500;

// Groq Whisper: OpenAI-compatible transcription endpoint, multipart/form-data.
// https://console.groq.com/docs/speech-to-text
const GROQ_STT_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const DEFAULT_STT_MODEL = "whisper-large-v3-turbo";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(
    JSON.stringify(payload),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Result of one provider attempt: a transcript, or an HTTP-ish status for the log/fallback.
type SttResult = { transcript: string } | { error: string };

async function transcribeWithGroq(
  apiKey: string, model: string, audio: Blob, fileName: string, language: string, timeoutMs: number,
): Promise<SttResult> {
  const form = new FormData();
  form.append('file', audio, fileName);
  form.append('model', model);
  form.append('language', language);
  form.append('response_format', 'json');
  form.append('temperature', '0');
  const res = await fetch(GROQ_STT_URL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    console.error("Groq STT error:", res.status, (await res.text()).slice(0, 200));
    return { error: `groq ${res.status}` };
  }
  const data = await res.json();
  // response_format "json" returns { text: "..." } (OpenAI-compatible shape).
  return { transcript: typeof data.text === "string" ? data.text : "" };
}

async function transcribeWithSarvam(
  apiKey: string, audio: Blob, fileName: string, languageCode: string, timeoutMs: number,
): Promise<SttResult> {
  const form = new FormData();
  form.append('file', audio, fileName);
  form.append('model', 'saarika:v2.5');
  form.append('language_code', languageCode);
  const res = await fetch("https://api.sarvam.ai/speech-to-text", {
    method: "POST",
    headers: { "api-subscription-key": apiKey },
    body: form,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    console.error("Sarvam STT error:", res.status, (await res.text()).slice(0, 200));
    return { error: `sarvam ${res.status}` };
  }
  const data = await res.json();
  // Sarvam returns { transcript: "..." }
  return { transcript: data.transcript || data.text || "" };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Groq Whisper first (free tier, fast); Sarvam as the fallback or when Groq isn't set up.
    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
    const STT_MODEL = Deno.env.get('STT_MODEL') || DEFAULT_STT_MODEL;
    const SARVAM_API_KEY = Deno.env.get('SARVAM_API_KEY');
    if (!GROQ_API_KEY && !SARVAM_API_KEY) {
      console.error("No STT provider configured (GROQ_API_KEY or SARVAM_API_KEY)");
      return jsonResponse({ error: "Speech-to-text API key not configured" }, 500);
    }

    // Expect JSON with base64 audio
    let body;
    try {
      body = await req.json();
    } catch {
      return badRequest("Request body must be valid JSON");
    }
    const { audioBase64, language_code = "en-IN", mime_type = "audio/webm" } = body ?? {};

    if (!audioBase64 || typeof audioBase64 !== "string") {
      return badRequest("No audio data provided");
    }
    if (audioBase64.length > MAX_AUDIO_BASE64_LENGTH) {
      return badRequest("audioBase64 must be a base64 string under 10 MB");
    }
    if (typeof language_code !== "string" || !/^[a-z]{2}-[A-Z]{2}$/.test(language_code)) {
      return badRequest("language_code must look like en-IN");
    }
    const upload = typeof mime_type === "string" ? audioUpload(mime_type) : null;
    if (!upload) {
      return badRequest("mime_type must be an audio type such as audio/webm, audio/mp4, audio/ogg or audio/wav");
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
    // Label the upload with the format the browser actually recorded (Safari records audio/mp4).
    const audio = new Blob([bytes], { type: upload.mimeType });

    const deadline = Date.now() + STT_BUDGET_MS;
    const timeLeft = () => deadline - Date.now();
    let result: SttResult = { error: "not attempted" };
    let provider = "";

    if (GROQ_API_KEY) {
      provider = `groq ${STT_MODEL}`;
      try {
        result = await transcribeWithGroq(
          GROQ_API_KEY, STT_MODEL, audio, upload.fileName, whisperLanguage(language_code), timeLeft(),
        );
      } catch (err) {
        console.error("Groq STT fetch error:", err);
        result = { error: "groq fetch error" };
      }
    }

    if ("error" in result && SARVAM_API_KEY && timeLeft() >= MIN_ATTEMPT_MS) {
      provider = "sarvam saarika:v2.5";
      try {
        result = await transcribeWithSarvam(SARVAM_API_KEY, audio, upload.fileName, language_code, timeLeft());
      } catch (err) {
        console.error("Sarvam STT fetch error:", err);
        result = { error: "sarvam fetch error" };
      }
    }

    if ("error" in result) {
      console.error("Speech-to-text failed:", result.error);
      return jsonResponse({ error: "Speech-to-text is unavailable right now" }, 502);
    }

    // Don't log the transcript itself: it is the user's speech.
    console.log("STT via", provider, "audio", upload.mimeType, "transcript length:", result.transcript.length);
    return jsonResponse({ transcript: result.transcript });

  } catch (error) {
    console.error("Edge function error:", error);
    // Details stay in the server log; don't echo internal error text to the client.
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
