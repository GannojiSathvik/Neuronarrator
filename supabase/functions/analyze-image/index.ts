import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Anthropic from "npm:@anthropic-ai/sdk@0.129.0";
import { buildGeminiRequest, extractGeminiText, geminiUrl } from "../_shared/gemini.ts";

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

const VALID_MODES = ["general", "reader", "currency", "finder"];
// A 1280x720 JPEG frame from LiveCamera is well under 1 MB of base64.
const MAX_IMAGE_BASE64_LENGTH = 5_000_000;
const MAX_KNOWN_FACES = 20;
// Memory sent with a spoken question (see src/lib/workingMemory.ts and src/lib/memory.ts).
const MAX_RECENT_CONTEXT_LENGTH = 1000;
const MAX_PERSON_NOTES_PEOPLE = 3;
const MAX_PERSON_NOTES_PER_PERSON = 4;
const MAX_PERSON_NOTES_CHARS = 1200;

interface PersonNotes {
  name: string;
  notes: string[];
}

// Same size measure as the client's personNotesLength: every name and note, summed.
function isValidPersonNotes(value: unknown): value is PersonNotes[] {
  if (!Array.isArray(value) || value.length > MAX_PERSON_NOTES_PEOPLE) return false;
  let total = 0;
  for (const person of value) {
    if (!person || typeof person !== "object" || typeof person.name !== "string" || !person.name.trim()) return false;
    if (!Array.isArray(person.notes) || person.notes.length > MAX_PERSON_NOTES_PER_PERSON) return false;
    if (!person.notes.every((note: unknown) => typeof note === "string")) return false;
    total += person.name.length + person.notes.reduce((sum: number, note: string) => sum + note.length, 0);
  }
  return total <= MAX_PERSON_NOTES_CHARS;
}

// Vision models — try primary first, fallback if over capacity
// Groq shut down both Llama 4 vision models in 2026 (Maverick in March, Scout in July), so
// every call failed and only the fallbacks answered. qwen3.8-27b is Groq's only listed vision
// model as of Oct 2026: https://console.groq.com/docs/vision
const VISION_MODELS = [
  "qwen/qwen3.8-27b",
];

// Provider order: Groq -> Gemini (direct, student's own key) -> Claude -> Lovable gateway.
// Each one is tried only if its key is set and the earlier ones failed or aren't configured.

// Gemini Flash models are free of charge on the Gemini API free tier (free-tier content may be
// used by Google to improve its products). Override with the GEMINI_MODEL secret. 3.5 Flash answered in ~10 s on 9 Oct 2026, while 3.8 was overloaded (503) and 3.7 timed out.
// https://ai.google.dev/gemini-api/docs/models
const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";

// Used only when Groq and Gemini fail or aren't configured.
const CLAUDE_MODEL = "claude-opus-5-5";

// The client's capture-loop watchdog abandons a request after 15s. All providers share
// this budget so the function answers (or gives up) before the client stops listening.
const REQUEST_BUDGET_MS = 13_000;
// Not worth starting a provider call with less time than this left.
const MIN_ATTEMPT_MS = 1_000;

// Accepts either a data URL or bare base64 (assumed JPEG, which is what LiveCamera sends).
function toClaudeImage(imageBase64: string): Anthropic.ImageBlockParam {
  const match = imageBase64.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/);
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: (match?.[1] ?? "image/jpeg") as Anthropic.Base64ImageSource["media_type"],
      data: match?.[2] ?? imageBase64,
    },
  };
}

