import { describe, expect, it } from "vitest";
import { pickFemaleVoice } from "./femaleVoice";

const v = (name: string, lang = "en-US") => ({ name, lang });

describe("pickFemaleVoice", () => {
  it("never picks Rishi, the male en-IN voice macOS uses by default", () => {
    const voices = [v("Rishi", "en-IN"), v("Veena", "en-IN"), v("Daniel", "en-GB")];
    expect(pickFemaleVoice(voices)?.name).toBe("Veena");
  });

  it("prefers Chrome's smooth Google female voice when present", () => {
    const voices = [v("Rishi", "en-IN"), v("Samantha"), v("Google UK English Female", "en-GB")];
    expect(pickFemaleVoice(voices)?.name).toBe("Google UK English Female");
  });

  it("falls back to an English voice that isn't a known male one", () => {
    const voices = [v("Rishi", "en-IN"), v("Daniel", "en-GB"), v("Nicky", "en-US")];
    expect(pickFemaleVoice(voices)?.name).toBe("Nicky");
  });

  it("returns null when only male voices exist, keeping the browser default", () => {
    expect(pickFemaleVoice([v("Rishi", "en-IN"), v("Daniel", "en-GB")])).toBeNull();
  });
});
