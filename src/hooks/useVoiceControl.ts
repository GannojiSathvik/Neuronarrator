import { useState, useCallback, useRef } from "react";

/**
 * Push-to-talk voice control hook for mode switching.
 * Uses Web Speech API with 'en-IN' for Indian English accent support.
 * 
 * Commands:
 *   "Count notes" / "Money" / "Currency" → currency mode
 *   "Find [item]" / "Where is my [item]" → finder mode  
 *   "Describe" / "Read" / "What is this" → standard mode
 */

export type CommandMode = "standard" | "currency" | "finder";

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

const STANDARD_PATTERNS = [
  "describe", "read", "what is this", "what do you see",
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
    try { navigator.vibrate([100, 50, 100]); } catch {}
  }
}

export function parseCommand(transcript: string): { mode: CommandMode; targetItem: string } | null {
  const lower = transcript.toLowerCase().trim();

  // Check currency patterns
  for (const pattern of CURRENCY_PATTERNS) {
    if (lower.includes(pattern)) {
      return { mode: "currency", targetItem: "" };
    }
  }

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
  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef("");

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("[VoiceControl] SpeechRecognition not supported");
      return;
    }

    // Stop any existing instance
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
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

    recognition.onresult = (event: any) => {
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

    recognition.onerror = (event: any) => {
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
          } else {
            speakFeedback("Standard Mode. Describing scene.");
          }
        } else {
          console.log("[VoiceControl] No command recognized in:", text);
          speakFeedback("Sorry, I didn't understand. Try saying: count notes, find keys, or describe.");
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
      } catch (_) {}
    }
    setIsListening(false);
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
