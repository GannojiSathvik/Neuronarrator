import { useRef, useCallback, useEffect, useState } from "react";

/**
 * Always-on voice command listener using the browser's free SpeechRecognition API.
 * Listens for "neuro remember [name]" wake phrase to register faces hands-free.
 * Also supports "neuro forget all" to clear faces (the caller asks for it twice before clearing).
 *
 * Robust matching handles common mis-transcriptions on mobile.
 */

// All patterns that SpeechRecognition might hear for "neuro remember"
const REMEMBER_PATTERNS = [
  "neuro remember",
  "neuro, remember",
  "neural remember",
  "neuro remembered",
  "neuro remeber",
  "neuro member",
  "nero remember",
  "nero remeber",
  "neuro number",
  "neural member",
  "new remember",
  "neuro rember",
  "neuro remembar",
  "neuro remembers",
  "neuro rimember",
  "mirror remember",
  "nero member",
  "nero number",
  "your remember",
  "you remember",
  "euro remember",
];

const CLEAR_PATTERNS = [
  "neuro forget all",
  "neural forget all",
  "nero forget all",
  "neuro forget everything",
  "neuro clear all",
  "neural clear all",
];

const STOP_PATTERNS = [
  "neuro stop", "neural stop", "nero stop",
  "neuro pause", "neural pause", "nero pause",
];

// Mode switching patterns for always-on detection
const MODE_CURRENCY_PATTERNS = [
  "neuro currency", "neural currency", "nero currency",
  "neuro count notes", "neural count notes",
  "neuro money", "neural money", "nero money",
  "count notes", "count my notes", "count money",
];

const MODE_FINDER_PATTERNS = [
  /(?:neuro|neural|nero)\s+find\s+(?:my\s+)?(.+)/i,
  /(?:neuro|neural|nero)\s+where\s+is\s+(?:my\s+)?(.+)/i,
  /(?:neuro|neural|nero)\s+locate\s+(?:my\s+)?(.+)/i,
];

const MODE_STANDARD_PATTERNS = [
  "neuro describe", "neural describe", "nero describe",
  "neuro standard", "neural standard", "nero standard",
  "neuro normal", "neural normal",
];

interface UseVoiceCommandOptions {
  onRememberCommand: (name: string) => void;
  onClearCommand: () => void;
  onStopCommand?: () => void;
  onModeSwitch?: (mode: "standard" | "currency" | "finder", targetItem?: string) => void;
  enabled: boolean;
}

// Detach all handlers before stopping so a replaced instance can't fire commands or schedule restarts
function detachAndAbort(recognition: SpeechRecognitionLike) {
  recognition.onstart = null;
  recognition.onresult = null;
  recognition.onerror = null;
  recognition.onend = null;
  try {
    recognition.abort();
  } catch { /* already stopped */ }
}

