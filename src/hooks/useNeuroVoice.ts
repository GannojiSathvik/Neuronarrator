import { useCallback, useEffect, useRef } from "react";
import { applyFemaleVoice } from "@/lib/femaleVoice";
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";

interface SpeakOptions {
  priority?: number;
  rate?: number;
  pitch?: number;
  speaker?: "anushka" | "abhilash";
  onEnd?: () => void;
}

// ── Web Audio API singleton (much more reliable than HTML Audio on iOS) ──
let audioCtx: AudioContext | null = null;
let audioCtxUnlocked = false;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

// Call this ONCE on the very first user tap — unlocks audio playback on iOS/Safari
export const unlockAudioForMobile = (): Promise<void> => {
  return new Promise((resolve) => {
    if (audioCtxUnlocked) {
      resolve();
      return;
    }

    const ctx = getAudioContext();

    if (ctx.state === "suspended") {
      ctx.resume().then(() => {
        console.log("AudioContext unlocked (resumed)");
        audioCtxUnlocked = true;
        resolve();
      }).catch(() => {
        console.warn("AudioContext resume failed, still proceeding");
        audioCtxUnlocked = true;
        resolve();
      });
    } else {
      console.log("AudioContext already running");
      audioCtxUnlocked = true;
      resolve();
    }

    // Play a tiny silent buffer to be extra safe (some iOS versions need this)
    try {
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
    } catch {
      // ignore — best-effort unlock
    }
  });
};

// Global generation counter — prevents stale responses from playing
let speakGeneration = 0;

