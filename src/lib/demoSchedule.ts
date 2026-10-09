// Demo mode: a scripted timeline of fake people and events, so the HUD can be shown (in an
// interview, on a laptop with no camera or backend) without a real face or the vision service.
// Everything here is a pure function of the time since the demo started, so it is testable and
// replays identically every time.

import type { NormalizedFace } from "./hudState";

export const DEMO_MODE_KEY = "neuronarrator.demoMode";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

const defaultStorage = (): Storage | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

/** Saved setting, OFF unless turned on. Storage can be blocked (private mode). */
export function readDemoMode(storage: Storage | undefined = defaultStorage()): boolean {
  try {
    return storage?.getItem(DEMO_MODE_KEY) === "on";
  } catch {
    return false;
  }
}

export function writeDemoMode(enabled: boolean, storage: Storage | undefined = defaultStorage()): void {
  try {
    storage?.setItem(DEMO_MODE_KEY, enabled ? "on" : "off");
  } catch {
    /* storage unavailable: the setting just lasts for this session */
  }
}

export const DEMO_PERSON = {
  id: "demo-jake",
  name: "Jake",
  relation: "Son",
  memory: "Visited last week and talked about the hackathon he went to where he got 3rd place",
} as const;

export const DEMO_HAZARD = "Stairs ahead, about 2 metres";

export const DEMO_CAPTIONS = [
  "You're in a bright office. A desk with a laptop is ahead of you.",
  "A person is standing about two metres in front of you, smiling.",
  "There is a door slightly to your right and a chair on your left.",
  "A coffee mug and a notebook are on the desk to your left.",
];

// When things happen, in ms since the demo started
export const DEMO_TIMING = {
  personAppearsAt: 1_500,
  firstCaptionAt: 2_500,
  captionEveryMs: 8_000,
  firstHazardAt: 12_000,
  hazardEveryMs: 25_000,
  unknownEveryMs: 20_000,
  unknownVisibleMs: 7_000,
};

/** The faces in view at time t. Jake's box drifts slowly so the follow animation is visible;
 *  a second, unknown face walks in every ~20s for a few seconds. */
export function demoFacesAt(t: number): NormalizedFace[] {
  const faces: NormalizedFace[] = [];
  if (t >= DEMO_TIMING.personAppearsAt) {
    faces.push({
      ...DEMO_PERSON,
      box: {
        x: 0.34 + 0.06 * Math.sin((2 * Math.PI * t) / 9_000),
        y: 0.26 + 0.04 * Math.sin((2 * Math.PI * t) / 6_000 + 1),
        width: 0.15,
        height: 0.26,
      },
    });
  }
  const cycle = t % DEMO_TIMING.unknownEveryMs;
  if (t >= DEMO_TIMING.unknownEveryMs && cycle < DEMO_TIMING.unknownVisibleMs) {
    faces.push({
      id: "demo-unknown",
      name: null,
      box: { x: 0.05 + 0.02 * Math.sin((2 * Math.PI * t) / 5_000), y: 0.5, width: 0.11, height: 0.19 },
    });
  }
  return faces;
}

export interface DemoEvent {
  kind: "caption" | "hazard";
  text: string;
  /** Scheduled time, ms since the demo started. */
  at: number;
}

// Times first + k*every that fall in (from, to]
function ticksBetween(from: number, to: number, first: number, every: number): number[] {
  const ticks: number[] = [];
  const startK = Math.max(0, Math.floor((from - first) / every) + 1);
  for (let k = startK; first + k * every <= to; k++) {
    const at = first + k * every;
    if (at > from) ticks.push(k);
  }
  return ticks;
}

/** The discrete events (captions, hazards) scheduled in (fromMs, toMs], in time order. A timer
 *  calls this with its previous and current time, so a late tick never skips or repeats one. */
export function demoEventsBetween(fromMs: number, toMs: number): DemoEvent[] {
  const { firstCaptionAt, captionEveryMs, firstHazardAt, hazardEveryMs } = DEMO_TIMING;
  const captions = ticksBetween(fromMs, toMs, firstCaptionAt, captionEveryMs).map((k) => ({
    kind: "caption" as const,
    text: DEMO_CAPTIONS[k % DEMO_CAPTIONS.length],
    at: firstCaptionAt + k * captionEveryMs,
  }));
  const hazards = ticksBetween(fromMs, toMs, firstHazardAt, hazardEveryMs).map((k) => ({
    kind: "hazard" as const,
    text: DEMO_HAZARD,
    at: firstHazardAt + k * hazardEveryMs,
  }));
  return [...captions, ...hazards].sort((a, b) => a.at - b.at);
}
