import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseCommand, pickCommand, useVoiceControl } from "./useVoiceControl";

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

  it("matches commands phrased as questions", () => {
    expect(parseCommand("where is my phone")).toEqual({ mode: "finder", targetItem: "phone" });
    expect(parseCommand("how much money is this")).toEqual({ mode: "currency", targetItem: "" });
    expect(parseCommand("can you read this label")).toEqual({ mode: "reader", targetItem: "" });
  });

  it("ignores a leading or misheard wake word", () => {
    expect(parseCommand("Neural, find my keys.")).toEqual({ mode: "finder", targetItem: "keys" });
  });

  it("returns null for unrecognised speech", () => {
    expect(parseCommand("hello there")).toBeNull();
    expect(parseCommand("what am I holding")).toBeNull();
  });

  it("checks finder before currency, so 'find my money' looks for the money", () => {
    expect(parseCommand("find my money")).toEqual({ mode: "finder", targetItem: "money" });
  });

  it("checks finder before reader, so 'find my reading glasses' looks for the glasses", () => {
    expect(parseCommand("find my reading glasses")).toEqual({ mode: "finder", targetItem: "reading glasses" });
    expect(parseCommand("where is my book I was reading")).toEqual({ mode: "finder", targetItem: "book i was reading" });
  });
});

describe("pickCommand", () => {
  it("uses the first alternative that parses when the top one is garbled", () => {
    expect(
      pickCommand([{ isFinal: true, alternatives: ["fine my kiss", "find my keys", "find my case"] }]),
    ).toEqual({ text: "find my keys", parsed: { mode: "finder", targetItem: "keys" } });
  });

  it("prefers the top alternative when it parses", () => {
    expect(pickCommand([{ isFinal: true, alternatives: ["count notes", "find notes"] }]).parsed).toEqual({
      mode: "currency",
      targetItem: "",
    });
  });

  it("reports the top reading when nothing parses", () => {
    expect(pickCommand([{ isFinal: true, alternatives: ["hello there", "yellow there"] }])).toEqual({
      text: "hello there",
      parsed: null,
    });
  });
});

type MockResult = { isFinal: boolean; length: number; [index: number]: { transcript: string } };
const result = (isFinal: boolean, ...alternatives: string[]): MockResult =>
  Object.assign(alternatives.map((transcript) => ({ transcript })), { isFinal }) as unknown as MockResult;

class MockRecognition {
  static current: MockRecognition;
  continuous = false;
  onstart?: () => void;
  onend?: () => void;
  onresult?: (event: { resultIndex: number; results: MockResult[] }) => void;
  stopCalls = 0;
  abortCalls = 0;
  constructor() { MockRecognition.current = this; }
  start() { this.onstart?.(); }
  stop() { this.stopCalls += 1; this.onend?.(); }
  abort() { this.abortCalls += 1; }
  emit(...results: MockResult[]) {
    this.onresult?.({ resultIndex: 0, results });
  }
  respond(transcript: string) {
    this.emit(result(true, transcript));
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

describe("push-to-talk recognition", () => {
  beforeEach(() => {
    vi.stubGlobal("SpeechRecognition", MockRecognition);
    vi.stubGlobal("speechSynthesis", undefined);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("listens continuously so a pause doesn't end the command", () => {
    const { result: hook } = renderHook(() => useVoiceControl());
    act(() => hook.current.startListening());
    expect(MockRecognition.current.continuous).toBe(true);
  });

  it("uses the interim words when released before anything was finalised", () => {
    const { result: hook } = renderHook(() => useVoiceControl());
    act(() => hook.current.startListening());
    act(() => MockRecognition.current.emit(result(false, "find my")));
    act(() => MockRecognition.current.emit(result(false, "find my keys")));
    act(() => MockRecognition.current.onend?.());
    expect(hook.current.commandMode).toBe("finder");
    expect(hook.current.targetItem).toBe("keys");
  });

  it("joins every finalised segment with the latest interim one", () => {
    const { result: hook } = renderHook(() => useVoiceControl());
    act(() => hook.current.startListening());
    act(() => MockRecognition.current.emit(result(true, "where is"), result(false, "my")));
    act(() => MockRecognition.current.emit(result(true, "where is"), result(true, "my"), result(false, "water bottle")));
    expect(hook.current.transcript).toBe("where is my water bottle");
    act(() => hook.current.stopListening());
    expect(hook.current.commandMode).toBe("finder");
    expect(hook.current.targetItem).toBe("water bottle");
  });

  it("picks a lower-ranked alternative that is a command", () => {
    const { result: hook } = renderHook(() => useVoiceControl());
    act(() => hook.current.startListening());
    act(() => MockRecognition.current.emit(result(true, "count nuts", "count notes")));
    act(() => hook.current.stopListening());
    expect(hook.current.commandMode).toBe("currency");
  });

  it("leaves the mode alone for speech it doesn't understand", () => {
    const { result: hook } = renderHook(() => useVoiceControl());
    act(() => hook.current.startListening());
    act(() => MockRecognition.current.respond("what am I holding"));
    expect(hook.current.commandMode).toBe("standard");
  });

  it("stops (not aborts) on release and stays listening until the recognizer finishes", () => {
    const { result: hook } = renderHook(() => useVoiceControl());
    act(() => hook.current.startListening());
    const recognition = MockRecognition.current;
    // A browser fires onend later, after finalising; simulate that delay
    recognition.stop = () => { recognition.stopCalls += 1; };
    act(() => recognition.onstart?.());
    act(() => hook.current.stopListening());
    expect(recognition.stopCalls).toBe(1);
    expect(recognition.abortCalls).toBe(0);
    expect(hook.current.isListening).toBe(true);
    act(() => recognition.respond("read this"));
    expect(hook.current.isListening).toBe(false);
    expect(hook.current.commandMode).toBe("reader");
  });
});
