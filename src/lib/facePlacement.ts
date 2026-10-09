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
 * Put the panel beside the face without covering it: right first (reading order),
 * then left, then below, then above. Always clamped inside the safe area.
 */
export function placeBesideFace(face: Rect, panel: Size, screen: Size): PanelPlacement {
  const minLeft = SAFE_MARGIN.side;
  const maxLeft = screen.width - SAFE_MARGIN.side - panel.width;
  const minTop = SAFE_MARGIN.top;
  const maxTop = screen.height - SAFE_MARGIN.bottom - panel.height;
  // Line the panel's top up with the face's eyes-ish area
  const besideTop = clamp(face.y, minTop, maxTop);
  const centeredLeft = clamp(face.x + face.width / 2 - panel.width / 2, minLeft, maxLeft);

  const rightLeft = face.x + face.width + GAP;
  if (rightLeft <= maxLeft) return { left: rightLeft, top: besideTop, side: "right" };

  const leftLeft = face.x - GAP - panel.width;
  if (leftLeft >= minLeft) return { left: leftLeft, top: besideTop, side: "left" };

  const belowTop = face.y + face.height + GAP;
  if (belowTop <= maxTop) return { left: centeredLeft, top: belowTop, side: "below" };

  const aboveTop = face.y - GAP - panel.height;
  if (aboveTop >= minTop) return { left: centeredLeft, top: aboveTop, side: "above" };

  // No free side (face fills the screen): sit low so at least the eyes stay visible.
  return { left: centeredLeft, top: maxTop, side: "below" };
}
