import { describe, expect, it } from "vitest";
import { readerSpeech } from "./readerSpeech";

describe("readerSpeech", () => {
  it("does not repeat context the text already opens with (deployed server output)", () => {
    const text = 'This looks like a cafe menu. It says: "Cafe Menu." Then, "Masala Dosa, one hundred twenty rupees."';
    expect(readerSpeech("Looks like a cafe menu.", text)).toBe(text);
  });

  it("prefixes the context when the text is only the text", () => {
    expect(readerSpeech("Looks like a cafe menu.", "Masala Dosa, one hundred twenty rupees.")).toBe(
      "Looks like a cafe menu. Masala Dosa, one hundred twenty rupees.",
    );
  });

  it("skips context whose words already start the text", () => {
    expect(readerSpeech("A cafe menu", "A cafe menu: masala dosa, filter coffee")).toBe(
      "A cafe menu: masala dosa, filter coffee",
    );
  });

  it("falls back to the description when there is no text", () => {
    expect(readerSpeech("No text here, just a wall.", "")).toBe("No text here, just a wall.");
  });
});