const GENERAL_PROMPT = `You're a chill, caring friend walking beside a blind person. Talk like a real human — casual, warm, not robotic. No jargon, no "I observe", no "the image shows". Just talk to them like you're right there.

You MUST respond with ONLY valid JSON — no extra text before or after:
{"text_content":"Any text you can read (signs, screens, labels) — copy word-for-word. Empty string if none.","description":"What you'd actually say to your friend (max 2 sentences, 'you' perspective)","hazards":["any dangers"],"priority":1}

Rules:
- ALWAYS describe what you actually see: furniture, objects, screens, TVs, windows, walls, shelves, everything relevant. Don't be lazy.
- Talk like a friend: "Hey there's a TV right in front of you, and some shelves to the left" not "A commercial establishment is located to your left"
- Be specific: mention objects, colors, positions. "There's a black TV on a stand ahead, some shelves with stuff on your right"
- Distances matter: "Like 5 steps ahead there's a chair"
- Hazards stay calm: "Heads up, stairs coming" not "WARNING: STAIRS DETECTED"
- If you know someone's name, USE IT. Say "Ronit's right in front of you" not "A man is in front of you"
- If someone is a family member or friend, mention it warmly: "Hey, your friend Ronit is here!" or "It's your doctor, Dr. Shah"
- If it's been a while since you last saw them, mention it naturally: "Oh nice, it's Ronit! You haven't seen him in like a week"
- If you just saw them today, DON'T mention timing — just use their name naturally

Scene Memory:
- You may be given what you said last time. If the scene barely changed, mention something you didn't say before or a small new detail.
- NEVER say "nothing new" or "same as before" — there's always something to describe.
- Don't repeat the exact same sentence. Rephrase or highlight different objects.

HAZARD DETECTION — BE AGGRESSIVE:
- Priority 1-3: No danger. Normal scene.
- Priority 4-5: Minor caution (uneven floor, low light).
- Priority 6-7: Moderate hazard (wet floor, obstacles in path, hot surface nearby).
- Priority 8-9: Serious danger (fire, smoke, flames, sharp objects, vehicles approaching, open electrical wiring, gas leak signs).
- Priority 10: Immediate life-threatening danger (active fire engulfing area, collapsing structure, explosion).
- If you see ANY fire, flames, smoke, burning, or sparks — even in a photo/image on a screen — set priority to AT LEAST 8 and add "fire" or "flames" to hazards.
- If fire appears to be real (not on a screen/TV), set priority 9-10.
- When in doubt about danger, ALWAYS err on the side of higher priority. A false alarm is better than missing a real hazard.

CRITICAL: Output ONLY the JSON object. No markdown, no backticks, no extra words.`;

const READER_PROMPT = `You're reading text out loud for a blind friend. Be natural — like you're just telling them what it says.

You MUST respond with ONLY valid JSON — no extra text before or after:
{"text_content":"Read all visible text naturally. Signs, labels, screens, books — in logical order.","description":"Quick context like 'Looks like a menu' or 'There's a sign on the wall'","hazards":[],"priority":1}

How to read:
- Put the quick context ONLY in "description" ("Looks like a menu", "A label on a bottle"). "text_content" is just the text itself, read naturally, without repeating that context.
- Read naturally: "twelve bucks" not "$12.00"
- Dates: "March 15th" not "03/15"
- No text? Just say "No text here, just [quick scene]"

CRITICAL: Output ONLY the JSON object. No markdown, no backticks, no extra words.`;

const CURRENCY_PROMPT = `You are an expert currency detector for blind users. Your ONLY job is to identify Indian Rupee denominations in this image.

You MUST respond with ONLY valid JSON — no extra text before or after:
{"text_content":"","description":"YOUR_ANSWER_HERE","hazards":[],"priority":1}

Rules:
- Identify Indian Rupee notes: ₹10, ₹20, ₹50, ₹100, ₹200, ₹500, ₹2000
- If you see ONE note, say the denomination clearly: "500 Rupees" or "This is a 100 rupee note"
- If you see MULTIPLE notes, count them and sum: "I see two notes — a 500 and a 100. Total is 600 Rupees"
- If coins are visible, mention them too: "A 10 rupee coin"
- If NO currency is visible, say: "No currency visible right now"
- Be confident and clear — blind users depend on accuracy
- Do NOT describe the scene. ONLY talk about money.

CRITICAL: Output ONLY the JSON object. No markdown, no backticks, no extra words.`;

interface KnownFace {
  name: string;
  relation: string;
  daysSinceLastSeen?: number;
}

interface VisionResult {
  text_content: string;
  description: string;
  hazards: string[];
  priority: number;
  found?: boolean;
}

