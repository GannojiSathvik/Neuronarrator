import { describe, expect, it } from "vitest";
import { REPEAT_MEMORY_MS, isRephrasing, shouldSkipRepeat, similarity } from "./novelty";

describe("similarity", () => {
  it("ignores grammar and filler words", () => {
    expect(similarity("There is a desk in front of you.", "A desk.")).toBe(1);
  });

  it("is 0 for unrelated sentences", () => {
    expect(similarity("A desk with a laptop.", "A busy street with traffic.")).toBe(0);
  });
});

describe("isRephrasing", () => {
  it("treats the same scene reworded as a repeat", () => {
    expect(isRephrasing(
      "You're facing a desk with a laptop and a mug of coffee.",
      "A desk with a laptop and a coffee mug in front of you.",
    )).toBe(true);
    expect(isRephrasing(
      "A wooden table with a laptop and a coffee mug.",
      "A wooden table with a laptop, a coffee mug, and a lamp.",
    )).toBe(true);
  });

  it("treats a brief 'nothing changed' answer as a repeat", () => {
    expect(isRephrasing("Still the same desk and laptop.", "A desk with a laptop and a coffee mug.")).toBe(true);
    expect(isRephrasing("Nothing has changed.", "A desk with a laptop and a coffee mug.")).toBe(true);
  });

  it("speaks a newly mentioned object", () => {
    expect(isRephrasing(
      "A water bottle and a phone are next to the laptop now.",
      "A desk with a laptop and a coffee mug.",
    )).toBe(false);
    expect(isRephrasing(
      "An open door leads to a hallway with a staircase.",
      "A desk with a laptop and a coffee mug.",
    )).toBe(false);
  });

  it("speaks a person who just appeared, even in an otherwise identical sentence", () => {
    expect(isRephrasing(
      "A desk with a laptop, a coffee mug and a woman.",
      "A desk with a laptop and a coffee mug.",
    )).toBe(false);
  });

  it("speaks a changed number (currency, counts, prices)", () => {
    expect(isRephrasing("This is a one hundred rupee note.", "This is a two hundred rupee note.")).toBe(false);
    expect(isRephrasing("Masala dosa, 120 rupees.", "Masala dosa, 140 rupees.")).toBe(false);
    expect(isRephrasing("This is a one hundred rupee note.", "A one hundred rupee note.")).toBe(true);
  });

  it("compares read-mode text", () => {
    const menu = "Cafe Menu. Masala Dosa 120. Filter Coffee 40.";
    expect(isRephrasing("Cafe menu: Masala dosa 120, filter coffee 40", menu)).toBe(true);
    expect(isRephrasing("Chapter 2. The storm arrived at night.", menu)).toBe(false);
  });

  it("never treats empty text as a repeat", () => {
    expect(isRephrasing("", "A desk.")).toBe(false);
    expect(isRephrasing("A desk.", "")).toBe(false);
  });
});

describe("shouldSkipRepeat", () => {
  const last = { mode: "general", text: "A desk with a laptop and a coffee mug.", spokenAt: 1_000 };
  const same = "You're facing a desk with a laptop and a mug of coffee.";

  it("skips a rephrasing in the same mode", () => {
    expect(shouldSkipRepeat(last, "general", same, 6_000)).toBe(true);
  });

  it("speaks when nothing was said yet or the mode changed", () => {
    expect(shouldSkipRepeat(null, "general", same, 6_000)).toBe(false);
    expect(shouldSkipRepeat(last, "currency", same, 6_000)).toBe(false);
  });

  it("lets a repeat through after the silence window", () => {
    expect(shouldSkipRepeat(last, "general", same, 1_000 + REPEAT_MEMORY_MS - 1)).toBe(true);
    expect(shouldSkipRepeat(last, "general", same, 1_000 + REPEAT_MEMORY_MS)).toBe(false);
  });
});
