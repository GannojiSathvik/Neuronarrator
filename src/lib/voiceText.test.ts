import { describe, expect, it } from "vitest";
import { normalizeTranscript, transcriptCandidates } from "./voiceText";

describe("normalizeTranscript", () => {
  it("lowercases, strips punctuation and collapses spaces", () => {
    expect(normalizeTranscript("  Find   my KEYS, please!  ")).toBe("find my keys please");
  });

  it("keeps apostrophes inside words", () => {
    expect(normalizeTranscript("What's in front?")).toBe("what's in front");
  });

  it.each(["Neural, find keys", "nero find keys", "new row find keys", "euro find keys", "Neuro find keys"])(
    "spells the misheard wake word in '%s' as neuro",
    (transcript) => {
      expect(normalizeTranscript(transcript)).toBe("neuro find keys");
    },
  );

  it("doesn't rewrite words that merely contain a wake-word spelling", () => {
    expect(normalizeTranscript("neurology europe")).toBe("neurology europe");
  });
});

describe("transcriptCandidates", () => {
  it("joins final and interim segments in order", () => {
    expect(
      transcriptCandidates([
        { isFinal: true, alternatives: ["where is my"] },
        { isFinal: false, alternatives: ["phone"] },
      ]),
    ).toEqual(["where is my phone"]);
  });

  it("builds one reading per alternative, falling back to a segment's best guess", () => {
    expect(
      transcriptCandidates([
        { isFinal: true, alternatives: ["find my"] },
        { isFinal: true, alternatives: ["kiss", "keys"] },
      ]),
    ).toEqual(["find my kiss", "find my keys"]);
  });

  it("returns nothing for an empty session", () => {
    expect(transcriptCandidates([])).toEqual([]);
  });
});
