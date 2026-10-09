import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isExactCommand, parseCommand, pickCommand, useVoiceControl, heardForEcho } from "./useVoiceControl";
import { pickRecorderMimeType, startClipRecorder } from "@/lib/pushToTalkAudio";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

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

describe("isExactCommand", () => {
  it("accepts a fixed command heard in finalised words only", () => {
    expect(isExactCommand([{ isFinal: true, alternatives: ["Count notes."] }])).toBe(true);
    expect(isExactCommand([{ isFinal: true, alternatives: ["Neuro, read this"] }])).toBe(true);
  });

  it("rejects finder commands, interim words and longer sentences", () => {
    expect(isExactCommand([{ isFinal: true, alternatives: ["find my keys"] }])).toBe(false);
    expect(isExactCommand([{ isFinal: false, alternatives: ["count notes"] }])).toBe(false);
    expect(isExactCommand([{ isFinal: true, alternatives: ["describe the money"] }])).toBe(false);
  });
});

describe("pickCommand with a server transcript", () => {
  it("prefers the server reading when it parses", () => {
    expect(pickCommand([{ isFinal: true, alternatives: ["find my kiss"] }], "Find my keys.").parsed).toEqual({
      mode: "finder",
      targetItem: "keys",
    });
  });

  it("falls back to a browser reading when the server text is not a command", () => {
    expect(pickCommand([{ isFinal: true, alternatives: ["count notes"] }], "Thank you.").parsed?.mode).toBe(
      "currency",
    );
  });
});

// --- Server speech-to-text (MediaRecorder + speech-to-text edge function) ---

let clock = 0;
let clipBytes = 4000;
const tracks: { stop: ReturnType<typeof vi.fn> }[] = [];
const getUserMedia = vi.fn(async () => {
  const track = { stop: vi.fn() };
  tracks.push(track);
  return { getTracks: () => [track] };
});

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  static supported = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  static isTypeSupported(type: string) { return FakeMediaRecorder.supported.includes(type); }
  state: "inactive" | "recording" = "inactive";
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(_stream: unknown, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? "audio/webm";
    FakeMediaRecorder.instances.push(this);
  }
  start() { this.state = "recording"; }
  stop() {
    if (this.state === "inactive") return;
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob([new Uint8Array(clipBytes)]) });
    this.onstop?.();
  }
}

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
};

/** Press, let the mic open, hear `heard` from the browser, hold for `holdMs`, release. */
async function press(hook: { current: ReturnType<typeof useVoiceControl> }, heard: string, holdMs = 1500) {
  act(() => hook.current.startListening());
  await act(async () => {}); // getUserMedia resolves, recording starts
  act(() => MockRecognition.current.emit(result(true, heard)));
  clock += holdMs;
  act(() => hook.current.stopListening());
}

