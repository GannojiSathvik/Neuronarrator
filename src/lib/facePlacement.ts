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

// Space kept clear at the edges: the status pill and buttons sit at the top, the
// Memory space link and Stop control near the bottom.
export const SAFE_MARGIN = { top: 112, bottom: 88, side: 12 };
const GAP = 12;

/** Map a box in video pixels to screen pixels for a video shown with object-fit: cover. */
export function videoBoxToScreen(box: Rect, video: Size, screen: Size): Rect {
  // cover scales uniformly by the larger ratio and crops the overflow equally on both sides
  const scale = Math.max(screen.width / video.width, screen.height / video.height);
  const offsetX = (screen.width - video.width * scale) / 2;
  const offsetY = (screen.height - video.height * scale) / 2;
  return {
    x: box.x * scale + offsetX,
    y: box.y * scale + offsetY,
    width: box.width * scale,
    height: box.height * scale,
  };
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
