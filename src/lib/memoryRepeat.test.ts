import { describe, expect, it } from "vitest";
import { MEMORY_REPEAT_MS, shouldSpeakMemory } from "./memoryRepeat";

describe("shouldSpeakMemory", () => {
  it("speaks a memory that was never spoken", () => {
    expect(shouldSpeakMemory(undefined, 0)).toBe(true);
  });

  it("does not repeat it within 60 seconds", () => {
    expect(shouldSpeakMemory(1_000, 1_000 + MEMORY_REPEAT_MS - 1)).toBe(false);
  });

  it("allows it again after 60 seconds", () => {
    expect(shouldSpeakMemory(1_000, 1_000 + MEMORY_REPEAT_MS)).toBe(true);
  });
});
