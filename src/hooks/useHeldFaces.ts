import { useEffect, useRef, useState } from "react";
import { FACE_FADE_MS, mergeHeldFaces, nextFadeAt, type HeldFaces, type HudFace } from "@/lib/hudState";

/**
 * The faces the overlay draws: everything in view now, plus faces that went missing less than
 * FACE_FADE_MS ago (frozen where they were last seen). This is the overlay's own hold, on top
 * of useFaceTracker's short one, so the tracker's other users still see faces drop quickly.
 */
export function useHeldFaces(faces: HudFace[], fadeMs = FACE_FADE_MS): HudFace[] {
  const [held, setHeld] = useState<HeldFaces>({});
  const facesRef = useRef(faces);
  facesRef.current = faces;

  useEffect(() => {
    setHeld((previous) => mergeHeldFaces(previous, faces, Date.now(), fadeMs));
  }, [faces, fadeMs]);

  // Prune when the next missing face expires. Faces still in view are refreshed, not dropped,
  // even if nothing re-rendered meanwhile (the tracker pauses during a capture).
  useEffect(() => {
    const expiresAt = nextFadeAt(held, fadeMs);
    if (expiresAt === null) return;
    const timer = window.setTimeout(
      () => setHeld((previous) => mergeHeldFaces(previous, facesRef.current, Date.now(), fadeMs)),
      Math.max(0, expiresAt - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [held, fadeMs]);

  return Object.values(held).map((entry) => entry.face);
}
