import { describe, it, expect } from "vitest";
import { charToVibrationPattern } from "./useHapticBraille";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

describe("charToVibrationPattern", () => {
  it("gives every letter A-Z a distinct pattern", () => {
    const seen = new Map<string, string>();
    for (const letter of LETTERS) {
      const key = JSON.stringify(charToVibrationPattern(letter));
      expect(seen.get(key), `${letter} feels the same as ${seen.get(key)}`).toBeUndefined();
      seen.set(key, letter);
    }
  });

  it("buzzes for all six dot slots with no zero-length vibration", () => {
    for (const letter of LETTERS) {
      const pattern = charToVibrationPattern(letter);
      expect(pattern).not.toBeNull();
      // navigator.vibrate alternates buzz, pause, buzz...: six buzzes and five gaps
      expect(pattern).toHaveLength(11);
      const buzzes = pattern!.filter((_, i) => i % 2 === 0);
      expect(buzzes.every((ms) => ms > 0), `${letter}: ${pattern}`).toBe(true);
    }
  });

  it("keeps letters that differ only by a leading blank dot apart", () => {
    // These pairs used to collapse because a leading absent dot was pure silence
    for (const [a, b] of [["I", "K"], ["J", "M"], ["L", "S"], ["N", "W"], ["P", "T"]]) {
      expect(charToVibrationPattern(a)).not.toEqual(charToVibrationPattern(b));
    }
  });

  it("returns an empty pattern for a space and null for unmapped characters", () => {
    expect(charToVibrationPattern(" ")).toEqual([]);
    expect(charToVibrationPattern("?")).toBeNull();
  });
});
