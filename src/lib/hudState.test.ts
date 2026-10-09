import { describe, expect, it } from "vitest";
import {
  buildHudFromDemo,
  buildHudFromReal,
  FACE_FADE_MS,
  hazardBannerText,
  isHazardVisible,
  mergeHeldFaces,
  nextFadeAt,
  type HudFace,
  type RealHudInput,
} from "./hudState";

const screen = { width: 1280, height: 720 };
const base: RealHudInput = {
  trackedFace: { box: { x: 100, y: 100, width: 200, height: 200 }, video: { width: 1280, height: 720 } },
  mirrored: false,
  match: null,
  canEnroll: false,
  screen,
  connected: true,
};

describe("buildHudFromReal", () => {
  it("shows no tag for a box nobody has been recognised in yet", () => {
    expect(buildHudFromReal(base).faces).toEqual([]);
  });

  it("shows no tag without a tracked box", () => {
    const hud = buildHudFromReal({ ...base, trackedFace: null, match: { known: true, name: "Asha", id: 1 } });
    expect(hud.faces).toEqual([]);
  });

  it("turns a known match into name, relation and memory", () => {
    const hud = buildHudFromReal({
      ...base,
      match: { known: true, name: "Asha", id: 7, relation: "Friend" },
      memory: "Talked about the trip.",
    });
    expect(hud.faces).toEqual([
      {
        id: "person-7",
        name: "Asha",
        relation: "Friend",
        memory: "Talked about the trip.",
        screenBox: { x: 100, y: 100, width: 200, height: 200 },
      },
    ]);
  });

  it("turns an unknown match into a nameless tag that can be enrolled", () => {
    const hud = buildHudFromReal({ ...base, match: { known: false, name: "Unknown" }, canEnroll: true });
    expect(hud.faces[0]).toMatchObject({ id: "unknown", name: null, canEnroll: true });
    expect(hud.faces[0].memory).toBeUndefined();
  });

  it("maps the box through the mirroring", () => {
    const hud = buildHudFromReal({ ...base, mirrored: true, match: { known: false, name: "Unknown" } });
    expect(hud.faces[0].screenBox.x).toBe(1280 - 100 - 200);
  });

  it("passes caption, hazard and connection through", () => {
    const hazard = { text: "Stairs", at: 5 };
    const hud = buildHudFromReal({ ...base, caption: { text: "A room" }, hazard, connected: false });
    expect(hud).toMatchObject({ caption: { text: "A room" }, hazard, connected: false });
  });
});

describe("buildHudFromDemo", () => {
  it("scales normalised boxes to the screen and is always connected", () => {
    const hud = buildHudFromDemo(
      { faces: [{ id: "a", name: "Jake", box: { x: 0.5, y: 0.25, width: 0.1, height: 0.2 } }], caption: "Hi" },
      { width: 1000, height: 800 },
    );
    expect(hud.faces[0].screenBox).toEqual({ x: 500, y: 200, width: 100, height: 160 });
    expect(hud.caption).toEqual({ text: "Hi" });
    expect(hud.connected).toBe(true);
  });
});

describe("mergeHeldFaces (2s fade-out)", () => {
  const face = (id: string, x = 0): HudFace => ({ id, name: id, screenBox: { x, y: 0, width: 10, height: 10 } });

  it("keeps a face that just went missing, frozen at its last box", () => {
    let held = mergeHeldFaces({}, [face("a", 5)], 0);
    held = mergeHeldFaces(held, [], 1_000);
    expect(held.a.face.screenBox.x).toBe(5);
  });

  it("drops it once it has been missing for 2 seconds", () => {
    let held = mergeHeldFaces({}, [face("a")], 0);
    held = mergeHeldFaces(held, [], FACE_FADE_MS - 1);
    expect(held.a).toBeDefined();
    held = mergeHeldFaces(held, [], FACE_FADE_MS);
    expect(held.a).toBeUndefined();
  });

  it("refreshes a face that is seen again", () => {
    let held = mergeHeldFaces({}, [face("a", 1)], 0);
    held = mergeHeldFaces(held, [face("a", 9)], 1_900);
    held = mergeHeldFaces(held, [], 3_000);
    expect(held.a.face.screenBox.x).toBe(9);
  });

  it("reports when the next held face expires", () => {
    const held = mergeHeldFaces(mergeHeldFaces({}, [face("a")], 0), [face("b")], 500);
    expect(nextFadeAt(held)).toBe(FACE_FADE_MS);
    expect(nextFadeAt({})).toBeNull();
  });
});

describe("hazard banner", () => {
  it("is visible for 4 seconds after it is raised", () => {
    const hazard = { text: "Stairs", at: 1_000 };
    expect(isHazardVisible(hazard, 4_999)).toBe(true);
    expect(isHazardVisible(hazard, 5_000)).toBe(false);
    expect(isHazardVisible(undefined, 0)).toBe(false);
  });

  it("prefers the hazard words, else the start of the description", () => {
    expect(hazardBannerText(["  car approaching "], "whatever")).toBe("car approaching");
    expect(hazardBannerText([], "Stairs going down right in front of you, be careful now please")).toBe(
      "Stairs going down right in front of you…",
    );
    expect(hazardBannerText([""], "Wet floor")).toBe("Wet floor");
  });
});
