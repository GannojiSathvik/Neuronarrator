import { useState, useCallback, useRef, useEffect } from "react";

/**
 * Push-to-talk voice control hook for mode switching.
 * Uses Web Speech API with 'en-IN' for Indian English accent support.
 * 
 * Commands:
 *   "Count notes" / "Money" / "Currency" → currency mode
 *   "Find [item]" / "Where is my [item]" → finder mode  
 *   "Read" / "Read this" / "What does it say" → reader mode
 *   "Describe" / "What is this" → standard mode
 */

export type CommandMode = "standard" | "reader" | "currency" | "finder";

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

export function parseCommand(transcript: string): { mode: CommandMode; targetItem: string } | null {
  const lower = transcript.toLowerCase().trim();

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

export function useVoiceControl(): UseVoiceControlReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [commandMode, setCommandMode] = useState<CommandMode>("standard");
  const [targetItem, setTargetItem] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalTranscriptRef = useRef("");

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

    finalTranscriptRef.current = "";
    setTranscript("");

    const recognition = new SpeechRecognition();
    recognition.continuous = false; // Single utterance — stop on silence
    recognition.interimResults = true;
    recognition.lang = "en-IN";
    recognition.maxAlternatives = 3;

    recognition.onstart = () => {
      setIsListening(true);
      console.log("[VoiceControl] Listening started");
    };

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let interim = "";
      let final = "";

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      if (final) {
        finalTranscriptRef.current = final;
      }

      setTranscript(final || interim);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      if (event.error !== "no-speech" && event.error !== "aborted") {
        console.warn("[VoiceControl] Error:", event.error);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      console.log("[VoiceControl] Listening ended, transcript:", finalTranscriptRef.current);

      // Process the final transcript
      const text = finalTranscriptRef.current;
      if (text) {
        const parsed = parseCommand(text);
        if (parsed) {
          console.log("[VoiceControl] Command parsed:", parsed);
          setCommandMode(parsed.mode);
          setTargetItem(parsed.targetItem);

          // Speak confirmation
          if (parsed.mode === "currency") {
            speakFeedback("Currency Mode. Show me the notes.");
          } else if (parsed.mode === "finder") {
            speakFeedback(`Finder Mode. Looking for ${parsed.targetItem}.`);
          } else if (parsed.mode === "reader") {
            speakFeedback("Read Mode. Point me at the text.");
          } else {
            speakFeedback("Standard Mode. Describing scene.");
          }
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

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch { /* already stopped */ }
    }
    setIsListening(false);
  }, []);

  // Abort any active recognition session on unmount
  useEffect(() => {
    return () => {
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
