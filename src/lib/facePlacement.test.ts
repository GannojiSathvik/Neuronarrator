import { describe, expect, it } from "vitest";
import { facePanelWidth, mirrorBox, placeBesideFace, placeFacePanels, videoBoxToScreen, SAFE_MARGIN } from "./facePlacement";

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

describe("mirrorBox / mirrored mapping", () => {
  it("flips x inside the video frame", () => {
    expect(mirrorBox({ x: 100, y: 50, width: 200, height: 220 }, 1280)).toEqual({ x: 980, y: 50, width: 200, height: 220 });
  });

  it("is its own inverse", () => {
    const box = { x: 123, y: 4, width: 56, height: 78 };
    expect(mirrorBox(mirrorBox(box, 640), 640)).toEqual(box);
  });

  it("puts a face on the left of the raw frame on the right of a mirrored screen", () => {
    const video = { width: 1280, height: 720 };
    const screen = { width: 1280, height: 720 };
    const box = { x: 100, y: 200, width: 200, height: 200 };
    expect(videoBoxToScreen(box, video, screen, false).x).toBe(100);
    expect(videoBoxToScreen(box, video, screen, true).x).toBe(980);
  });

  it("mirrors before the cover crop, so a centred face stays centred", () => {
    const video = { width: 1280, height: 720 };
    const phone = { width: 390, height: 844 };
    const centred = { x: 590, y: 310, width: 100, height: 100 };
    const plain = videoBoxToScreen(centred, video, phone, false);
    const mirrored = videoBoxToScreen(centred, video, phone, true);
    expect(mirrored.x).toBeCloseTo(plain.x);
    expect(mirrored.width).toBeCloseTo(plain.width);
  });

  it("mirrors an off-centre face around the screen centre after cropping", () => {
    const video = { width: 1280, height: 720 };
    const phone = { width: 390, height: 844 };
    const box = { x: 500, y: 300, width: 100, height: 100 };
    const plain = videoBoxToScreen(box, video, phone, false);
    const mirrored = videoBoxToScreen(box, video, phone, true);
    // The two boxes are reflections of each other around the screen's vertical centre line
    expect(plain.x + plain.width / 2 + (mirrored.x + mirrored.width / 2)).toBeCloseTo(phone.width);
    expect(mirrored.y).toBeCloseTo(plain.y);
  });
});

describe("facePanelWidth", () => {
  it("is about 45% of a wide screen, capped", () => {
    expect(facePanelWidth({ width: 800, height: 600 })).toBeCloseTo(360);
    expect(facePanelWidth({ width: 1920, height: 1080 })).toBe(440);
  });

  it("never goes below the minimum or past the safe area", () => {
    expect(facePanelWidth({ width: 390, height: 844 })).toBe(260);
    expect(facePanelWidth({ width: 240, height: 500 })).toBe(240 - SAFE_MARGIN.side * 2);
  });
});

describe("placeFacePanels (several faces)", () => {
  const screen = { width: 1280, height: 800 };
  const width = 280;
  const rectOf = (placement: { left: number; top: number }, height: number) => ({ x: placement.left, y: placement.top, width, height });
  const noPanelsOverlap = (placements: Record<string, { left: number; top: number }>, height: number) => {
    const rects = Object.values(placements).map((p) => rectOf(p, height));
    return rects.every((a, i) => rects.every((b, j) => i === j || !overlaps(a, b)));
  };

  it("places a single face exactly like placeBesideFace", () => {
    const face = { x: 400, y: 250, width: 200, height: 220 };
    expect(placeFacePanels([{ id: "a", face, height: 160 }], width, screen).a).toEqual(
      placeBesideFace(face, { width, height: 160 }, screen),
    );
  });

  it("keeps two faces' panels apart and off each other's faces", () => {
    // Side by side: A's right-hand panel would land on B, so A's goes elsewhere
    const a = { x: 300, y: 250, width: 200, height: 200 };
    const b = { x: 620, y: 260, width: 200, height: 200 };
    const placements = placeFacePanels([{ id: "b", face: b, height: 160 }, { id: "a", face: a, height: 160 }], width, screen);
    expect(noPanelsOverlap(placements, 160)).toBe(true);
    for (const placement of Object.values(placements)) {
      expect(overlaps(rectOf(placement, 160), a)).toBe(false);
      expect(overlaps(rectOf(placement, 160), b)).toBe(false);
    }
    expect(placements.a.side).not.toBe("right");
    expect(placements.b.side).toBe("right");
  });

  it("sends the second panel to the other side when the first took its spot", () => {
    // Two faces one above the other: both would go right at nearly the same height
    const top = { x: 500, y: 100, width: 120, height: 120 };
    const lower = { x: 505, y: 160, width: 120, height: 120 };
    const placements = placeFacePanels([{ id: "top", face: top, height: 160 }, { id: "lower", face: lower, height: 160 }], width, screen);
    expect(placements.top.side).toBe("right");
    expect(placements.lower.side).toBe("left");
    expect(noPanelsOverlap(placements, 160)).toBe(true);
  });

  it("shifts a panel down when no side is free", () => {
    // A narrow phone: every panel can only go below, centred, so they would stack on each other
    const phone = { width: 390, height: 1400 };
    const faces = [
      { id: "a", face: { x: 60, y: 120, width: 120, height: 120 }, height: 120 },
      { id: "b", face: { x: 200, y: 130, width: 120, height: 120 }, height: 120 },
    ];
    const placements = placeFacePanels(faces, 260, phone);
    const rects = Object.values(placements).map((p) => ({ x: p.left, y: p.top, width: 260, height: 120 }));
    expect(overlaps(rects[0], rects[1])).toBe(false);
    expect(Math.max(...rects.map((r) => r.y))).toBeGreaterThan(250);
  });

  it("gives the same layout whatever order the faces arrive in", () => {
    const faces = [
      { id: "a", face: { x: 100, y: 200, width: 150, height: 150 }, height: 140 },
      { id: "b", face: { x: 500, y: 220, width: 150, height: 150 }, height: 140 },
      { id: "c", face: { x: 900, y: 210, width: 150, height: 150 }, height: 140 },
    ];
    expect(placeFacePanels([...faces].reverse(), width, screen)).toEqual(placeFacePanels(faces, width, screen));
    expect(noPanelsOverlap(placeFacePanels(faces, width, screen), 140)).toBe(true);
  });
});
