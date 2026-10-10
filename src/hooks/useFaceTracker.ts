import { useEffect, useState } from "react";
import * as faceapi from "face-api.js";
import type { Rect, Size } from "@/lib/facePlacement";
import { EMPTY_TRACKER, pickProminent, updateTracks, type TrackerState } from "@/lib/faceTracks";

// Detection only (no landmarks, no descriptor): a few milliseconds per frame, so it can run
// several times a second to keep a label next to each face. Recognition stays in the slower
// capture loop.
const TRACK_OPTIONS = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 });
const TRACK_INTERVAL_MS = 250;

export interface TrackedFace {
  /** Stable while the same face stays in view (see src/lib/faceTracks), so overlays don't swap. */
  id: number;
  box: Rect; // in the video's own pixels
  video: Size;
}

/**
 * Every face in view (up to MAX_FACES, biggest first), each with an id that follows it from
 * frame to frame. A face the detector misses is held for TRACK_HOLD_MS so its panel doesn't
 * flicker.
 */
export function useFaceTracker(
  getVideo: () => HTMLVideoElement | null,
  enabled: boolean,
  // True while the capture loop runs full recognition; the two would compete for the GPU.
  isPaused: () => boolean = () => false,
): TrackedFace[] {
  const [faces, setFaces] = useState<TrackedFace[]>([]);

  useEffect(() => {
    if (!enabled) {
      setFaces([]);
      return;
    }
    let cancelled = false;
    let timer: number | undefined;
    let state: TrackerState = EMPTY_TRACKER;

    const tick = async () => {
      const video = getVideo();
      if (!isPaused() && video && video.readyState >= 2 && video.videoWidth > 0) {
        try {
          const detections = await faceapi.detectAllFaces(video, TRACK_OPTIONS);
          if (cancelled) return;
          const boxes = pickProminent(
            detections.map(({ box: { x, y, width, height }, score }) => ({ box: { x, y, width, height }, score })),
          ).map((face) => face.box);
          state = updateTracks(state, boxes, Date.now());
          const size = { width: video.videoWidth, height: video.videoHeight };
          const next = pickProminent(state.tracks).map(({ id, box }) => ({ id, box, video: size }));
          // Skip the re-render when nobody was or is in view (the common idle case)
          setFaces((previous) => (previous.length === 0 && next.length === 0 ? previous : next));
        } catch {
          // Models not ready or no GPU backend: no tracking, panels use their corner layout.
          state = { tracks: [], nextId: state.nextId };
          if (!cancelled) setFaces([]);
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
  }, [enabled, getVideo, isPaused]);

  return faces;
}
