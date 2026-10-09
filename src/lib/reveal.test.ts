import { describe, expect, it } from "vitest";
import { CHAR_REVEAL_MS, WORD_REVEAL_MS, revealDurationMs, revealedCount, revealText, revealUnits } from "./reveal";

describe("revealUnits", () => {
  it("splits words keeping their spacing, so joining gives the text back", () => {
    const text = "You're in  a bright office.";
    expect(revealUnits(text, "word")).toEqual(["You're ", "in  ", "a ", "bright ", "office."]);
    expect(revealUnits(text, "word").join("")).toBe(text);
  });

  it("splits characters, keeping emoji whole", () => {
    expect(revealUnits("a👋b", "char")).toEqual(["a", "👋", "b"]);
  });

  it("handles empty text", () => {
    expect(revealUnits("", "word")).toEqual([]);
  });
});

describe("revealedCount", () => {
  it("adds one unit per tick and stops at the total", () => {
    expect(revealedCount(0, 10, CHAR_REVEAL_MS)).toBe(0);
    expect(revealedCount(29, 10, CHAR_REVEAL_MS)).toBe(0);
    expect(revealedCount(30, 10, CHAR_REVEAL_MS)).toBe(1);
    expect(revealedCount(95, 10, CHAR_REVEAL_MS)).toBe(3);
    expect(revealedCount(10_000, 10, CHAR_REVEAL_MS)).toBe(10);
  });

  it("shows nothing during a start delay (negative elapsed)", () => {
    expect(revealedCount(-200, 10, WORD_REVEAL_MS)).toBe(0);
  });

  it("shows everything at once with no per-unit delay", () => {
    expect(revealedCount(0, 10, 0)).toBe(10);
  });
});

describe("revealText / revealDurationMs", () => {
  it("returns the first N units", () => {
    expect(revealText("one two three", "word", 2)).toBe("one two ");
    expect(revealText("abc", "char", 2)).toBe("ab");
    expect(revealText("abc", "char", 99)).toBe("abc");
  });

  it("takes about 30ms per character and 40ms per word", () => {
    expect(revealDurationMs("abcd", "char", CHAR_REVEAL_MS)).toBe(120);
    expect(revealDurationMs("one two three", "word", WORD_REVEAL_MS)).toBe(120);
  });
});
