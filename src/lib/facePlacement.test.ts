import { describe, expect, it } from "vitest";
import { placeBesideFace, videoBoxToScreen, SAFE_MARGIN } from "./facePlacement";

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe("videoBoxToScreen", () => {
  it("scales and crops like object-fit: cover", () => {
    // 1280x720 video on a 390x844 phone: height decides the scale, the sides are cropped
    const screenBox = videoBoxToScreen(
      { x: 640, y: 360, width: 128, height: 72 },
      { width: 1280, height: 720 },
      { width: 390, height: 844 },
    );
    const scale = 844 / 720;
    expect(screenBox.width).toBeCloseTo(128 * scale);
    // the video's centre lands on the screen's centre
    expect(screenBox.x).toBeCloseTo(195);
    expect(screenBox.y).toBeCloseTo(422);
  });

  it("is the identity when sizes match", () => {
    const box = { x: 10, y: 20, width: 30, height: 40 };
    expect(videoBoxToScreen(box, { width: 800, height: 600 }, { width: 800, height: 600 })).toEqual(box);
  });
});

describe("placeBesideFace", () => {
  const screen = { width: 1280, height: 800 };
  const panel = { width: 280, height: 160 };

  it("prefers the right side and never covers the face", () => {
    const face = { x: 400, y: 250, width: 200, height: 220 };
    const placement = placeBesideFace(face, panel, screen);
    expect(placement.side).toBe("right");
    expect(overlaps(face, { x: placement.left, y: placement.top, ...panel })).toBe(false);
  });

  it("flips to the left when the face is near the right edge", () => {
    const face = { x: 1000, y: 250, width: 200, height: 220 };
    const placement = placeBesideFace(face, panel, screen);
    expect(placement.side).toBe("left");
    expect(overlaps(face, { x: placement.left, y: placement.top, ...panel })).toBe(false);
  });

  it("goes below a wide face on a narrow phone screen", () => {
    const phone = { width: 390, height: 844 };
    const face = { x: 80, y: 180, width: 230, height: 260 };
    const placement = placeBesideFace(face, panel, phone);
    expect(placement.side).toBe("below");
    expect(placement.left).toBeGreaterThanOrEqual(SAFE_MARGIN.side);
    expect(placement.left + panel.width).toBeLessThanOrEqual(phone.width - SAFE_MARGIN.side);
  });

  it("stays inside the safe area when the face is at the very top", () => {
    const face = { x: 300, y: 0, width: 150, height: 150 };
    const placement = placeBesideFace(face, panel, screen);
    expect(placement.top).toBeGreaterThanOrEqual(SAFE_MARGIN.top);
  });

  it("stays on screen when the face fills the view", () => {
    const face = { x: 0, y: 0, width: 390, height: 844 };
    const phone = { width: 390, height: 844 };
    const placement = placeBesideFace(face, panel, phone);
    expect(placement.top + panel.height).toBeLessThanOrEqual(phone.height - SAFE_MARGIN.bottom);
  });
});
