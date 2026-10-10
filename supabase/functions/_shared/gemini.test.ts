import { describe, expect, it } from "vitest";
import { buildGeminiRequest, extractGeminiText, geminiUrl, splitImageDataUrl } from "./gemini";

describe("splitImageDataUrl", () => {
  it("reads the MIME type and data from a data URL", () => {
    expect(splitImageDataUrl("data:image/png;base64,AAAA")).toEqual({ mimeType: "image/png", data: "AAAA" });
  });

  it("treats bare base64 as JPEG", () => {
    expect(splitImageDataUrl("/9j/AAAA")).toEqual({ mimeType: "image/jpeg", data: "/9j/AAAA" });
  });
});

describe("geminiUrl", () => {
  it("builds the generateContent endpoint for a model", () => {
    expect(geminiUrl("gemini-3.8-flash")).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
    );
  });
});

describe("buildGeminiRequest", () => {
  const input = { systemPrompt: "SYS", userPrompt: "What's here?", imageBase64: "data:image/jpeg;base64,QUJD" };

  it("puts the system prompt, image and text in generateContent's shape", () => {
    const body = buildGeminiRequest(input);
    expect(body.systemInstruction).toEqual({ parts: [{ text: "SYS" }] });
    expect(body.contents).toEqual([
      {
        role: "user",
        parts: [{ inlineData: { mimeType: "image/jpeg", data: "QUJD" } }, { text: "What's here?" }],
      },
    ]);
    expect(body.generationConfig).toMatchObject({
      responseMimeType: "application/json",
      thinkingConfig: { thinkingLevel: "low" },
    });
  });

  it("leaves thinkingConfig out when thinkingLevel is null", () => {
    const body = buildGeminiRequest({ ...input, thinkingLevel: null });
    expect(body.generationConfig).not.toHaveProperty("thinkingConfig");
  });
});

describe("extractGeminiText", () => {
  it("joins the text parts of the first candidate and skips thoughts", () => {
    const res = {
      candidates: [{
        content: { parts: [{ text: "thinking...", thought: true }, { text: '{"description":' }, { text: '"hi"}' }] },
        finishReason: "STOP",
      }],
    };
    expect(extractGeminiText(res)).toEqual({ text: '{"description":"hi"}' });
  });

  it("reports a blocked prompt", () => {
    expect(extractGeminiText({ promptFeedback: { blockReason: "SAFETY" } })).toEqual({ text: "", reason: "SAFETY" });
  });

  it("reports the finish reason when a candidate has no text", () => {
    expect(extractGeminiText({ candidates: [{ content: { parts: [] }, finishReason: "MAX_TOKENS" }] }))
      .toEqual({ text: "", reason: "MAX_TOKENS" });
  });
});
