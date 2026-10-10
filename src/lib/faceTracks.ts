// Giving each face in view a stable id from one detector frame to the next.
// The detector only says "there are boxes here"; it has no idea which box is which person.
// Without ids, two overlays would swap or jump whenever the detector listed the faces in a
// different order. So each new frame is matched to the previous one: a box that overlaps (or
// sits close to) an old box keeps that old box's id, anything left over gets a fresh id.

import type { Rect } from "./facePlacement";

/** At most this many faces are tracked, recognised and drawn; the rest are ignored. */
export const MAX_FACES = 4;
/** Keep a face this long after the detector stops seeing it, so its panel doesn't flicker. */
export const TRACK_HOLD_MS = 800;
// Two boxes this similar are the same face. Faces move little in one 250ms tracker step.
const MIN_IOU = 0.1;
// ... or, for a small face that moved a lot, centres closer than this many face widths.
const MAX_CENTRE_DISTANCE = 0.75;

export interface FaceTrack {
  id: number;
  box: Rect;
  /** When the detector last saw it; a held track keeps its old box until it expires. */
  lastSeenAt: number;
}

export interface TrackerState {
  tracks: FaceTrack[];
  /** The next unused id; ids are never reused, so an old overlay never jumps to a new face. */
  nextId: number;
}

export const EMPTY_TRACKER: TrackerState = { tracks: [], nextId: 1 };

/** Intersection over union: overlap area / combined area. 1 = same box, 0 = not touching. */
export function boxIoU(a: Rect, b: Rect): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (width <= 0 || height <= 0) return 0;
  const overlap = width * height;
  return overlap / (a.width * a.height + b.width * b.height - overlap);
}

/** Distance between the two boxes' centres, in units of the larger box's width. */
export function centreDistance(a: Rect, b: Rect): number {
  const dx = a.x + a.width / 2 - (b.x + b.width / 2);
  const dy = a.y + a.height / 2 - (b.y + b.height / 2);
  return Math.hypot(dx, dy) / Math.max(a.width, b.width, 1);
}

/**
 * The faces worth handling: biggest first (the nearest person), then the most confident,
 * capped at MAX_FACES. Used by the tracker and by recognition so they agree on who counts.
 */
export function pickProminent<T extends { box: Rect; score?: number }>(faces: T[], max = MAX_FACES): T[] {
  return [...faces]
    .sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height || (b.score ?? 0) - (a.score ?? 0))
    .slice(0, max);
}

/**
 * Greedy one-to-one pairing of old boxes with new boxes. Every candidate pair is scored
 * (overlap first, then closeness), the best pair is locked in, both sides leave the pool,
 * and so on. Greedy is enough for at most 4 faces and never gives one id to two boxes.
 * Returns, for each new box, the index of its old box or -1.
 */
export function matchBoxes(previous: Rect[], current: Rect[]): number[] {
  const pairs: { prev: number; cur: number; iou: number; distance: number }[] = [];
  previous.forEach((old, prev) => {
    current.forEach((box, cur) => {
      const iou = boxIoU(old, box);
      const distance = centreDistance(old, box);
      if (iou >= MIN_IOU || distance <= MAX_CENTRE_DISTANCE) pairs.push({ prev, cur, iou, distance });
    });
  });
  pairs.sort((a, b) => b.iou - a.iou || a.distance - b.distance);

  const assigned = current.map(() => -1);
  const usedPrevious = new Set<number>();
  for (const pair of pairs) {
    if (assigned[pair.cur] !== -1 || usedPrevious.has(pair.prev)) continue;
    assigned[pair.cur] = pair.prev;
    usedPrevious.add(pair.prev);
  }
  return assigned;
}

/**
 * One tracker step: this frame's boxes in, the tracks with stable ids out. A matched box keeps
 * its track's id; a new box gets the next id; a track nobody matched is held (frozen at its
 * last box) until TRACK_HOLD_MS has passed, so a missed frame doesn't make its panel blink.
 */
export function updateTracks(state: TrackerState, boxes: Rect[], now: number, holdMs = TRACK_HOLD_MS): TrackerState {
  const assigned = matchBoxes(state.tracks.map((track) => track.box), boxes);
  let nextId = state.nextId;
  const seen = boxes.map((box, index) => {
    const old = assigned[index];
    return { id: old === -1 ? nextId++ : state.tracks[old].id, box, lastSeenAt: now };
  });
  const held = state.tracks.filter((track, index) => !assigned.includes(index) && now - track.lastSeenAt <= holdMs);
  return { tracks: [...seen, ...held].slice(0, MAX_FACES), nextId };
}