const QUESTION_PROMPT = `You are the eyes of a blind friend. They just asked you a question out loud, and you can see what their camera sees.

You MUST respond with ONLY valid JSON — no extra text before or after:
{"text_content":"Any text you read to answer, word-for-word. Empty string if none.","description":"YOUR SPOKEN ANSWER","hazards":["any dangers"],"priority":1}

Rules:
- Answer the question directly, in 1–2 short, warm spoken sentences ("you" perspective). No preamble.
- Use what you see in the image. If the question isn't about the image (e.g. a general question), answer it briefly anyway.
- If you can't tell from the image, say so plainly and suggest how to point the camera ("Hold it a bit closer").
- If you notice a real danger, mention it and set priority 8 or higher.

Memory:
- You may get "What happened recently (newest first)": short notes from the last few minutes. Use them for questions about the recent past, like "what did I just see?", "what did that sign say?" or "who was here a moment ago?". For questions about right now ("what's in front of me?", "what am I holding?"), prefer the current image over recent notes.
- You may get "Saved notes about <name>": the user's own notes about people they know. Use them for questions like "what did Ronit and I talk about last time?" or "when did I last see Meera?". Quote or closely paraphrase them faithfully and mention the date if it helps.
- NEVER invent personal facts about anyone. If neither the image, recent notes nor saved notes answer the question, say you don't know.

CRITICAL: Output ONLY the JSON object. No markdown, no backticks, no extra words.`;

