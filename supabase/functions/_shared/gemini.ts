// Pure helpers for calling the Gemini API's generateContent method directly with the
// student's own GEMINI_API_KEY. No Deno or npm imports, so Vitest can test this file too.
//
// Request/response shapes follow the official reference (checked 2026-10-09):
//   https://ai.google.dev/api/generate-content
//   https://ai.google.dev/gemini-api/docs/migrate-to-interactions ("generateContent remains
//   fully supported"; Google recommends the newer Interactions API for new projects)
// JSON keys are camelCase as in the reference (Part.inlineData, Blob.mimeType).

export const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export function geminiUrl(model: string): string {
  return `${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent`;
}

// Accepts a data URL or bare base64 (assumed JPEG, which is what LiveCamera sends).
export function splitImageDataUrl(imageBase64: string): { mimeType: string; data: string } {
  const match = imageBase64.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  return match
    ? { mimeType: match[1].toLowerCase(), data: match[2] }
    : { mimeType: "image/jpeg", data: imageBase64 };
}

export interface GeminiRequestInput {
  systemPrompt: string;
  userPrompt: string;
  imageBase64: string;
  // Lower thinking = lower latency. The capture loop waits on this call, so the default is
  // "low". Pass null to leave thinkingConfig out (used as a retry if the API rejects it).
  thinkingLevel?: string | null;
}

export function buildGeminiRequest({
  systemPrompt,
  userPrompt,
  imageBase64,
  thinkingLevel = "low",
}: GeminiRequestInput): Record<string, unknown> {
  const image = splitImageDataUrl(imageBase64);
  const generationConfig: Record<string, unknown> = {
    // Ask for bare JSON; the shared parser in analyze-image still copes with extra text.
    responseMimeType: "application/json",
    temperature: 0.3,
    // Room for the JSON answer plus any thinking tokens.
    maxOutputTokens: 2048,
  };
  if (thinkingLevel) {
    generationConfig.thinkingConfig = { thinkingLevel };
  }
  return {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: image.mimeType, data: image.data } },
          { text: userPrompt },
        ],
      },
    ],
    generationConfig,
  };
}

export interface GeminiText {
  text: string;
  // Why there is no text: promptFeedback.blockReason or candidates[0].finishReason.
  reason?: string;
}

interface GeminiPart {
  text?: unknown;
  thought?: unknown;
}

// Reads candidates[0].content.parts[].text, skipping any parts marked as thoughts.
export function extractGeminiText(response: unknown): GeminiText {
  const r = (response ?? {}) as {
    candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  const candidate = r.candidates?.[0];
  if (!candidate) {
    return { text: "", reason: r.promptFeedback?.blockReason ?? "no candidates" };
  }
  const text = (candidate.content?.parts ?? [])
    .filter((p) => p.thought !== true && typeof p.text === "string")
    .map((p) => p.text as string)
    .join("");
  return text.trim() ? { text } : { text: "", reason: candidate.finishReason ?? "empty response" };
}
