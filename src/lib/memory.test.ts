import { describe, expect, it } from "vitest";
import {
  capPersonNotes,
  isTimelineMemory,
  lastTimeSentence,
  peopleNamedIn,
  personNotesLength,
  selectPersonNotes,
  sightingDue,
  SIGHTING_INTERVAL_MS,
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

describe("lastTimeSentence", () => {
  it("speaks only the note's first sentence, in its own words", () => {
    expect(
      lastTimeSentence(
        "Arjun and I met for coffee at the café near the park. He is training for a half marathon.",
      ),
    ).toBe("Last time: Arjun and I met for coffee at the café near the park.");
  });

  it("does not cut a sentence at a title like Dr.", () => {
    expect(lastTimeSentence("Saw Dr. Rao about my knee. She said rest it.")).toBe(
      "Last time: Saw Dr. Rao about my knee.",
    );
  });

  it("adds a period to a note without one and caps long sentences", () => {
    expect(lastTimeSentence("  coffee   on Sunday ")).toBe("Last time: coffee on Sunday.");
    const long = lastTimeSentence(`${"We talked about the trip ".repeat(10)}today.`);
    expect(long.length).toBeLessThanOrEqual("Last time: ".length + 121);
    expect(long.endsWith("…")).toBe(true);
  });

  it("says nothing for an empty note", () => {
    expect(lastTimeSentence("   ")).toBe("");
  });
});

describe("notes for a spoken question", () => {
  const memories = [
    { ...note(1, 1, "Arjun recommended The Alchemist and offered his copy.", "2026-09-01"), title: "Book" },
    { ...note(2, 1, "We walked by the lake.", "2026-09-20"), title: "Walk" },
    { ...note(3, 1, "Coffee at the park café.", "2026-10-01"), title: "Coffee" },
    { ...note(4, 2, "Meera's book club meets on Friday.", "2026-10-02"), title: "Club" },
    { ...note(5, 1, "Seen at 9:05 AM on 3 Oct 2026.", "2026-10-03"), title: "Seen", source: "sighting" as const },
  ];

  it("returns the person's BM25 matches, dated and in their own words", () => {
    expect(selectPersonNotes(memories, 1, "what book did he recommend?")).toEqual([
      "1 Sept 2026 — Book: Arjun recommended The Alchemist and offered his copy.",
      "Last recorded sighting: Seen at 9:05 AM on 3 Oct 2026.",
    ]);
  });

  it("falls back to the newest two written notes when nothing matches", () => {
    expect(selectPersonNotes(memories, 1, "what did we talk about?")).toEqual([
      "1 Oct 2026 — Coffee: Coffee at the park café.",
      "20 Sept 2026 — Walk: We walked by the lake.",
      "Last recorded sighting: Seen at 9:05 AM on 3 Oct 2026.",
    ]);
  });

  it("keeps at most three matches", () => {
    const many = [1, 2, 3, 4, 5].map((id) => note(id, 1, `The book number ${id}.`));
    expect(selectPersonNotes(many, 1, "book")).toHaveLength(3);
  });

  it("caps the total size, clipping the note that doesn't fit", () => {
    const people = [
      { name: "Arjun", notes: ["a ".repeat(200).trim(), "b ".repeat(200).trim()] },
      { name: "Meera", notes: ["c ".repeat(300).trim()] },
    ];
    const capped = capPersonNotes(people, 1200);
    expect(personNotesLength(capped)).toBeLessThanOrEqual(1200);
    expect(capped.map((person) => person.name)).toEqual(["Arjun", "Meera"]);
    expect(capped[1].notes[0].endsWith("…")).toBe(true);
    expect(capPersonNotes(people, 30)).toEqual([]);
  });

  it("finds people named in the question", () => {
    const people = [
      { id: 1, name: "Arjun Mehta" },
      { id: 2, name: "Meera Rao" },
      { id: 3, name: "Al" },
    ];
    expect(peopleNamedIn("What book did Arjun recommend?", people).map((p) => p.id)).toEqual([1]);
    expect(peopleNamedIn("Is it all right?", people)).toEqual([]);
  });
});

describe("sightings", () => {
  it("are kept out of the timeline", () => {
    expect(isTimelineMemory(note(1, 1, "x"))).toBe(true);
    expect(isTimelineMemory({ ...note(1, 1, "x"), source: "sighting" })).toBe(false);
  });

  it("are logged at most once per interval", () => {
    expect(sightingDue(undefined, 0)).toBe(true);
    expect(sightingDue(1_000, 1_000 + SIGHTING_INTERVAL_MS - 1)).toBe(false);
    expect(sightingDue(1_000, 1_000 + SIGHTING_INTERVAL_MS)).toBe(true);
  });
});
