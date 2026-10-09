import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isReaderCommand, questionAfterWakeWord, useVoiceCommand } from "./useVoiceCommand";

describe("isReaderCommand (hands-free)", () => {
  it.each(["neuro read", "neuro read this", "neural read", "nero read the sign", "neuro, read", "neuro reader"])(
    "matches '%s'",
    (transcript) => {
      expect(isReaderCommand(transcript)).toBe(true);
    },
  );

  it.each(["neuro ready", "read this", "neuro describe", "neuro remember ronit"])(
    "ignores '%s'",
    (transcript) => {
      expect(isReaderCommand(transcript)).toBe(false);
    },
  );
});

class MockRecognition {
  static current: MockRecognition;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onresult: ((event: unknown) => void) | null = null;
  constructor() { MockRecognition.current = this; }
  start() { this.onstart?.(); }
  stop() {}
  abort() {}
  hear(transcript: string) {
    const result = Object.assign([{ transcript, confidence: 0.9 }], { isFinal: true });
    this.onresult?.({ resultIndex: 0, results: [result] });
  }
}

describe("useVoiceCommand (hands-free)", () => {
  const callbacks = () => ({
    onRememberCommand: vi.fn(),
    onClearCommand: vi.fn(),
    onModeSwitch: vi.fn(),
  });
  beforeEach(() => vi.stubGlobal("SpeechRecognition", MockRecognition));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("still recognises wake-word commands", () => {
    const cb = callbacks();
    renderHook(() => useVoiceCommand({ ...cb, enabled: true }));
    act(() => MockRecognition.current.hear("neuro find my keys"));
    act(() => MockRecognition.current.hear("neuro remember ronit"));
    expect(cb.onModeSwitch).toHaveBeenCalledWith("finder", "keys");
    expect(cb.onRememberCommand).toHaveBeenCalledWith("Ronit");
  });

  it.each(["do you remember john", "your remember the party"])(
    "doesn't save a face for ordinary speech like '%s'",
    (transcript) => {
      const cb = callbacks();
      renderHook(() => useVoiceCommand({ ...cb, enabled: true }));
      act(() => MockRecognition.current.hear(transcript));
      expect(cb.onRememberCommand).not.toHaveBeenCalled();
    },
  );
});

describe("questionAfterWakeWord", () => {
  it("turns 'neuro <question>' into a question for the AI", () => {
    expect(questionAfterWakeWord("Neuro, what am I holding?")).toBe("what am i holding");
    expect(questionAfterWakeWord("nero is the light on")).toBe("is the light on");
  });

  it("ignores speech without the wake word, or with fewer than two words after it", () => {
    expect(questionAfterWakeWord("what am I holding")).toBeNull();
    expect(questionAfterWakeWord("neuro hello")).toBeNull();
  });
});
