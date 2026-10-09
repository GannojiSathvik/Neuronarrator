import { describe, expect, it } from "vitest";
import {
  WORKING_MEMORY_WINDOW_MS,
  WorkingMemory,
  ago,
  recordFace,
  recordFrame,
  recordQuestion,
} from "./workingMemory";

const T = 1_000_000;
const s = (seconds: number) => T + seconds * 1000;

describe("ago", () => {
  it("renders compact relative times", () => {
    expect(ago(400)).toBe("just now");
    expect(ago(8_000)).toBe("8s ago");
    expect(ago(65_000)).toBe("1m ago");
  });
});

describe("WorkingMemory", () => {
  it("forgets entries older than the window", () => {
    const memory = new WorkingMemory();
    memory.record("scene", "A desk with a laptop.", s(0));
    memory.record("scene", "A busy street with traffic.", s(100));
    const later = s(0) + WORKING_MEMORY_WINDOW_MS + 1;
    expect(memory.recentWithin(WORKING_MEMORY_WINDOW_MS, later).map((e) => e.text)).toEqual([
      "A busy street with traffic.",
    ]);
  });

  it("returns only entries within the asked-for time, newest first", () => {
    const memory = new WorkingMemory();
    memory.record("scene", "A desk with a laptop.", s(0));
    memory.record("text", "EXIT", s(10));
    memory.record("hazard", "stairs", s(20));
    expect(memory.recentWithin(15_000, s(22)).map((e) => e.kind)).toEqual(["hazard", "text"]);
  });

  it("merges a rephrased scene instead of adding it, keeping the first wording", () => {
    const memory = new WorkingMemory();
    memory.record("scene", "A desk with a laptop and a coffee mug.", s(0));
    memory.record("scene", "You're facing a desk with a laptop and a mug of coffee.", s(5));
    memory.record("scene", "Still the same desk and laptop.", s(10));
    const entries = memory.recentWithin(60_000, s(10));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ text: "A desk with a laptop and a coffee mug.", at: s(0), lastAt: s(10) });
  });

  it("treats returning to an earlier scene as new", () => {
    const memory = new WorkingMemory();
    memory.record("scene", "A desk with a laptop.", s(0));
    memory.record("scene", "A busy street with traffic.", s(5));
    memory.record("scene", "A desk with a laptop.", s(10));
    expect(memory.recentWithin(60_000, s(10))).toHaveLength(3);
  });

  it("never merges questions or answers", () => {
    const memory = new WorkingMemory();
    recordQuestion(memory, "what am I holding", "a red mug", s(0));
    recordQuestion(memory, "what am I holding", "a red mug", s(1));
    expect(memory.recentWithin(60_000, s(1))).toHaveLength(2);
  });

  it("keeps the same person as one appearance, and a new one after a gap", () => {
    const memory = new WorkingMemory();
    const ronit = { known: true, id: 7, name: "Ronit", relation: "Friend" };
    recordFace(memory, ronit, s(0));
    recordFace(memory, ronit, s(30));
    expect(memory.recentWithin(WORKING_MEMORY_WINDOW_MS, s(30))).toHaveLength(1);
    recordFace(memory, ronit, s(30 + 61));
    expect(memory.recentWithin(WORKING_MEMORY_WINDOW_MS, s(91))).toHaveLength(2);
  });

  it("keeps an unknown face apart from known people", () => {
    const memory = new WorkingMemory();
    recordFace(memory, { known: true, id: 7, name: "Ronit" }, s(0));
    recordFace(memory, { known: false }, s(1));
    recordFace(memory, { known: false }, s(2));
    expect(memory.recentWithin(60_000, s(2)).map((e) => e.text)).toEqual([
      "an unknown person appeared",
      "Ronit appeared",
    ]);
    expect(memory.recentPeople(s(2))).toEqual([7]);
  });

  it("caps the number of entries, dropping the oldest", () => {
    const memory = new WorkingMemory(WORKING_MEMORY_WINDOW_MS, 3);
    ["one", "two", "three", "four"].forEach((word, i) => recordQuestion(memory, word, null, s(i)));
    const texts = memory.recentWithin(60_000, s(4)).map((e) => e.text);
    expect(texts).toHaveLength(3);
    expect(texts[0]).toContain("four");
    expect(texts.join(" ")).not.toContain("one");
  });

  it("records a frame's scene, text and hazard", () => {
    const memory = new WorkingMemory();
    recordFrame(memory, { description: "Stairs going down ahead.", text_content: "EXIT", hazards: ["stairs"], priority: 8 }, s(0));
    recordFrame(memory, { description: "A quiet hallway.", text_content: "", hazards: [], priority: 2 }, s(5));
    expect(memory.recentWithin(60_000, s(5)).map((e) => e.kind)).toEqual(["scene", "hazard", "text", "scene"]);
  });
});

describe("summarize", () => {
  it("is empty with nothing to say", () => {
    expect(new WorkingMemory().summarize(T)).toBe("");
  });

  it("renders compact lines, newest first", () => {
    const memory = new WorkingMemory();
    recordQuestion(memory, "what am I holding", "a red mug", s(0));
    memory.record("scene", "a desk with a laptop", s(35));
    recordFace(memory, { known: true, id: 1, name: "Ronit", relation: "Friend" }, s(52));
    expect(memory.summarize(s(60)).split("\n")).toEqual([
      "8s ago: Ronit (Friend) appeared",
      "25s ago: scene — a desk with a laptop",
      "1m ago: you asked 'what am I holding' → 'a red mug'",
    ]);
  });

  it("notes when a person is still in view", () => {
    const memory = new WorkingMemory();
    recordFace(memory, { known: true, id: 1, name: "Ronit" }, s(0));
    recordFace(memory, { known: true, id: 1, name: "Ronit" }, s(20));
    expect(memory.summarize(s(22))).toBe("22s ago: Ronit appeared (still in view 2s ago)");
  });

  it("stays under the character cap but always keeps the newest line first", () => {
    const memory = new WorkingMemory();
    for (let i = 0; i < 30; i += 1) recordQuestion(memory, `question number ${i}`, `answer number ${i}`, s(i));
    const summary = memory.summarize(s(30), 200);
    expect(summary.length).toBeLessThanOrEqual(200);
    expect(summary.split("\n")[0]).toContain("question number 29");
    expect(summary).not.toContain("question number 0'");
  });

  it("clips a newest line longer than the cap instead of dropping it", () => {
    const memory = new WorkingMemory();
    memory.record("text", "word ".repeat(100), s(0));
    const summary = memory.summarize(s(1), 50);
    expect(summary.length).toBeLessThanOrEqual(50);
    expect(summary.startsWith("1s ago: read text")).toBe(true);
  });

  it("keeps the default summary under 800 characters even when full", () => {
    const memory = new WorkingMemory();
    for (let i = 0; i < 40; i += 1) recordQuestion(memory, `q ${i} ${"x".repeat(60)}`, "y".repeat(100), s(i));
    expect(memory.summarize(s(41)).length).toBeLessThanOrEqual(800);
  });
});
