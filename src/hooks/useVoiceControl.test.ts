import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseCommand, useVoiceControl } from "./useVoiceControl";

describe("parseCommand (push-to-talk)", () => {
  it("maps currency phrases, including Hindi, to currency mode", () => {
    expect(parseCommand("Count notes")).toEqual({ mode: "currency", targetItem: "" });
    expect(parseCommand("kitne paise hai")).toEqual({ mode: "currency", targetItem: "" });
  });

  it("extracts the target item for finder commands", () => {
    expect(parseCommand("Find my keys")).toEqual({ mode: "finder", targetItem: "keys" });
    expect(parseCommand("where is my water bottle?")).toEqual({ mode: "finder", targetItem: "water bottle" });
    expect(parseCommand("look for the remote please")).toEqual({ mode: "finder", targetItem: "remote" });
  });

  it("maps describe phrases to standard mode", () => {
    expect(parseCommand("What do you see")).toEqual({ mode: "standard", targetItem: "" });
  });

  it.each(["read", "Read this", "read text", "What does it say?", "read the sign", "padho", "tell me what it says"])(
    "maps '%s' to reader mode",
    (phrase) => {
      expect(parseCommand(phrase)).toEqual({ mode: "reader", targetItem: "" });
    },
  );

  it("keeps describe phrases in standard mode now that 'read' has its own mode", () => {
    for (const phrase of ["describe", "what is this", "look around", "standard"]) {
      expect(parseCommand(phrase)).toEqual({ mode: "standard", targetItem: "" });
    }
  });

  it("does not treat words that merely contain 'read' as a read command", () => {
    expect(parseCommand("I'm ready")).toBeNull();
  });

  it("returns null for unrecognised speech", () => {
    expect(parseCommand("hello there")).toBeNull();
  });

  it("checks finder before currency, so 'find my money' looks for the money", () => {
    expect(parseCommand("find my money")).toEqual({ mode: "finder", targetItem: "money" });
  });

  it("checks finder before reader, so 'find my reading glasses' looks for the glasses", () => {
    expect(parseCommand("find my reading glasses")).toEqual({ mode: "finder", targetItem: "reading glasses" });
    expect(parseCommand("where is my book I was reading")).toEqual({ mode: "finder", targetItem: "book i was reading" });
  });
});

class MockRecognition {
  static current: MockRecognition;
  onstart?: () => void;
  onend?: () => void;
  onresult?: (event: { results: { isFinal: boolean; 0: { transcript: string } }[] }) => void;
  constructor() { MockRecognition.current = this; }
  start() { this.onstart?.(); }
  stop() { this.onend?.(); }
  abort() {}
  respond(transcript: string) {
    this.onresult?.({ results: [{ isFinal: true, 0: { transcript } }] });
    this.onend?.();
  }
}

describe("push-to-talk command routing", () => {
  beforeEach(() => {
    vi.stubGlobal("SpeechRecognition", MockRecognition);
    vi.stubGlobal("speechSynthesis", undefined);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it.each([
    ["find my money", "finder", "money"],
    ["where is my currency", "finder", "currency"],
    ["find my keys", "finder", "keys"],
    ["count notes", "currency", ""],
    ["how much money", "currency", ""],
    ["describe", "standard", ""],
    ["read this", "reader", ""],
  ] as const)("routes '%s' to %s", (command, mode, target) => {
    const { result } = renderHook(() => useVoiceControl());
    act(() => result.current.startListening());
    act(() => MockRecognition.current.respond(command));
    expect(result.current.commandMode).toBe(mode);
    expect(result.current.targetItem).toBe(target);
  });
});
