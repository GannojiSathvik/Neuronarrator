import { useState, useCallback, useRef, useEffect } from "react";
import { applyFemaleVoice } from "@/lib/femaleVoice";
import {
  normalizeTranscript,
  segmentsFromResults,
  transcriptCandidates,
  type RecognitionSegment,
} from "@/lib/voiceText";
import {
  canRecordAudio,
  isUsableClip,
  startClipRecorder,
  transcribeClip,
  type ClipRecorder,
} from "@/lib/pushToTalkAudio";

/**
 * Push-to-talk voice control hook for mode switching.
 * Uses Web Speech API with 'en-IN' for Indian English accent support.
 * Listens continuously while the screen is held, so a pause mid-sentence doesn't cut it off.
 * The same press is also recorded and, on release, transcribed by the `speech-to-text` edge
 * function (Whisper); that transcript is preferred, and the browser's live one shown while
 * held is the fallback when the server fails, times out or hears nothing.
 * 
 * Commands:
 *   "Count notes" / "Money" / "Currency" → currency mode
 *   "Find [item]" / "Where is my [item]" → finder mode  
 *   "Read" / "Read this" / "What does it say" → reader mode
 *   "Describe" / "What is this" → standard mode
 */

export type CommandMode = "standard" | "reader" | "currency" | "finder";

export interface ParsedCommand {
  mode: CommandMode;
  targetItem: string;
}

interface UseVoiceControlReturn {
  isListening: boolean;
  /** Released, and waiting for the server transcript before acting. */
  isTranscribing: boolean;
  transcript: string;
  commandMode: CommandMode;
  targetItem: string;
  startListening: () => void;
  stopListening: () => void;
  setCommandMode: (mode: CommandMode) => void;
  setTargetItem: (item: string) => void;
}

// Patterns for each command
const CURRENCY_PATTERNS = [
  "count notes", "count note", "money", "currency",
  "count my notes", "count my money", "how much money",
  "kitne paise", "paise", "note gino", "paisa",
];

const FINDER_PATTERNS = [
  /find\s+(?:my\s+)?(.+)/i,
  /where\s+is\s+(?:my\s+)?(.+)/i,
  /where\s+are\s+(?:my\s+)?(.+)/i,
  /search\s+(?:for\s+)?(?:my\s+)?(.+)/i,
  /locate\s+(?:my\s+)?(.+)/i,
  /look\s+for\s+(?:my\s+)?(.+)/i,
];

// Word-bounded so "read" doesn't fire inside "ready" or "already"
const READER_PATTERNS = [
  /\bread\b/i,
  /\bwhat\s+(?:does\s+)?(?:it|this|that)\s+says?\b/i,
  /\bpadh(?:o|iye|\s+do)\b/i,
];

const STANDARD_PATTERNS = [
  "describe", "what is this", "what do you see",
  "tell me", "look around", "scene", "standard",
  "what's in front", "what is in front",
];

function speakFeedback(text: string) {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    // Slow and slightly low for a calm, smooth female voice
    utterance.rate = 0.9;
    utterance.pitch = 0.95;
    utterance.volume = 1.0;
    utterance.lang = "en-IN";
    applyFemaleVoice(utterance);
    window.speechSynthesis.speak(utterance);
  }
  // Also vibrate on mode switch for tactile confirmation
  if ("vibrate" in navigator) {
    try { navigator.vibrate([100, 50, 100]); } catch { /* vibration unsupported */ }
  }
}

