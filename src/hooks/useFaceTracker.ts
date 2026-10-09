import { useEffect, useState } from "react";
import * as faceapi from "face-api.js";
import type { Rect, Size } from "@/lib/facePlacement";

// Detection only (no landmarks, no descriptor): a few milliseconds per frame, so it can run
// several times a second to keep a label next to the face. Recognition stays in the slower
// capture loop.
const TRACK_OPTIONS = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 });
const TRACK_INTERVAL_MS = 250;
// Keep the last box briefly when a frame misses the face, so the panel doesn't flicker.
const HOLD_MS = 800;

export interface TrackedFace {
  box: Rect; // in the video's own pixels
  video: Size;
}

export function useFaceTracker(
  getVideo: () => HTMLVideoElement | null,
  enabled: boolean,
): TrackedFace | null {
  const [face, setFace] = useState<TrackedFace | null>(null);

  useEffect(() => {
    if (!enabled) {
      setFace(null);
      return;
    }
    let cancelled = false;
    let timer: number | undefined;
    let lastSeenAt = 0;

    const tick = async () => {
      const video = getVideo();
      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        try {
          const detection = await faceapi.detectSingleFace(video, TRACK_OPTIONS);
          if (cancelled) return;
          if (detection) {
            lastSeenAt = Date.now();
            const { x, y, width, height } = detection.box;
            setFace({
              box: { x, y, width, height },
              video: { width: video.videoWidth, height: video.videoHeight },
            });
          } else if (Date.now() - lastSeenAt > HOLD_MS) {
            setFace(null);
          }
        } catch {
          // Models not ready or no GPU backend: no tracking, panels use their corner layout.
          if (!cancelled) setFace(null);
        }
      }
      // Schedule after the detection finishes so slow devices never stack up calls.
      if (!cancelled) timer = window.setTimeout(tick, TRACK_INTERVAL_MS);
    };
    tick();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, getVideo]);

  return face;
}
