import { useState, useCallback, useRef, useEffect } from "react";
import {
  normalizeTranscript,
  segmentsFromResults,
  transcriptCandidates,
  type RecognitionSegment,
} from "@/lib/voiceText";

/**
 * Push-to-talk voice control hook for mode switching.
 * Uses Web Speech API with 'en-IN' for Indian English accent support.
 * Listens continuously while the screen is held, so a pause mid-sentence doesn't cut it off.
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
    utterance.rate = 1.1;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    utterance.lang = "en-IN";
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

/**
 * Parses each whole-utterance reading (best first) and returns the first one that is a known
 * command, so a correct lower-ranked alternative isn't lost to a garbled top one.
 * Push-to-talk has no destructive commands, so any alternative may be used here.
 */
export function pickCommand(
  segments: RecognitionSegment[],
): { text: string; parsed: ParsedCommand | null } {
  const candidates = transcriptCandidates(segments);
  for (const text of candidates) {
    const parsed = parseCommand(text);
    if (parsed) return { text, parsed };
  }
  return { text: candidates[0] ?? "", parsed: null };
}

/** The short spoken echo of what was understood, so a misheard command is noticed. */
function modeEcho(mode: CommandMode, item: string): string {
  if (mode === "currency") return "Currency. Show me the notes.";
  if (mode === "finder") return `Finder, ${item}.`;
  if (mode === "reader") return "Read. Point me at the text.";
  return "Describe.";
}

export function useVoiceControl(): UseVoiceControlReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [commandMode, setCommandMode] = useState<CommandMode>("standard");
  const [targetItem, setTargetItem] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Every result of the session, final and interim. If the user lets go before the recognizer
  // finalises, the interim words (already shown on screen) are used instead of being dropped.
  const segmentsRef = useRef<RecognitionSegment[]>([]);
  const stopTimeoutRef = useRef<number | null>(null);

  const startListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
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

    if (stopTimeoutRef.current) {
      window.clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
    segmentsRef.current = [];
    setTranscript("");

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
      setIsListening(false);
      if (stopTimeoutRef.current) {
        window.clearTimeout(stopTimeoutRef.current);
        stopTimeoutRef.current = null;
      }
      // Final and interim segments alike, so words not yet finalised still count
      const { text, parsed } = pickCommand(segmentsRef.current);
      console.log("[VoiceControl] Listening ended, transcript:", text);

      if (text) {
        if (parsed) {
          console.log("[VoiceControl] Command parsed:", parsed);
          // Echo what was understood first, so a misheard command is obvious
          speakFeedback(modeEcho(parsed.mode, parsed.targetItem));
          setCommandMode(parsed.mode);
          setTargetItem(parsed.targetItem);
        } else {
          console.log("[VoiceControl] No command recognized in:", text);
          speakFeedback("Sorry, I didn't understand. Try saying: count notes, find keys, read this, or describe.");
        }
      }

      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (err) {
      console.error("[VoiceControl] Failed to start:", err);
      setIsListening(false);
    }
  }, []);

  // stop(), not abort(): the recognizer finalises the words it already heard and then fires
  // onend, which processes them and clears isListening. Clearing isListening here would let
  // the always-on listener grab the mic before those last words are finalised.
  const stopListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      setIsListening(false);
      return;
    }
    try {
      recognition.stop();
    } catch { /* already stopped */ }
    // Safety net if the browser never fires onend: abort (which ends with onend in Chrome)
    // and release the listening state either way.
    if (stopTimeoutRef.current) window.clearTimeout(stopTimeoutRef.current);
    stopTimeoutRef.current = window.setTimeout(() => {
      stopTimeoutRef.current = null;
      if (recognitionRef.current === recognition) {
        try { recognition.abort(); } catch { /* already stopped */ }
      }
      setIsListening(false);
    }, 2000);
  }, []);

  // Abort any active recognition session on unmount
  useEffect(() => {
    return () => {
      if (stopTimeoutRef.current) window.clearTimeout(stopTimeoutRef.current);
      const recognition = recognitionRef.current;
      if (recognition) {
        recognition.onend = null;
        try { recognition.abort(); } catch { /* already stopped */ }
        recognitionRef.current = null;
      }
    };
  }, []);

  return {
    isListening,
    transcript,
    commandMode,
    targetItem,
    startListening,
    stopListening,
    setCommandMode,
    setTargetItem,
  };
}
