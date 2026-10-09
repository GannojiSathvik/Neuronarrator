import { describe, expect, it } from "vitest";
import {
  memoryExcerpt,
  searchMemories,
  tokenize,
  validateMemory,
  type ConversationMemory,
} from "./memory";

const note = (
  id: number,
  personId: number,
  body: string,
  occurredAt = "2026-10-01",
): ConversationMemory => ({
  id,
  personId,
  body,
  title: "A moment",
  occurredAt: new Date(occurredAt),
  createdAt: new Date(occurredAt),
  source: "note",
});

describe("person-scoped recall", () => {
  const memories = [
    note(1, 1, "Arjun brought coffee to the park.", "2026-10-01"),
    note(2, 1, "We planned a weekend walk.", "2026-10-03"),
    note(3, 2, "Meera likes coffee and coffee cake.", "2026-10-04"),
  ];
  it("never retrieves another person’s matching notes", () => {
    expect(
      searchMemories(memories, 1, "coffee").map((hit) => hit.memory.id),
    ).toEqual([1]);
    expect(searchMemories(memories, 1, "cake")).toEqual([]);
  });
  it("uses chronological order for an empty query", () => {
    expect(
      searchMemories(memories, 1, "  ").map((hit) => hit.memory.id),
    ).toEqual([2, 1]);
  });
  it("returns no invented result for missing topics or stopwords", () => {
    expect(searchMemories(memories, 1, "passport")).toEqual([]);
    expect(searchMemories(memories, 1, "what did we talk about")).toEqual([]);
    expect(searchMemories(memories, 99, "coffee")).toEqual([]);
  });
  it("ranks a note matching both query topics above a partial match", () => {
    const hits = searchMemories(
      [
        note(1, 1, "Coffee in the park"),
        note(2, 1, "Coffee at home"),
        note(3, 1, "A quiet afternoon"),
      ],
      1,
      "coffee park",
    );
    expect(hits.map((hit) => hit.memory.id)).toEqual([1, 2]);
    expect(hits[0].matchedTerms).toEqual(["coffee", "park"]);
  });
  it("handles punctuation and non-English words without losing accents", () => {
    expect(tokenize("The CAFÉ, café! नमस्ते")).toContain("café");
    expect(
      searchMemories([note(1, 1, "Met at the café.")], 1, "CAFÉ!"),
    ).toHaveLength(1);
  });
  it("does not modify the source text when producing a short reminder", () => {
    expect(memoryExcerpt("  We   met yesterday. ")).toBe("We met yesterday.");
    expect(
      memoryExcerpt(
        "We talked about our weekend plans and shared a coffee.",
        20,
      ),
    ).toBe("We talked about our…");
  });
  it("rejects blank, oversized, invalid-date, and future notes", () => {
    const valid = {
      title: "Coffee",
      body: "Met for coffee.",
      occurredAt: new Date("2020-01-01"),
    };
    expect(() => validateMemory(valid)).not.toThrow();
    expect(() => validateMemory({ ...valid, title: "  " })).toThrow();
    expect(() =>
      validateMemory({ ...valid, body: "a".repeat(6001) }),
    ).toThrow();
    expect(() =>
      validateMemory({ ...valid, occurredAt: new Date("invalid") }),
    ).toThrow();
    expect(() =>
      validateMemory({
        ...valid,
        occurredAt: new Date(Date.now() + 86_400_000),
      }),
    ).toThrow();
  });
});