describe("push-to-talk server speech-to-text", () => {
  beforeEach(() => {
    vi.stubGlobal("SpeechRecognition", MockRecognition);
    vi.stubGlobal("speechSynthesis", undefined);
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    clock = 0;
    clipBytes = 4000;
    tracks.length = 0;
    FakeMediaRecorder.instances = [];
    FakeMediaRecorder.supported = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
    getUserMedia.mockClear();
    invoke.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete (navigator as { mediaDevices?: unknown }).mediaDevices;
  });

  it("prefers the server transcript over the browser's", async () => {
    invoke.mockResolvedValue({ data: { transcript: "Find my keys." }, error: null });
    const { result: hook } = renderHook(() => useVoiceControl());
    await press(hook, "find my kiss");
    await waitFor(() => expect(hook.current.targetItem).toBe("keys"));
    expect(hook.current.commandMode).toBe("finder");
    expect(hook.current.isTranscribing).toBe(false);
    const [name, options] = invoke.mock.calls[0];
    expect(name).toBe("speech-to-text");
    expect(options.body).toMatchObject({ language_code: "en-IN", mime_type: "audio/webm" });
    expect(options.body.audioBase64.length).toBeGreaterThan(1000);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.timeout).toBe(6000);
  });

  it("shows it is transcribing until the server answers", async () => {
    const reply = deferred<unknown>();
    invoke.mockReturnValue(reply.promise);
    const { result: hook } = renderHook(() => useVoiceControl());
    await press(hook, "find my kiss");
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(hook.current.isTranscribing).toBe(true);
    expect(hook.current.isListening).toBe(false);
    await act(async () => reply.resolve({ data: { transcript: "where is my wallet" }, error: null }));
    expect(hook.current.isTranscribing).toBe(false);
    expect(hook.current.targetItem).toBe("wallet");
  });

  it.each([
    ["an error response", () => invoke.mockResolvedValue({ data: null, error: new Error("500") })],
    ["a thrown error", () => invoke.mockRejectedValue(new Error("network"))],
    ["an empty transcript", () => invoke.mockResolvedValue({ data: { transcript: "  " }, error: null })],
  ])("falls back to the browser transcript on %s", async (_label, arrange) => {
    arrange();
    const { result: hook } = renderHook(() => useVoiceControl());
    await press(hook, "find my keys");
    await waitFor(() => expect(hook.current.isTranscribing).toBe(false));
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(hook.current.commandMode).toBe("finder");
    expect(hook.current.targetItem).toBe("keys");
  });

  it("stops using the server after two failures in a row", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("500") });
    const { result: hook } = renderHook(() => useVoiceControl());
    for (const item of ["keys", "phone"]) {
      await press(hook, `find my ${item}`);
      await waitFor(() => expect(hook.current.targetItem).toBe(item));
    }
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(getUserMedia).toHaveBeenCalledTimes(2);

    await press(hook, "find my wallet");
    expect(hook.current.targetItem).toBe("wallet"); // acted on at once, no recording or upload
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("browser recognition only"));
  });

  it("does not count an empty transcript as a failure", async () => {
    invoke
      .mockResolvedValueOnce({ data: null, error: new Error("500") })
      .mockResolvedValueOnce({ data: { transcript: "" }, error: null })
      .mockResolvedValueOnce({ data: null, error: new Error("500") })
      .mockResolvedValueOnce({ data: { transcript: "count notes" }, error: null });
    const { result: hook } = renderHook(() => useVoiceControl());
    for (let i = 0; i < 4; i++) {
      await press(hook, "find my keys");
      await waitFor(() => expect(invoke).toHaveBeenCalledTimes(i + 1));
      await waitFor(() => expect(hook.current.isTranscribing).toBe(false));
    }
    expect(hook.current.commandMode).toBe("currency");
  });

  it("ignores a server reply that arrives after the next press", async () => {
    const stale = deferred<unknown>();
    invoke.mockReturnValueOnce(stale.promise);
    const { result: hook } = renderHook(() => useVoiceControl());
    await press(hook, "find my kiss");
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    const staleSignal: AbortSignal = invoke.mock.calls[0][1].signal;

    act(() => hook.current.startListening()); // pressed again before the reply
    expect(staleSignal.aborted).toBe(true);
    expect(hook.current.isTranscribing).toBe(false);
    await act(async () => stale.resolve({ data: { transcript: "count notes" }, error: null }));
    expect(hook.current.commandMode).toBe("standard");
    expect(hook.current.isListening).toBe(true);
  });

  it("ignores a server reply that arrives after unmount", async () => {
    const stale = deferred<unknown>();
    invoke.mockReturnValueOnce(stale.promise);
    const speak = vi.fn();
    vi.stubGlobal("speechSynthesis", { cancel: vi.fn(), speak });
    vi.stubGlobal("SpeechSynthesisUtterance", class { constructor(public text: string) {} });
    const { result: hook, unmount } = renderHook(() => useVoiceControl());
    await press(hook, "find my kiss");
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    unmount();
    expect(invoke.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => stale.resolve({ data: { transcript: "count notes" }, error: null }));
    expect(speak).not.toHaveBeenCalled();
  });

  it.each([
    ["too short", 100, 4000],
    ["too small", 1500, 500],
  ])("skips the upload when the recording is %s", async (_label, holdMs, bytes) => {
    clipBytes = bytes;
    const { result: hook } = renderHook(() => useVoiceControl());
    await press(hook, "find my keys", holdMs);
    await waitFor(() => expect(hook.current.targetItem).toBe("keys"));
    expect(invoke).not.toHaveBeenCalled();
  });

  it("acts at once on an exact fixed command without uploading", async () => {
    const { result: hook } = renderHook(() => useVoiceControl());
    await press(hook, "count notes");
    expect(hook.current.commandMode).toBe("currency");
    expect(hook.current.isTranscribing).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
    expect(tracks[0].stop).toHaveBeenCalled();
  });

  it("releases the mic on release", async () => {
    invoke.mockResolvedValue({ data: { transcript: "find my keys" }, error: null });
    const { result: hook } = renderHook(() => useVoiceControl());
    await press(hook, "find my kiss");
    await waitFor(() => expect(hook.current.targetItem).toBe("keys"));
    expect(tracks).toHaveLength(1);
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(FakeMediaRecorder.instances[0].state).toBe("inactive");
  });

  it("releases the mic on unmount while held", async () => {
    const { result: hook, unmount } = renderHook(() => useVoiceControl());
    act(() => hook.current.startListening());
    await act(async () => {});
    expect(FakeMediaRecorder.instances[0].state).toBe("recording");
    unmount();
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(FakeMediaRecorder.instances[0].state).toBe("inactive");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("releases a mic that opens only after the release", async () => {
    const opening = deferred<{ getTracks: () => { stop: () => void }[] }>();
    const lateTrack = { stop: vi.fn() };
    getUserMedia.mockImplementationOnce(() => opening.promise as never);
    const { result: hook } = renderHook(() => useVoiceControl());
    act(() => hook.current.startListening());
    act(() => MockRecognition.current.emit(result(true, "find my keys")));
    act(() => hook.current.stopListening());
    await act(async () => opening.resolve({ getTracks: () => [lateTrack] }));
    await waitFor(() => expect(hook.current.targetItem).toBe("keys"));
    expect(lateTrack.stop).toHaveBeenCalled();
    expect(FakeMediaRecorder.instances).toHaveLength(0);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("caps a recording at the length limit and releases the mic", async () => {
    const recorder = startClipRecorder(20);
    await act(async () => {});
    expect(FakeMediaRecorder.instances[0].state).toBe("recording");
    await new Promise((r) => setTimeout(r, 40));
    expect(FakeMediaRecorder.instances[0].state).toBe("inactive");
    expect(tracks[0].stop).toHaveBeenCalled();
    const clip = await recorder.stop();
    expect(clip?.blob.size).toBe(4000);
  });

  it("records Opus WebM where supported, else MP4 for iOS Safari, else the default", () => {
    expect(pickRecorderMimeType()).toBe("audio/webm;codecs=opus");
    FakeMediaRecorder.supported = ["audio/mp4"];
    expect(pickRecorderMimeType()).toBe("audio/mp4");
    FakeMediaRecorder.supported = [];
    expect(pickRecorderMimeType()).toBeUndefined();
  });
});

describe("heardForEcho", () => {
  it("speaks back what was heard, without punctuation", () => {
    expect(heardForEcho("Fine, my kiss!")).toBe("Fine my kiss");
  });

  it("trims long transcripts to 8 words", () => {
    expect(heardForEcho("one two three four five six seven eight nine ten")).toBe(
      "one two three four five six seven eight…",
    );
  });
});
