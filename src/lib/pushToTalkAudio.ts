/**
 * Audio side of push-to-talk: records the held-down utterance with MediaRecorder and sends it to
 * the `speech-to-text` edge function (server Whisper). The browser's live recognizer keeps
 * running alongside it for on-screen feedback and as the fallback.
 */
import { supabase } from "@/integrations/supabase/client";

/** Longest clip recorded per press; the recorder stops itself after this. */
export const MAX_CLIP_MS = 10_000;
/** Below either of these a clip is a tap or silence, not a command: not worth an upload. */
export const MIN_CLIP_BYTES = 1_500;
export const MIN_CLIP_MS = 400;
/** How long a release waits for the server before using the browser's transcript. */
export const SERVER_STT_TIMEOUT_MS = 6_000;

export interface Clip {
  blob: Blob;
  /** Container type without codecs, e.g. "audio/webm" or "audio/mp4". */
  mimeType: string;
  durationMs: number;
}

export interface ClipRecorder {
  /** Stops recording and releases the mic. Resolves with the clip, or null if nothing was recorded. */
  stop: () => Promise<Clip | null>;
  /** Stops recording, releases the mic and discards the audio. */
  cancel: () => void;
}

export function canRecordAudio(): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

/**
 * Opus in WebM where supported (Chrome, Firefox, Android), else MP4 (iOS Safari), else the
 * browser's default. Passing an unsupported mimeType to MediaRecorder throws.
 */
export function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return undefined;
  }
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) =>
    MediaRecorder.isTypeSupported(type),
  );
}

/**
 * Starts recording the microphone straight away (getUserMedia is asynchronous, so a release
 * that comes before the mic opens simply yields null). The mic tracks are released on every
 * exit: stop, cancel, the length cap, a recorder error or a failed start.
 */
export function startClipRecorder(maxMs = MAX_CLIP_MS): ClipRecorder {
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let finished = false;
  let capTimer: number | null = null;
  let startedAt = 0;
  const chunks: Blob[] = [];

  let resolveDone: (clip: Clip | null) => void = () => {};
  const done = new Promise<Clip | null>((resolve) => { resolveDone = resolve; });

  const release = () => {
    if (capTimer !== null) {
      window.clearTimeout(capTimer);
      capTimer = null;
    }
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
  };

  const finish = (clip: Clip | null) => {
    if (finished) return;
    finished = true;
    release();
    resolveDone(clip);
  };

  const ready = navigator.mediaDevices
    .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    .then((micStream) => {
      stream = micStream;
      if (finished) {
        release(); // released (or cancelled) before the mic opened
        return;
      }
      const preferred = pickRecorderMimeType();
      const rec = new MediaRecorder(micStream, preferred ? { mimeType: preferred } : undefined);
      recorder = rec;
      rec.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };
      rec.onstop = () => {
        const mimeType = (rec.mimeType || preferred || "audio/webm").split(";")[0];
        finish({
          blob: new Blob(chunks, { type: mimeType }),
          mimeType,
          durationMs: performance.now() - startedAt,
        });
      };
      rec.onerror = () => finish(null);
      rec.start(250);
      startedAt = performance.now();
      capTimer = window.setTimeout(() => {
        capTimer = null;
        if (rec.state !== "inactive") rec.stop(); // keeps the first maxMs; stop() returns it
      }, maxMs);
    })
    .catch((err) => {
      console.warn("[VoiceControl] Could not record audio for server speech-to-text:", err);
      finish(null);
    });

  const stopRecorder = () => {
    const rec = recorder;
    if (rec && rec.state !== "inactive") {
      try {
        rec.stop(); // onstop delivers the clip
        return;
      } catch { /* fall through */ }
    }
    finish(null);
  };

  return {
    stop: async () => {
      if (!finished && !recorder) {
        // The mic is still opening: give up on this clip, and release the mic once it opens
        finish(null);
      } else if (!finished) {
        stopRecorder();
      }
      await ready;
      return done;
    },
    cancel: () => {
      const rec = recorder;
      finish(null);
      if (rec && rec.state !== "inactive") {
        rec.onstop = null;
        try { rec.stop(); } catch { /* already stopped */ }
      }
    },
  };
}

export function isUsableClip(clip: Clip | null): clip is Clip {
  return !!clip && clip.blob.size >= MIN_CLIP_BYTES && clip.durationMs >= MIN_CLIP_MS;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? "");
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** What the server made of a clip: its text (possibly empty), or a failure. */
export type ServerTranscript = { ok: true; text: string } | { ok: false };

/**
 * Sends the clip to the `speech-to-text` edge function. Never throws. A non-2xx response, a
 * network error and the timeout are failures; an abort through `signal` is also reported as a
 * failure, so the caller must check whether it aborted before counting it.
 */
export async function transcribeClip(
  clip: Clip,
  signal: AbortSignal,
  language = "en-IN",
): Promise<ServerTranscript> {
  try {
    const audioBase64 = await blobToBase64(clip.blob);
    if (signal.aborted) return { ok: false };
    const { data, error } = await supabase.functions.invoke("speech-to-text", {
      body: { audioBase64, language_code: language, mime_type: clip.mimeType },
      signal,
      timeout: SERVER_STT_TIMEOUT_MS,
    });
    if (error) {
      if (!signal.aborted) console.warn("[VoiceControl] Server speech-to-text failed:", error);
      return { ok: false };
    }
    const text = typeof data?.transcript === "string" ? data.transcript.trim() : "";
    return { ok: true, text };
  } catch (err) {
    if (!signal.aborted) console.warn("[VoiceControl] Server speech-to-text failed:", err);
    return { ok: false };
  }
}