export const useNeuroVoice = () => {
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const onEndCallbackRef = useRef<(() => void) | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const safetyTimerRef = useRef<number | null>(null);
  // Track whether audio is actively playing (NOT loading)
  const isPlayingRef = useRef(false);
  // Track whether TTS is busy (loading OR playing) — used by external callers to avoid interrupting
  const isBusyRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (safetyTimerRef.current) {
      window.clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
  }, []);

  const fireOnEnd = useCallback(() => {
    clearTimers();
    isPlayingRef.current = false;
    isBusyRef.current = false;
    const cb = onEndCallbackRef.current;
    onEndCallbackRef.current = null;
    if (cb) cb();
  }, [clearTimers]);

  const stopCurrentAudio = useCallback(() => {
    clearTimers();
    // Invalidate any in-flight speak() so its late response (or abort error) is discarded
    // rather than played or routed to the browser-TTS fallback.
    speakGeneration += 1;
    // Abort any pending TTS fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    // Clear callback BEFORE stopping to prevent stale onended from firing
    onEndCallbackRef.current = null;
    if (currentSourceRef.current) {
      currentSourceRef.current.onended = null;
      try { currentSourceRef.current.stop(); } catch { /* already stopped */ }
      currentSourceRef.current = null;
    }
    window.speechSynthesis?.cancel();
    isPlayingRef.current = false;
    isBusyRef.current = false;
  }, [clearTimers]);

  const speak = useCallback(async (text: string, priority: number = 5, options: SpeakOptions = {}) => {
    if (!text || !text.trim()) {
      console.log("[TTS] Empty text, skipping");
      if (options.onEnd) options.onEnd();
      return;
    }

    // Stop anything currently playing/loading
    stopCurrentAudio();

    // Track this generation to detect stale responses
    speakGeneration += 1;
    const thisGen = speakGeneration;

    onEndCallbackRef.current = options.onEnd || null;
    isBusyRef.current = true;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    console.log("[TTS] Starting speak, gen:", thisGen, "text:", text.slice(0, 50));

    try {
      const { data, error } = await supabase.functions.invoke('text-to-speech', {
        body: {
          text,
          speaker: options.speaker ?? "anushka",
        },
        // Lets stopCurrentAudio() cancel the request instead of letting it finish unused.
        signal: controller.signal,
      });

      // If a newer speak() was called while we were waiting, discard this result
      if (thisGen !== speakGeneration) {
        console.log("[TTS] Stale response (gen", thisGen, "vs", speakGeneration, "), discarding");
        return;
      }

      if (error) {
        // Non-2xx (429 rate limit, 504 timeout) arrives as FunctionsHttpError with data=null;
        // read the JSON body from error.context so rateLimited/useBrowserFallback are visible.
        const body = error instanceof FunctionsHttpError
          ? await error.context.json().catch(() => null)
          : null;
        if (body?.rateLimited || body?.useBrowserFallback) {
          console.warn("[TTS] Edge function asked for browser fallback:", body.error);
        } else {
          console.error("[TTS] Edge function error:", body?.error ?? error);
        }
        throw error;
      }

      if (data?.rateLimited || data?.useBrowserFallback) {
        console.warn("[TTS] Rate limited or fallback requested");
        throw new Error("Use browser fallback");
      }

      if (!data?.audioBase64) {
        console.error("[TTS] No audio data returned");
        throw new Error("No audio data");
      }

      // ── Play via Web Audio API ──
      const ctx = getAudioContext();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      // Decode base64 → ArrayBuffer → AudioBuffer
      const binaryString = atob(data.audioBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const audioBuffer = await ctx.decodeAudioData(bytes.buffer);

      // Check again if stale after decode
      if (thisGen !== speakGeneration) {
        console.log("[TTS] Stale after decode, discarding");
        return;
      }

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      source.onended = () => {
        console.log("[TTS] Audio playback ended (gen:", thisGen, ")");
        if (thisGen === speakGeneration) {
          currentSourceRef.current = null;
          fireOnEnd();
        }
      };

      currentSourceRef.current = source;
      isPlayingRef.current = true;
      source.start(0);
      console.log("[TTS] Audio playing via Web Audio API");

      // Safety timer: guarantee onEnd fires even if onended doesn't
      const durationMs = (audioBuffer.duration * 1000) + 2000;
      safetyTimerRef.current = window.setTimeout(() => {
        console.warn("[TTS] Safety timer fired (gen:", thisGen, ")");
        if (thisGen === speakGeneration) {
          currentSourceRef.current = null;
          fireOnEnd();
        }
      }, durationMs);

    } catch (err) {
      // If a newer generation took over, just bail
      if (thisGen !== speakGeneration) return;

      console.error("[TTS] Sarvam TTS failed, trying browser fallback:", err);

      // Fallback to browser TTS
      if (window.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = options.rate ?? 1.0;
        utterance.pitch = options.pitch ?? 1.0;
        utterance.volume = 1.0;
        applyFemaleVoice(utterance);

        utterance.onend = () => {
          console.log("[TTS] Browser TTS ended");
          if (thisGen === speakGeneration) fireOnEnd();
        };

        utterance.onerror = (e) => {
          console.error("[TTS] Browser TTS error:", e);
          if (thisGen === speakGeneration) fireOnEnd();
        };

        isPlayingRef.current = true;
        window.speechSynthesis.speak(utterance);

        // Safety timer for browser TTS, sized to the text. A fixed 7s cut off any
        // description longer than ~17 words. Browser voices run ~12 chars/s at rate 1.
        const estimatedMs = (text.length / 12) * 1000 / utterance.rate;
        safetyTimerRef.current = window.setTimeout(() => {
          console.warn("[TTS] Browser TTS safety timer fired");
          if (thisGen === speakGeneration) fireOnEnd();
        }, estimatedMs + 3000);
      } else {
        console.log("[TTS] No TTS available, firing onEnd immediately");
        fireOnEnd();
      }
    }
  }, [fireOnEnd, stopCurrentAudio]);

  const stop = useCallback(() => {
    stopCurrentAudio();
  }, [stopCurrentAudio]);

  // Stop any playing / pending speech when the component using this hook unmounts
  useEffect(() => {
    return () => stopCurrentAudio();
  }, [stopCurrentAudio]);

  const isSpeaking = useCallback(() => {
    // Only true when audio is actively playing, NOT during loading
    if (isPlayingRef.current) return true;
    if (currentSourceRef.current) return true;
    return window.speechSynthesis?.speaking ?? false;
  }, []);

  // True when TTS is loading OR playing — use this to guard capture loops
  const isBusy = useCallback(() => {
    return isBusyRef.current;
  }, []);

  const isLoading = useCallback(() => false, []);

  return { speak, stop, isSpeaking, isBusy, isLoading };
};