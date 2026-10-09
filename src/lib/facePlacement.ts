// Where to put a small info panel next to a face on a full-screen camera feed.
// The video is drawn with object-fit: cover, so a face box from the detector (in the
// video's own pixels) has to be scaled and shifted into screen pixels first.

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export type PanelSide = "right" | "left" | "below" | "above";

export interface PanelPlacement {
  left: number;
  top: number;
  side: PanelSide;
}

// Space kept clear at the edges: the status pill and buttons sit at the top, the scene
// caption and control bar at the bottom.
export const SAFE_MARGIN = { top: 80, bottom: 120, side: 12 };
const GAP = 12;

/**
 * Flip a box horizontally inside the video frame: x' = videoWidth - x - width.
 * The detector always reads the raw (un-mirrored) camera pixels, so when the preview is drawn
 * mirrored (a selfie view) the face appears on the other side of the screen from where the
 * detector says it is.
 */
export function mirrorBox(box: Rect, videoWidth: number): Rect {
  return { ...box, x: videoWidth - box.x - box.width };
}

/**
 * Map a box in video pixels to screen pixels for a video shown with object-fit: cover.
 *
 * How the mapping works:
 * 1. Mirroring first. If the preview is shown mirrored, flip the box inside the video frame
 *    (x' = videoWidth - x - width) so it describes what the user actually sees.
 * 2. Cover scale. object-fit: cover scales the video uniformly by the LARGER of the two
 *    screen/video ratios, so the video fills the screen in both directions and one direction
 *    overflows (a 16:9 video on a tall phone overflows left and right).
 * 3. Crop offset. The overflow is cropped equally on both sides, so the scaled video starts at
 *    a negative offset ((screen - video * scale) / 2). Every point is scaled, then shifted by it.
 */
export function videoBoxToScreen(box: Rect, video: Size, screen: Size, mirrored = false): Rect {
  const source = mirrored ? mirrorBox(box, video.width) : box;
  const scale = Math.max(screen.width / video.width, screen.height / video.height);
  const offsetX = (screen.width - video.width * scale) / 2;
  const offsetY = (screen.height - video.height * scale) / 2;
  return {
    x: source.x * scale + offsetX,
    y: source.y * scale + offsetY,
    width: source.width * scale,
    height: source.height * scale,
  };
}

/** Width of the panel beside a face: about 45% of the screen like the reference HUD, but never
 *  so narrow the name chip wraps (260px) nor wider than the screen's safe area. */
export function facePanelWidth(screen: Size): number {
  const preferred = Math.min(Math.max(screen.width * 0.45, 260), 440);
  return Math.min(preferred, screen.width - SAFE_MARGIN.side * 2);
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

/**
 * Every place the panel could go beside the face, best first: right (reading order), then
 * left, then below, then above, each only if it fits the safe area. When no side fits (the face
 * fills the screen) the only option is low on screen, so at least the eyes stay visible.
 */
export function sidePlacements(face: Rect, panel: Size, screen: Size): PanelPlacement[] {
  const minLeft = SAFE_MARGIN.side;
  const maxLeft = screen.width - SAFE_MARGIN.side - panel.width;
  const minTop = SAFE_MARGIN.top;
  const maxTop = screen.height - SAFE_MARGIN.bottom - panel.height;
  // Line the panel's top up with the face's eyes-ish area
  const besideTop = clamp(face.y, minTop, maxTop);
  const centeredLeft = clamp(face.x + face.width / 2 - panel.width / 2, minLeft, maxLeft);
  const options: PanelPlacement[] = [];

  const rightLeft = face.x + face.width + GAP;
  if (rightLeft <= maxLeft) options.push({ left: rightLeft, top: besideTop, side: "right" });

  const leftLeft = face.x - GAP - panel.width;
  if (leftLeft >= minLeft) options.push({ left: leftLeft, top: besideTop, side: "left" });

  const belowTop = face.y + face.height + GAP;
  if (belowTop <= maxTop) options.push({ left: centeredLeft, top: belowTop, side: "below" });

  const aboveTop = face.y - GAP - panel.height;
  if (aboveTop >= minTop) options.push({ left: centeredLeft, top: aboveTop, side: "above" });

  if (options.length === 0) options.push({ left: centeredLeft, top: maxTop, side: "below" });
  return options;
}

/**
 * Put the panel beside the face without covering it: right first (reading order),
 * then left, then below, then above. Always clamped inside the safe area.
 */
export function placeBesideFace(face: Rect, panel: Size, screen: Size): PanelPlacement {
  return sidePlacements(face, panel, screen)[0];
}

const rectsOverlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

export interface FacePanelRequest {
  id: string;
  /** The face in screen pixels. */
  face: Rect;
  /** The panel's measured height (it grows as the memory types out). */
  height: number;
}

/**
 * Place one panel per face so no two panels overlap, and, where there is room, no panel
 * covers someone else's face.
 *
 * Faces are handled left to right, so the leftmost person gets first pick and the layout
 * reads like the scene. Each panel tries its sides in the usual order (right, other side,
 * below, above) and takes the first spot that is clear of the panels already placed and of
 * every face. If none is clear of faces, the first spot clear of panels will do. If even that
 * fails, the preferred spot is shifted down past whatever it hits until it is clear or runs
 * out of screen; on a screen too small for everyone the preferred spot is used as is.
 */
export function placeFacePanels(requests: FacePanelRequest[], width: number, screen: Size): Record<string, PanelPlacement> {
  const ordered = [...requests].sort((a, b) => a.face.x - b.face.x || a.id.localeCompare(b.id));
  const faces = requests.map((request) => request.face);
  const placed: Rect[] = [];
  const result: Record<string, PanelPlacement> = {};
  const maxTop = (height: number) => screen.height - SAFE_MARGIN.bottom - height;

  for (const { id, face, height } of ordered) {
    const panel = { width, height };
    const toRect = (placement: PanelPlacement): Rect => ({ x: placement.left, y: placement.top, ...panel });
    const hitsPanel = (rect: Rect) => placed.some((other) => rectsOverlap(rect, other));
    const hitsFace = (rect: Rect) => faces.some((other) => rectsOverlap(rect, other));

    const options = sidePlacements(face, panel, screen);
    let choice =
      options.find((option) => !hitsPanel(toRect(option)) && !hitsFace(toRect(option))) ??
      options.find((option) => !hitsPanel(toRect(option)));

    if (!choice) {
      // Shift the preferred spot down below each panel it collides with
      const shifted = { ...options[0] };
      while (shifted.top <= maxTop(height) && hitsPanel(toRect(shifted))) {
        const blocking = placed.filter((other) => rectsOverlap(toRect(shifted), other));
        shifted.top = Math.max(...blocking.map((other) => other.y + other.height)) + GAP;
      }
      choice = shifted.top <= maxTop(height) ? shifted : options[0];
    }

    result[id] = choice;
    placed.push(toRect(choice));
  }
  return result;
}