export function parseCommand(transcript: string): ParsedCommand | null {
  // Normalised and without a leading wake word, so "Neuro, find my keys." parses like "find my keys"
  const lower = normalizeTranscript(transcript).replace(/^neuro\s+/, "");

  // Explicit finding commands take precedence over currency words in the item name.
  // Check finder patterns (regex-based to extract the object)
  for (const pattern of FINDER_PATTERNS) {
    const match = lower.match(pattern);
    if (match && match[1]) {
      const item = match[1]
        .replace(/[.!?,;:'"]/g, "")
        .replace(/\b(please|the|a|an)\b/gi, "")
        .trim();
      if (item.length >= 2) {
        return { mode: "finder", targetItem: item };
      }
    }
  }

  // Check currency patterns
  for (const pattern of CURRENCY_PATTERNS) {
    if (lower.includes(pattern)) {
      return { mode: "currency", targetItem: "" };
    }
  }

  // Check reader patterns (before standard, so "tell me what it says" reads rather than describes)
  for (const pattern of READER_PATTERNS) {
    if (pattern.test(lower)) {
      return { mode: "reader", targetItem: "" };
    }
  }

  // Check standard patterns
  for (const pattern of STANDARD_PATTERNS) {
    if (lower.includes(pattern)) {
      return { mode: "standard", targetItem: "" };
    }
  }

  return null;
}


/** The first reading (best first) that is a known command; otherwise the best reading, unparsed. */
function pickFromTexts(texts: string[]): { text: string; parsed: ParsedCommand | null } {
  for (const text of texts) {
    const parsed = parseCommand(text);
    if (parsed) return { text, parsed };
  }
  return { text: texts[0] ?? "", parsed: null };
}

/**
 * Parses each whole-utterance reading (best first) and returns the first one that is a known
 * command, so a correct lower-ranked alternative isn't lost to a garbled top one.
 * Push-to-talk has no destructive commands, so any alternative may be used here.
 * A server (Whisper) transcript, when there is one, is tried before the browser's readings.
 */
export function pickCommand(
  segments: RecognitionSegment[],
  serverText = "",
): { text: string; parsed: ParsedCommand | null } {
  const texts = transcriptCandidates(segments);
  return pickFromTexts(serverText ? [serverText, ...texts.filter((t) => t !== serverText)] : texts);
}

// Whole commands with nothing in them for a better transcript to improve (finder commands are
// absent on purpose: their item name is exactly what Whisper hears better).
const EXACT_COMMANDS = new Set([
  ...CURRENCY_PATTERNS,
  ...STANDARD_PATTERNS,
  "read", "read this", "read it", "read that", "read text", "read the text",
  "what does it say", "what does this say", "what does that say", "padho",
]);

/**
 * True when the browser already heard, in finalised words only, exactly one of the fixed
 * commands. Then waiting up to the server timeout could not change the outcome, so the
 * command is acted on at once and the upload is skipped.
 */
export function isExactCommand(segments: RecognitionSegment[]): boolean {
  if (segments.length === 0 || segments.some((s) => !s.isFinal)) return false;
  const top = transcriptCandidates(segments)[0] ?? "";
  return EXACT_COMMANDS.has(normalizeTranscript(top).replace(/^neuro\s+/, ""));
}

/** What was heard, trimmed for speaking back: at most 8 words. */
export function heardForEcho(text: string): string {
  const words = text.replace(/[^\p{L}\p{N}'\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
  return words.length > 8 ? `${words.slice(0, 8).join(" ")}…` : words.join(" ");
}

/** The short spoken echo of what was understood, so a misheard command is noticed. */
function modeEcho(mode: CommandMode, item: string): string {
  if (mode === "currency") return "Currency. Show me the notes.";
  if (mode === "finder") return `Finder, ${item}.`;
  if (mode === "reader") return "Read. Point me at the text.";
  return "Describe.";
}

/** After this many server failures in a row, push-to-talk stops trying the server this session. */
export const MAX_SERVER_FAILURES = 2;

interface UseVoiceControlOptions {
  /** Speech that isn't a mode command is a question for the vision AI about the current view */
  onQuestion?: (question: string) => void;
}

export function useVoiceControl({ onQuestion }: UseVoiceControlOptions = {}): UseVoiceControlReturn {
  const onQuestionRef = useRef(onQuestion);
  onQuestionRef.current = onQuestion;
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [commandMode, setCommandMode] = useState<CommandMode>("standard");
  const [targetItem, setTargetItem] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Every result of the session, final and interim. If the user lets go before the recognizer
  // finalises, the interim words (already shown on screen) are used instead of being dropped.
  const segmentsRef = useRef<RecognitionSegment[]>([]);
  const stopTimeoutRef = useRef<number | null>(null);
  // Records the same press for server speech-to-text; null when the server isn't being used.
  const recorderRef = useRef<ClipRecorder | null>(null);
  const uploadRef = useRef<AbortController | null>(null);
  // Bumped by every press and by unmount. A press settles once; a server reply that arrives
  // after a newer press (or unmount) is ignored, like useVoiceInput's sessionRef.
  const pressRef = useRef(0);
  const settledPressRef = useRef(0);
  const serverFailuresRef = useRef(0);

  const applyCommand = useCallback((text: string, parsed: ParsedCommand | null) => {
    if (!text) return;
    setTranscript(text);
    if (parsed) {
      console.log("[VoiceControl] Command parsed:", parsed);
      // Echo what was understood first, so a misheard command is obvious
      speakFeedback(modeEcho(parsed.mode, parsed.targetItem));
      setCommandMode(parsed.mode);
      setTargetItem(parsed.targetItem);
    } else {
      const words = normalizeTranscript(text).replace(/^neuro\s+/, "").split(" ").filter(Boolean);
      if (words.length >= 2 && onQuestionRef.current) {
        // Not a mode command: ask the AI and let it answer, instead of listing what can be said
        console.log("[VoiceControl] Asking the AI:", text);
        onQuestionRef.current(words.join(" "));
        return;
      }
      console.log("[VoiceControl] No command recognized in:", text);
      // Say what was heard, so the user can tell a mishearing ("I heard: fine my kiss") from a
      // phrase that simply isn't a command.
      speakFeedback(`I heard: ${heardForEcho(text)}. Try saying: find my keys, read this, count notes, or describe.`);
    }
  }, []);

  const noteServerFailure = useCallback(() => {
    serverFailuresRef.current += 1;
    if (serverFailuresRef.current === MAX_SERVER_FAILURES) {
      console.warn(
        `[VoiceControl] Server speech-to-text failed ${MAX_SERVER_FAILURES} times in a row; using browser recognition only for this session`,
      );
    }
  }, []);

  /**
   * Ends a press once the browser recognizer has finished: acts on its words straight away, or
   * first asks the server for a transcript of the recorded clip and prefers that.
   */
  const settle = useCallback(async (press: number) => {
    if (press !== pressRef.current || settledPressRef.current === press) return;
    settledPressRef.current = press;
    setIsListening(false);
    const segments = segmentsRef.current;
    const recorder = recorderRef.current;
    recorderRef.current = null;

    if (!recorder || isExactCommand(segments)) {
      recorder?.cancel();
      const { text, parsed } = pickCommand(segments);
      console.log("[VoiceControl] Listening ended, transcript:", text);
      applyCommand(text, parsed);
      return;
    }

    setIsTranscribing(true);
    const controller = new AbortController();
    uploadRef.current = controller;
    let serverText = "";
    const clip = await recorder.stop();
    if (press === pressRef.current && isUsableClip(clip)) {
      const reply = await transcribeClip(clip, controller.signal);
      if (controller.signal.aborted) return; // superseded by a newer press, or unmounted
      if (reply.ok) {
        serverFailuresRef.current = 0;
        serverText = reply.text;
      } else {
        noteServerFailure();
      }
    }
    if (press !== pressRef.current) return;
    uploadRef.current = null;
    setIsTranscribing(false);
    const { text, parsed } = pickCommand(segments, serverText);
    console.log("[VoiceControl] Listening ended, transcript:", text, serverText ? "(server)" : "(browser)");
    applyCommand(text, parsed);
  }, [applyCommand, noteServerFailure]);

  const startListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const useServer = canRecordAudio() && serverFailuresRef.current < MAX_SERVER_FAILURES;
    if (!SpeechRecognition && !useServer) {
      console.warn("[VoiceControl] SpeechRecognition not supported");
      return;
    }

    // Stop any existing instance
    if (recognitionRef.current) {
      // Detach handlers so the old instance's onend doesn't process/speak a stale transcript
      recognitionRef.current.onend = null;
      try { recognitionRef.current.abort(); } catch { /* already stopped */ }
      recognitionRef.current = null;
    }
    // Drop the previous press's recording and any upload still in flight
    recorderRef.current?.cancel();
    recorderRef.current = null;
    uploadRef.current?.abort();
    uploadRef.current = null;
    setIsTranscribing(false);

    if (stopTimeoutRef.current) {
      window.clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
    const press = ++pressRef.current;
    segmentsRef.current = [];
    setTranscript("");

    // Recorded alongside the recognizer; Chrome lets both capture the mic at once
    if (useServer) recorderRef.current = startClipRecorder();

    if (!SpeechRecognition) {
      // No browser recognizer (e.g. Firefox): the server transcript is all there is
      setIsListening(true);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true; // Keep listening through pauses; releasing the screen stops it
    recognition.interimResults = true;
    recognition.lang = "en-IN";
    recognition.maxAlternatives = 3;

    recognition.onstart = () => {
      setIsListening(true);
      console.log("[VoiceControl] Listening started");
    };

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      // In continuous mode the list holds the whole session: finalised segments, then the
      // latest interim one. Keep them all, in order.
      const segments = segmentsFromResults(event.results);
      if (segments.length > 0) segmentsRef.current = segments;
      setTranscript(transcriptCandidates(segmentsRef.current)[0] ?? "");
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      if (event.error !== "no-speech" && event.error !== "aborted") {
        console.warn("[VoiceControl] Error:", event.error);
      }
    };

    recognition.onend = () => {
      if (stopTimeoutRef.current) {
        window.clearTimeout(stopTimeoutRef.current);
        stopTimeoutRef.current = null;
      }
      recognitionRef.current = null;
      // Final and interim segments alike, so words not yet finalised still count
      void settle(press);
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (err) {
      console.error("[VoiceControl] Failed to start:", err);
      recognitionRef.current = null;
      if (recorderRef.current) setIsListening(true); // the recording alone still serves the press
      else setIsListening(false);
    }
  }, [settle]);

  // stop(), not abort(): the recognizer finalises the words it already heard and then fires
  // onend, which processes them and clears isListening. Clearing isListening here would let
  // the always-on listener grab the mic before those last words are finalised.
  const stopListening = useCallback(() => {
    const press = pressRef.current;
    const recognition = recognitionRef.current;
    if (!recognition) {
      if (settledPressRef.current !== press && recorderRef.current) {
        void settle(press); // recording-only press
      } else {
        setIsListening(false);
      }
      return;
    }
    try {
      recognition.stop();
    } catch { /* already stopped */ }
    // Safety net if the browser never fires onend: abort (which ends with onend in Chrome)
    // and settle the press either way.
    if (stopTimeoutRef.current) window.clearTimeout(stopTimeoutRef.current);
    stopTimeoutRef.current = window.setTimeout(() => {
      stopTimeoutRef.current = null;
      if (recognitionRef.current === recognition) {
        recognition.onend = null;
        try { recognition.abort(); } catch { /* already stopped */ }
        recognitionRef.current = null;
      }
      setIsListening(false);
      void settle(press);
    }, 2000);
  }, [settle]);

  // Abort any active recognition session, recording and upload on unmount
  useEffect(() => {
    return () => {
      pressRef.current += 1;
      if (stopTimeoutRef.current) window.clearTimeout(stopTimeoutRef.current);
      const recognition = recognitionRef.current;
      if (recognition) {
        recognition.onend = null;
        try { recognition.abort(); } catch { /* already stopped */ }
        recognitionRef.current = null;
      }
      recorderRef.current?.cancel();
      recorderRef.current = null;
      uploadRef.current?.abort();
      uploadRef.current = null;
    };
  }, []);

  return {
    isListening,
    isTranscribing,
    transcript,
    commandMode,
    targetItem,
    startListening,
    stopListening,
    setCommandMode,
    setTargetItem,
  };
}
