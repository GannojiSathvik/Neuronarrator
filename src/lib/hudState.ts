// The HUD (heads-up display) is drawn from ONE view-model, HudState. Two producers fill it:
// buildHudFromReal (face tracker + last recognition of every face + saved memories + vision
// caption + hazard + backend health) and buildHudFromDemo (a scripted timeline, for showing the UI without a
// backend or a real face). The HUD components never know which one they are looking at, so
// the demo exercises exactly the same rendering, animation and placement code as real use.

import { videoBoxToScreen, type Rect, type Size } from "./facePlacement";
import { matchBoxes } from "./faceTracks";

export interface HudFace {
  /** Stable per person ("person-3", "unknown-2", "demo-jake"): animations key on it. */
  id: string;
  /** null = an unrecognised face ("Unknown" chip). */
  name: string | null;
  relation?: string;
  /** The person's latest saved note, shown in the memory card. */
  memory?: string;
  /** Where the face is on screen, already mapped from video pixels (cover crop, mirroring). */
  screenBox: Rect;
  /** Show the Add (enroll) button on the Unknown chip. */
  canEnroll?: boolean;
}

export interface HudHazard {
  text: string;
  /** When it was raised; a new value restarts the banner's 4s auto-dismiss. */
  at: number;
}

export interface HudCaption {
  text: string;
  /** Text read from the scene (signs, pages), shown under the description. */
  textContent?: string;
  isError?: boolean;
}

export interface HudState {
  faces: HudFace[];
  hazard?: HudHazard;
  caption?: HudCaption;
  connected: boolean;
}

/** One recognised face from the last full recognition, already joined with its saved note. */
export interface HudMatch {
  known: boolean;
  name: string;
  id?: number;
  relation?: string;
  /** Latest saved note for this person, if any. */
  memory?: string;
  /** Where recognition found the face, in video pixels; joins it to a tracked box. */
  box?: Rect;
  /** This stranger's descriptor is the cached one, so Add saves them. */
  canEnroll?: boolean;
}

export interface RealHudInput {
  /** From useFaceTracker: every face box in the video's own pixels, with a stable id. */
  trackedFaces: { id: number; box: Rect; video: Size }[];
  /** Whether the camera preview is drawn mirrored (selfie view). */
  mirrored: boolean;
  /** The last full recognition (identities); the tracker only knows where faces are. */
  matches: HudMatch[];
  screen: Size;
  caption?: HudCaption;
  hazard?: HudHazard;
  connected: boolean;
}

/**
 * Which recognition result belongs to which tracked box. Recognition runs every few seconds
 * with its own detector, the tracker four times a second, so their boxes are close but not
 * equal: pair them one-to-one by overlap (closest centres as a fallback, see matchBoxes).
 * Returns, for each tracked face, the index of its match or -1.
 */
export function joinTrackedToMatches(tracked: { box: Rect }[], matches: { box?: Rect }[]): number[] {
  const withBox = matches.flatMap((match, index) => (match.box ? [{ box: match.box, index }] : []));
  // A result without a box (a face saved by voice just now) can only be the single face in view
  if (withBox.length === 0) return tracked.length === 1 && matches.length === 1 ? [0] : tracked.map(() => -1);
  return matchBoxes(withBox.map((match) => match.box), tracked.map((face) => face.box)).map((index) =>
    index === -1 ? -1 : withBox[index].index,
  );
}

export function buildHudFromReal(input: RealHudInput): HudState {
  const joined = joinTrackedToMatches(input.trackedFaces, input.matches);
  const faces: HudFace[] = [];
  input.trackedFaces.forEach((tracked, i) => {
    const match = joined[i] === -1 ? undefined : input.matches[joined[i]];
    // A box without an identity yet (no recognition has run) gets no tag: there is nothing to say.
    if (!match) return;
    const screenBox = videoBoxToScreen(tracked.box, tracked.video, input.screen, input.mirrored);
    faces.push(
      match.known
        ? {
            id: `person-${match.id ?? match.name}`,
            name: match.name,
            relation: match.relation,
            memory: match.memory || undefined,
            screenBox,
          }
        : // Strangers are told apart by their tracker id, so two Unknown tags never share a key
          { id: `unknown-${tracked.id}`, name: null, screenBox, canEnroll: !!match.canEnroll },
    );
  });
  return { faces, hazard: input.hazard, caption: input.caption, connected: input.connected };
}

/** A face box in 0-1 fractions of the frame, so the demo works at any screen size. */
export interface NormalizedFace {
  id: string;
  name: string | null;
  relation?: string;
  memory?: string;
  box: Rect;
}

export function buildHudFromDemo(
  demo: { faces: NormalizedFace[]; caption?: string; hazard?: HudHazard },
  screen: Size,
): HudState {
  return {
    faces: demo.faces.map(({ box, ...face }) => ({
      ...face,
      screenBox: {
        x: box.x * screen.width,
        y: box.y * screen.height,
        width: box.width * screen.width,
        height: box.height * screen.height,
      },
    })),
    hazard: demo.hazard,
    caption: demo.caption ? { text: demo.caption } : undefined,
    // The demo never talks to the backend, so it is never "reconnecting"
    connected: true,
  };
}

// ── Overlay fade-out ──
// The tracker drops a face after a short hold (800ms) so other code reacts quickly. The overlay
// is kinder to the eye: it keeps the last tag where it was and only fades it out once the face
// has been missing from the HUD for FACE_FADE_MS.

export const FACE_FADE_MS = 2000;

export type HeldFaces = Record<string, { face: HudFace; seenAt: number }>;

/** Merge this frame's faces into the held set: present faces refresh, missing ones are kept
 *  (frozen in place) until FACE_FADE_MS has passed since they were last seen. */
export function mergeHeldFaces(held: HeldFaces, current: HudFace[], now: number, fadeMs = FACE_FADE_MS): HeldFaces {
  const next: HeldFaces = {};
  for (const [id, entry] of Object.entries(held)) {
    if (now - entry.seenAt < fadeMs) next[id] = entry;
  }
  for (const face of current) next[face.id] = { face, seenAt: now };
  return next;
}

/** The earliest moment a held face expires, so a timer can prune it; null when nothing is held. */
export function nextFadeAt(held: HeldFaces, fadeMs = FACE_FADE_MS): number | null {
  const times = Object.values(held).map((entry) => entry.seenAt + fadeMs);
  return times.length ? Math.min(...times) : null;
}

// ── Hazard banner ──

export const HAZARD_BANNER_MS = 4000;

export function isHazardVisible(hazard: HudHazard | undefined, now: number, durationMs = HAZARD_BANNER_MS): boolean {
  return !!hazard && now - hazard.at < durationMs;
}

/** The banner's short text: the model's hazard words, or the start of the description. */
export function hazardBannerText(hazards: string[], description: string, maxWords = 8): string {
  const named = hazards.find((hazard) => hazard.trim());
  if (named) return named.trim();
  const words = description.trim().split(/\s+/).filter(Boolean);
  return words.length > maxWords ? `${words.slice(0, maxWords).join(" ").replace(/[,;:]$/, "")}…` : words.join(" ");
}