const buildFinderPrompt = (targetItem: string) => `You are helping a blind person find a specific item. The item they are looking for is: "${targetItem}".

You MUST respond with ONLY valid JSON — no extra text before or after:
{"text_content":"","description":"DIRECTION_HINT","hazards":[],"priority":1,"found":true_or_false}

Rules:
- "found" must be true if the ${targetItem} (or something very similar) is visible in the image, false otherwise.
- If found=true: In "description", tell them WHERE it is: "Your ${targetItem} is on the table to your right" or "I can see your ${targetItem} right in front of you, on the desk"
- If found=false: In "description", say something brief: "Not here, keep looking" or "I don't see it in this direction"
- Be specific about location/position when found
- Do NOT describe other objects unless they help locate the target

CRITICAL: Output ONLY the JSON object. No markdown, no backticks, no extra words.`;

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') || DEFAULT_GEMINI_MODEL;
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!GROQ_API_KEY && !GEMINI_API_KEY && !ANTHROPIC_API_KEY && !LOVABLE_API_KEY) {
      console.error("No vision provider configured (GROQ_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY or LOVABLE_API_KEY)");
      return new Response(
        JSON.stringify({ error: "API key not configured" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return badRequest("Request body must be valid JSON");
    }
    if (!body || typeof body !== "object") {
      return badRequest("Request body must be a JSON object");
    }

    const {
      imageBase64,
      mode = "general",
      knownFaces = [],
      previousDescription: rawPreviousDescription = "",
      targetItem: rawTargetItem = "",
      question: rawQuestion = "",
      recentContext: rawRecentContext = "",
      personNotes = [],
    } = body;

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: "No image provided" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (typeof imageBase64 !== "string" || imageBase64.length > MAX_IMAGE_BASE64_LENGTH) {
      return badRequest("imageBase64 must be a base64 string under 5 MB");
    }
    if (!VALID_MODES.includes(mode)) {
      return badRequest(`mode must be one of: ${VALID_MODES.join(", ")}`);
    }
    if (!Array.isArray(knownFaces) || knownFaces.length > MAX_KNOWN_FACES) {
      return badRequest(`knownFaces must be an array of at most ${MAX_KNOWN_FACES} entries`);
    }
    if (typeof rawPreviousDescription !== "string" || typeof rawTargetItem !== "string") {
      return badRequest("previousDescription and targetItem must be strings");
    }
    // Both are interpolated into the prompt; cap them so one request can't send an essay.
    const previousDescription = rawPreviousDescription.slice(0, 1000);
    const targetItem = rawTargetItem.slice(0, 100);
    if (typeof rawQuestion !== "string") {
      return badRequest("question must be a string");
    }
    // A spoken question from the user (push-to-talk or "neuro …"), answered about this frame.
    const question = rawQuestion.trim().slice(0, 300);
    if (typeof rawRecentContext !== "string" || rawRecentContext.length > MAX_RECENT_CONTEXT_LENGTH) {
      return badRequest(`recentContext must be a string of at most ${MAX_RECENT_CONTEXT_LENGTH} characters`);
    }
    const recentContext = rawRecentContext.trim();
    if (!isValidPersonNotes(personNotes)) {
      return badRequest(
        `personNotes must be an array of at most ${MAX_PERSON_NOTES_PEOPLE} {name, notes} entries, ` +
          `${MAX_PERSON_NOTES_CHARS} characters in total`,
      );
    }

    // Select system prompt based on mode
    let systemPrompt: string;
    switch (mode) {
      case "reader":
        systemPrompt = READER_PROMPT;
        break;
      case "currency":
        systemPrompt = CURRENCY_PROMPT;
        break;
      case "finder":
        systemPrompt = buildFinderPrompt(targetItem || "item");
        break;
      default:
        systemPrompt = GENERAL_PROMPT;
    }
    if (question) systemPrompt = QUESTION_PROMPT;

    // Build user prompt
    let userPrompt: string;
    switch (mode) {
      case "reader":
        userPrompt = "Please read any text you can see in this image.";
        break;
      case "currency":
        userPrompt = "What Indian Rupee currency notes or coins can you see? Tell me the denominations and total.";
        break;
      case "finder":
        userPrompt = `Can you see a ${targetItem || "item"} in this image? Where is it?`;
        break;
      default:
        userPrompt = "What's in front of me?";
    }
    if (question) userPrompt = `My question: "${question}"`;

    // Add known faces context for general mode
    if (knownFaces.length > 0 && (mode === "general" || question)) {
      const faceLines = knownFaces.map((f: KnownFace) => {
        let line = `${f.name} — ${f.relation}`;
        if (f.daysSinceLastSeen !== undefined && f.daysSinceLastSeen > 0) {
          if (f.daysSinceLastSeen === 1) line += ` (last seen yesterday)`;
          else if (f.daysSinceLastSeen < 7) line += ` (last seen ${f.daysSinceLastSeen} days ago)`;
          else if (f.daysSinceLastSeen < 30) line += ` (last seen about ${Math.round(f.daysSinceLastSeen / 7)} weeks ago)`;
          else line += ` (last seen about ${Math.round(f.daysSinceLastSeen / 30)} months ago)`;
        } else if (f.daysSinceLastSeen === 0) {
          line += ` (seen just now / today)`;
        }
        return line;
      }).join("; ");
      userPrompt += `\n\nPeople I recognize here: ${faceLines}. Use their names naturally. Mention their relationship and when you last saw them if it's been a while (more than a day). If you just saw them today, don't mention timing.`;
    }

    // Memory only accompanies a question: what happened recently, then saved notes per person
    if (question && recentContext) {
      userPrompt += `\n\nWhat happened recently (newest first):\n${recentContext}`;
    }
    if (question) {
      for (const person of personNotes) {
        const notes = person.notes.map((note) => note.trim()).filter(Boolean);
        if (notes.length) userPrompt += `\n\nSaved notes about ${person.name.trim()}:\n- ${notes.join("\n- ")}`;
      }
    }

    if (previousDescription && mode === "general" && !question) {
      userPrompt += `\n\nLast time you said: "${previousDescription}"\nIf the scene is basically the same, keep it super brief or mention something different. Don't repeat yourself.`;
    }

    const deadline = Date.now() + REQUEST_BUDGET_MS;
    const timeLeft = () => deadline - Date.now();

    // ── Primary: Groq. Try each model in order until one succeeds ──
    let content: string | null = null;
    let lastError = "";
    let usedModel = "";

    for (const model of GROQ_API_KEY ? VISION_MODELS : []) {
      if (timeLeft() < MIN_ATTEMPT_MS) break;
      console.log("Trying Groq model:", model, "mode:", mode);
      
      try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(timeLeft()),
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: systemPrompt },
              {
                role: "user",
                content: [
                  {
                    type: "image_url",
                    image_url: {
                      url: imageBase64.startsWith("data:")
                        ? imageBase64
                        : `data:image/jpeg;base64,${imageBase64}`,
                    },
                  },
                  { type: "text", text: userPrompt },
                ],
              },
            ],
            max_tokens: 1000,
            temperature: 0.3,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          content = data.choices?.[0]?.message?.content || "";
          usedModel = model;
          break;
        }

        const errorText = await res.text();
        console.warn(`Model ${model} failed (${res.status}), trying next...`, errorText.slice(0, 200));
        lastError = `${model}: ${res.status}`;
      } catch (fetchErr) {
        console.warn(`Model ${model} fetch error:`, fetchErr);
        lastError = `${model}: fetch error`;
      }
    }

    // ── Fallback: Gemini (Google's API directly, with the student's own key) ──
    if (content === null && GEMINI_API_KEY && timeLeft() >= MIN_ATTEMPT_MS) {
      console.log(GROQ_API_KEY ? "Groq failed, falling back to Gemini:" : "Groq not configured, using Gemini:", GEMINI_MODEL);
      // First try with thinking set to "low" for latency. If the API rejects thinkingConfig
      // (e.g. a GEMINI_MODEL override that doesn't support it), retry once without it.
      for (const thinkingLevel of ["low", null]) {
        if (timeLeft() < MIN_ATTEMPT_MS) break;
        try {
          const res = await fetch(geminiUrl(GEMINI_MODEL), {
            method: "POST",
            headers: {
              "x-goog-api-key": GEMINI_API_KEY,
              "Content-Type": "application/json",
            },
            signal: AbortSignal.timeout(timeLeft()),
            body: JSON.stringify(buildGeminiRequest({ systemPrompt, userPrompt, imageBase64, thinkingLevel })),
          });

          if (res.ok) {
            const { text, reason } = extractGeminiText(await res.json());
            if (text) {
              content = text;
              usedModel = `${GEMINI_MODEL} (Gemini)`;
            } else {
              console.warn("Gemini returned no text:", reason);
              lastError = `${GEMINI_MODEL}: ${reason}`;
            }
            break;
          }

          const errText = await res.text();
          console.warn(`Gemini ${GEMINI_MODEL} failed (${res.status}):`, errText.slice(0, 200));
          lastError = `${GEMINI_MODEL}: ${res.status}`;
          if (!(res.status === 400 && thinkingLevel && /thinking/i.test(errText))) break;
        } catch (geminiErr) {
          console.warn("Gemini fetch error:", geminiErr);
          lastError = `${GEMINI_MODEL}: fetch error`;
          break;
        }
      }
    }

    // ── Fallback: Claude (Anthropic API) ──
    if (content === null && ANTHROPIC_API_KEY && timeLeft() >= MIN_ATTEMPT_MS) {
      console.log(GROQ_API_KEY || GEMINI_API_KEY ? "Earlier providers failed, falling back to Claude:" : "Groq and Gemini not configured, using Claude:", CLAUDE_MODEL);
      try {
        // Fail fast within the shared budget instead of using the SDK defaults
        // (10-minute timeout, 2 retries).
        const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY, timeout: timeLeft(), maxRetries: 0 });
        const msg = await anthropic.beta.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: 16000,
          // Low effort keeps latency down; the capture loop waits on this call.
          output_config: { effort: "low" },
          // Retry on another model if Claude declines the request.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: systemPrompt,
          messages: [{
            role: "user",
            content: [toClaudeImage(imageBase64), { type: "text", text: userPrompt }],
          }],
        });

        if (msg.stop_reason === "refusal") {
          console.warn("Claude declined the request:", msg.stop_details?.category ?? "unknown");
          lastError = `${CLAUDE_MODEL}: refusal`;
        } else {
          const text = msg.content
            .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
            .map((b) => b.text)
            .join("");
          if (text.trim()) {
            content = text;
            usedModel = `${msg.model} (Claude fallback)`;
          } else {
            console.warn("Claude returned no text, stop_reason:", msg.stop_reason);
            lastError = `${CLAUDE_MODEL}: empty response`;
          }
        }
      } catch (claudeErr) {
        if (claudeErr instanceof Anthropic.APIError) {
          console.error("Claude fallback failed:", claudeErr.status, claudeErr.message);
        } else {
          console.error("Claude fallback error:", claudeErr);
        }
        lastError = `${CLAUDE_MODEL}: error`;
      }
    }

    // ── Last fallback: Lovable AI Gateway (Gemini) ──
    // Legacy: LOVABLE_API_KEY exists only on Lovable Cloud (where the app was first built).
    // On your own Supabase project, use GEMINI_API_KEY above instead.
    if (content === null) {
      if (LOVABLE_API_KEY && timeLeft() >= MIN_ATTEMPT_MS) {
        console.log("Earlier providers unavailable, falling back to Lovable AI Gateway (Gemini)");
        try {
          const geminiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            signal: AbortSignal.timeout(timeLeft()),
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                { role: "system", content: systemPrompt },
                {
                  role: "user",
                  content: [
                    {
                      type: "image_url",
                      image_url: {
                        url: imageBase64.startsWith("data:")
                          ? imageBase64
                          : `data:image/jpeg;base64,${imageBase64}`,
                      },
                    },
                    { type: "text", text: userPrompt },
                  ],
                },
              ],
              max_tokens: 1000,
              temperature: 0.3,
            }),
          });

          if (geminiRes.ok) {
            const data = await geminiRes.json();
            content = data.choices?.[0]?.message?.content || "";
            usedModel = "google/gemini-2.5-flash (fallback)";
          } else {
            const errText = await geminiRes.text();
            console.error("Gemini fallback also failed:", geminiRes.status, errText.slice(0, 200));
            lastError = `gemini: ${geminiRes.status}`;
          }
        } catch (geminiErr) {
          console.error("Gemini fallback fetch error:", geminiErr);
          lastError = "gemini: fetch error";
        }
      }
    }

    if (content === null) {
      console.error("All models failed. Last error:", lastError);
      return new Response(
        JSON.stringify({ error: "All vision models are currently unavailable. Please try again in a moment." }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log("Vision response received from model:", usedModel, "mode:", mode);

    // Strip leaked Llama chat-template headers (e.g. "<|start_header_id|>assistant<|end_header_id|>")
    // without deleting the real word "assistant" from descriptions.
    content = content
      .replace(/<\|start_header_id\|>\s*assistant\s*<\|end_header_id\|>/g, "")
      .replace(/<\|[^|]*\|>/g, "")
      // Qwen can emit its reasoning as <think>...</think> before the answer. Drop it so the
      // JSON match below doesn't start inside the reasoning.
      .replace(/<think>[\s\S]*?<\/think>/g, "");
    
    // Parse JSON from response with multiple fallback strategies
    let result: VisionResult = { text_content: "", description: "", hazards: [], priority: 5 };
    let parsed = false;
    
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[0]
          // Intentionally strip raw control characters that break JSON.parse
          // eslint-disable-next-line no-control-regex
          .replace(/[\x00-\x1F\x7F]/g, " ")
          .replace(/,\s*}/g, "}")
          .replace(/,\s*]/g, "]");
        
        const p = JSON.parse(jsonStr);
        result = {
          text_content: p.text_content || "",
          description: p.description || "",
          hazards: Array.isArray(p.hazards) ? p.hazards : [],
          priority: Math.min(10, Math.max(1, Number(p.priority) || 5)),
        };

        // For finder mode, include the "found" field
        if (mode === "finder") {
          result.found = p.found === true || p.found === "true";
        }

        parsed = true;
      }
    } catch (parseError) {
      console.warn("JSON.parse failed, trying regex extraction:", parseError);
    }
    
    // Fallback: extract description via regex if JSON parse failed
    if (!parsed || !result.description) {
      const descMatch = content.match(/"description"\s*:\s*"([^"]+)"/);
      if (descMatch) {
        result.description = descMatch[1];
      } else {
        result.description = content
          .replace(/[{}":[\]]/g, "")
          .replace(/text_content|description|hazards|priority|found/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 200) || "I'm having trouble seeing right now, one sec.";
      }
    }

    // For finder mode, also try to extract "found" from raw content if not parsed
    if (mode === "finder" && result.found === undefined) {
      const foundMatch = content.match(/"found"\s*:\s*(true|false)/);
      result.found = foundMatch ? foundMatch[1] === "true" : false;
    }

    return new Response(
      JSON.stringify(result),
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
