import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMemoryDictation } from "./useMemoryDictation";

class Recognition {
  static current: Recognition;
  onresult?: (event: {
    resultIndex: number;
    results: { isFinal: boolean; 0: { transcript: string } }[];
  }) => void;
  onerror?: (event: { error: string }) => void;
  onend?: () => void;
  abort = vi.fn();
  stop = vi.fn();
  start = vi.fn();
  constructor() {
    Recognition.current = this;
  }
  respond(text: string, isFinal = true) {
    this.onresult?.({
      resultIndex: 0,
      results: [{ isFinal, 0: { transcript: text } }],
    });
  }
}

describe("reviewable dictation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("SpeechRecognition", Recognition);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("only appends finalized words, keeping interim words separate", () => {
    const onText = vi.fn();
    const { result } = renderHook(() => useMemoryDictation(onText));
    act(() => result.current.start());
    act(() => Recognition.current.respond("We met", false));
    expect(onText).not.toHaveBeenCalled();
    expect(result.current.interim).toBe("We met");
    act(() => Recognition.current.respond("We met for coffee."));
    expect(onText).toHaveBeenCalledWith("We met for coffee.");
  });

  it("retains final words after stop and ignores delayed events after cancel", () => {
    const onText = vi.fn();
    const { result } = renderHook(() => useMemoryDictation(onText));
    act(() => result.current.start());
    const oldResultHandler = Recognition.current.onresult!;
    act(() => result.current.stop());
    act(() => Recognition.current.respond("Saturday morning."));
    expect(onText).toHaveBeenCalledTimes(1);
    act(() => result.current.cancel());
    act(() =>
      oldResultHandler({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: "Too late" } }],
      }),
    );
    expect(onText).toHaveBeenCalledTimes(1);
    expect(Recognition.current.abort).toHaveBeenCalled();
  });

  it("bounds microphone time and cleans up on unmount", () => {
    const { result, unmount } = renderHook(() => useMemoryDictation(vi.fn()));
    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(60_000));
    expect(Recognition.current.stop).toHaveBeenCalledOnce();
    unmount();
    expect(Recognition.current.abort).toHaveBeenCalledOnce();
    expect(Recognition.current.onresult).toBeNull();
  });

  it("returns an actionable message when microphone permission is denied", () => {
    const { result } = renderHook(() => useMemoryDictation(vi.fn()));
    act(() => result.current.start());
    act(() => Recognition.current.onerror?.({ error: "not-allowed" }));
    expect(result.current.listening).toBe(false);
    expect(result.current.error).toContain("type your note");
  });
});
