import { useCallback, useEffect, useRef, useState } from "react";

// Keep this adapter independent of the legacy command recognizers: these sessions only
// run inside a note editor, which is never mounted on the live-vision route.
interface DictationSession {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionConstructor = new () => DictationSession;

export function useMemoryDictation(onText: (text: string) => void) {
  const host = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  const Recognition = host.SpeechRecognition ?? host.webkitSpeechRecognition;
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const session = useRef<DictationSession | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const cancel = useCallback(() => {
    clearTimeout(timer.current);
    const current = session.current;
    session.current = null;
    if (current) {
      current.onresult = null;
      current.onend = null;
      current.onerror = null;
      try {
        current.abort();
      } catch {
        /* already ended */
      }
    }
    setListening(false);
    setInterim("");
  }, []);

  useEffect(() => cancel, [cancel]);

  const stop = useCallback(() => {
    // Keep the session alive until onend so the last finalized words are retained.
    if (!session.current) return;
    try {
      session.current.stop();
    } catch {
      cancel();
      return;
    }
    if (!session.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(cancel, 2000);
  }, [cancel]);

  const start = useCallback(() => {
    if (!Recognition || session.current) return;
    const current = new Recognition();
    session.current = current;
    current.lang = "en-IN";
    current.continuous = true;
    current.interimResults = true;
    setError("");
    current.onresult = (event) => {
      if (session.current !== current) return;
      let pending = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal)
          onTextRef.current(event.results[i][0].transcript.trim());
        else pending += event.results[i][0].transcript;
      }
      setInterim(pending);
    };
    current.onerror = (event) => {
      if (session.current !== current) return;
      const message =
        event.error === "not-allowed"
          ? "Microphone permission was denied. You can still type your note."
          : event.error === "no-speech"
            ? "No speech was heard. Try again, or type your note."
            : "Dictation is unavailable. Check your connection, or type your note.";
      setError(message);
      cancel();
    };
    current.onend = () => {
      if (session.current !== current) return;
      clearTimeout(timer.current);
      session.current = null;
      setListening(false);
      setInterim("");
    };
    try {
      current.start();
      setListening(true);
      timer.current = setTimeout(stop, 60_000);
    } catch {
      cancel();
      setError("Could not start dictation. You can still type your note.");
    }
  }, [Recognition, cancel, stop]);
  return {
    supported: !!Recognition,
    listening,
    interim,
    error,
    start,
    stop,
    cancel,
  };
}