export function useVoiceCommand({ onRememberCommand, onClearCommand, onStopCommand, onModeSwitch, enabled }: UseVoiceCommandOptions) {
  const [isListening, setIsListening] = useState(false);
  const [lastCommand, setLastCommand] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const isStoppedManuallyRef = useRef(false);
  const isRunningRef = useRef(false);
  const restartTimeoutRef = useRef<number | null>(null);
  const consecutiveErrorsRef = useRef(0);

  // CRITICAL: Store callbacks in refs so SpeechRecognition doesn't restart
  // when parent re-renders with new callback references
  const onRememberRef = useRef(onRememberCommand);
  const onClearRef = useRef(onClearCommand);
  const onModeSwitchRef = useRef(onModeSwitch);
  const onStopRef = useRef(onStopCommand);
  useEffect(() => { onStopRef.current = onStopCommand; }, [onStopCommand]);
  // Latest `enabled` value, read by recognizer callbacks created in earlier renders
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  useEffect(() => { onRememberRef.current = onRememberCommand; }, [onRememberCommand]);
  useEffect(() => { onClearRef.current = onClearCommand; }, [onClearCommand]);
  useEffect(() => { onModeSwitchRef.current = onModeSwitch; }, [onModeSwitch]);

  const clearRestartTimeout = useCallback(() => {
    if (restartTimeoutRef.current) {
      window.clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("[VoiceCmd] SpeechRecognition not supported in this browser");
      return;
    }

    // Don't restart if already running
    if (isRunningRef.current) return;

    clearRestartTimeout();

    if (recognitionRef.current) {
      detachAndAbort(recognitionRef.current);
      recognitionRef.current = null;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true; // Needed to keep session alive on mobile
    recognition.lang = "en-IN";
    recognition.maxAlternatives = 5; // More alternatives = better chance of catching the phrase

    recognition.onstart = () => {
      isRunningRef.current = true;
      consecutiveErrorsRef.current = 0;
      setIsListening(true);
      console.log("[VoiceCmd] Listener started");
    };

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result.isFinal) continue;

        // Check ALL alternatives
        for (let j = 0; j < result.length; j++) {
          const transcript = result[j].transcript.toLowerCase().trim();
          console.log(`[VoiceCmd] Heard (alt ${j}, conf ${result[j].confidence.toFixed(2)}):`, transcript);

          // Check for "neuro remember [name]"
          for (const pattern of REMEMBER_PATTERNS) {
            const idx = transcript.indexOf(pattern);
            if (idx !== -1) {
              let name = transcript.slice(idx + pattern.length).trim();

              // Clean up the name
              name = name
                .replace(/[.!?,;:'"]/g, "")
                .trim();

              if (name && name.length >= 2) {
                const cleanName = name
                  .split(" ")
                  .filter(w => w.length > 0)
                  .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                  .join(" ");

                console.log("[VoiceCmd] ✅ REMEMBER command detected ->", cleanName);
                setLastCommand(`Remember: ${cleanName}`);
                onRememberRef.current(cleanName);
                return;
              }
            }
          }

          // Check for "neuro stop"
          if (onStopRef.current) {
            for (const pattern of STOP_PATTERNS) {
              if (transcript.includes(pattern)) {
                console.log("[VoiceCmd] ✅ STOP command detected");
                setLastCommand("Stop");
                onStopRef.current();
                return;
              }
            }
          }

          // Check for "neuro forget all". Deleting every saved face is destructive, so only
          // act on the recognizer's top guess, never a lower-ranked alternative.
          for (const pattern of j === 0 ? CLEAR_PATTERNS : []) {
            if (transcript.includes(pattern)) {
              console.log("[VoiceCmd] ✅ FORGET ALL command detected");
              setLastCommand("Forget all faces");
              onClearRef.current();
              return;
            }
          }

          // Check for mode switching commands (hands-free)
          if (onModeSwitchRef.current) {
            // Currency mode
            for (const pattern of MODE_CURRENCY_PATTERNS) {
              if (transcript.includes(pattern)) {
                console.log("[VoiceCmd] ✅ CURRENCY MODE command detected");
                setLastCommand("Currency Mode");
                onModeSwitchRef.current("currency");
                return;
              }
            }

            // Finder mode (regex to extract target item)
            for (const pattern of MODE_FINDER_PATTERNS) {
              const match = transcript.match(pattern);
              if (match && match[1]) {
                const item = match[1].replace(/[.!?,;:'"]/g, "").replace(/\b(please|the|a|an)\b/gi, "").trim();
                if (item.length >= 2) {
                  console.log("[VoiceCmd] ✅ FINDER MODE command detected ->", item);
                  setLastCommand(`Find: ${item}`);
                  onModeSwitchRef.current("finder", item);
                  return;
                }
              }
            }

            // Standard mode
            for (const pattern of MODE_STANDARD_PATTERNS) {
              if (transcript.includes(pattern)) {
                console.log("[VoiceCmd] ✅ STANDARD MODE command detected");
                setLastCommand("Standard Mode");
                onModeSwitchRef.current("standard");
                return;
              }
            }
          }
        }
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      if (event.error === "no-speech" || event.error === "aborted") {
        // Normal — don't count as real error
        return;
      }
      consecutiveErrorsRef.current += 1;
      // Stop spamming after 10 consecutive "not-allowed" errors
      if (event.error === "not-allowed" && consecutiveErrorsRef.current >= 10) {
        console.warn("[VoiceCmd] Mic blocked after 10 attempts — stopping until user gesture");
        isStoppedManuallyRef.current = true;
        return;
      }
      if (consecutiveErrorsRef.current <= 5) {
        console.warn("[VoiceCmd] Error:", event.error, `(consecutive: ${consecutiveErrorsRef.current})`);
      }
    };

    recognition.onend = () => {
      // Ignore late onend events from an instance that has already been replaced/stopped,
      // otherwise it clobbers isRunningRef for the current instance and schedules a duplicate restart.
      if (recognitionRef.current !== recognition) return;
      isRunningRef.current = false;
      setIsListening(false);
      console.log("[VoiceCmd] Listener ended");

      // Auto-restart unless manually stopped
      if (!isStoppedManuallyRef.current && enabledRef.current) {
        // Exponential backoff: 800ms, 1.5s, 3s, 5s, cap at 8s
        const backoffMs = Math.min(8000, 800 * Math.pow(1.5, Math.min(consecutiveErrorsRef.current, 6)));
        clearRestartTimeout();
        restartTimeoutRef.current = window.setTimeout(() => {
          if (!isStoppedManuallyRef.current && enabledRef.current && !isRunningRef.current) {
            console.log("[VoiceCmd] Auto-restarting listener...");
            try {
              recognition.start();
            } catch (err) {
              console.warn("[VoiceCmd] Restart failed:", err);
              restartTimeoutRef.current = window.setTimeout(() => {
                if (!isStoppedManuallyRef.current && enabledRef.current && !isRunningRef.current) {
                  startListening();
                }
              }, 3000);
            }
          }
        }, backoffMs);
      }
    };

    isStoppedManuallyRef.current = false;
    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (err) {
      console.error("[VoiceCmd] Failed to start:", err);
      // Retry after delay
      restartTimeoutRef.current = window.setTimeout(() => {
        if (enabledRef.current && !isRunningRef.current) startListening();
      }, 2000);
    }
  }, [clearRestartTimeout]);

  const stopListening = useCallback(() => {
    isStoppedManuallyRef.current = true;
    isRunningRef.current = false;
    clearRestartTimeout();
    if (recognitionRef.current) {
      detachAndAbort(recognitionRef.current);
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, [clearRestartTimeout]);

  // Synchronously release the mic (e.g. before push-to-talk starts) WITHOUT marking the
  // listener as manually stopped, so the health check / enabled effect can bring it back.
  const pause = useCallback(() => {
    clearRestartTimeout();
    if (recognitionRef.current) {
      detachAndAbort(recognitionRef.current);
      recognitionRef.current = null;
    }
    isRunningRef.current = false;
    setIsListening(false);
  }, [clearRestartTimeout]);

  // Force restart — call this externally to ensure the listener is alive
  const forceRestart = useCallback(() => {
    if (!enabled) return;
    console.log("[VoiceCmd] Force-restarting listener");
    isStoppedManuallyRef.current = false;
    clearRestartTimeout();
    if (recognitionRef.current) {
      detachAndAbort(recognitionRef.current);
      recognitionRef.current = null;
    }
    isRunningRef.current = false;
    // Small delay to let the old instance fully stop
    restartTimeoutRef.current = window.setTimeout(() => {
      startListening();
    }, 300);
  }, [enabled, clearRestartTimeout, startListening]);

  // Auto-start/stop based on enabled flag
  useEffect(() => {
    if (enabled) {
      startListening();
    } else {
      stopListening();
    }
    return () => stopListening();
  }, [enabled, startListening, stopListening]);

  // Periodic health check — if we should be listening but aren't, restart
  useEffect(() => {
    if (!enabled) return;

    const healthCheck = window.setInterval(() => {
      if (enabled && !isRunningRef.current && !isStoppedManuallyRef.current) {
        console.log("[VoiceCmd] Health check: listener not running, restarting...");
        startListening();
      }
    }, 8000);

    return () => window.clearInterval(healthCheck);
  }, [enabled, startListening]);

  return { isListening, lastCommand, forceRestart, pause };
}
