import { describe, expect, it } from "vitest";
import {
  buildHudFromDemo,
  buildHudFromReal,
  FACE_FADE_MS,
  hazardBannerText,
  isHazardVisible,
  joinTrackedToMatches,
  mergeHeldFaces,
  nextFadeAt,
  type HudFace,
  type RealHudInput,
} from "./hudState";

const screen = { width: 1280, height: 720 };
const video = { width: 1280, height: 720 };
const leftBox = { x: 100, y: 100, width: 200, height: 200 };
const rightBox = { x: 800, y: 120, width: 180, height: 180 };
const base: RealHudInput = {
  trackedFaces: [{ id: 1, box: leftBox, video }],
  mirrored: false,
  matches: [],
  screen,
  connected: true,
};

describe("buildHudFromReal", () => {
  it("shows no tag for a box nobody has been recognised in yet", () => {
    expect(buildHudFromReal(base).faces).toEqual([]);
  });

  it("shows no tag without a tracked box", () => {
    const hud = buildHudFromReal({ ...base, trackedFaces: [], matches: [{ known: true, name: "Asha", id: 1, box: leftBox }] });
    expect(hud.faces).toEqual([]);
  });

  it("turns a known match into name, relation and memory", () => {
    const hud = buildHudFromReal({
      ...base,
      matches: [{ known: true, name: "Asha", id: 7, relation: "Friend", memory: "Talked about the trip.", box: leftBox }],
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
    const hud = buildHudFromReal({ ...base, matches: [{ known: false, name: "Unknown", box: leftBox, canEnroll: true }] });
    expect(hud.faces[0]).toMatchObject({ id: "unknown-1", name: null, canEnroll: true });
    expect(hud.faces[0].memory).toBeUndefined();
  });

  it("still joins a single face to a single result that has no box", () => {
    const hud = buildHudFromReal({ ...base, matches: [{ known: true, name: "Asha", id: 7 }] });
    expect(hud.faces.map((face) => face.name)).toEqual(["Asha"]);
  });

  it("maps the box through the mirroring", () => {
    const hud = buildHudFromReal({ ...base, mirrored: true, matches: [{ known: false, name: "Unknown", box: leftBox }] });
    expect(hud.faces[0].screenBox.x).toBe(1280 - 100 - 200);
  });

  it("passes caption, hazard and connection through", () => {
    const hazard = { text: "Stairs", at: 5 };
    const hud = buildHudFromReal({ ...base, caption: { text: "A room" }, hazard, connected: false });
    expect(hud).toMatchObject({ caption: { text: "A room" }, hazard, connected: false });
  });
});

describe("buildHudFromReal with several people", () => {
  // The tracker's boxes have moved a little since recognition ran, and recognition listed the
  // people in a different order: each box must still get its own person.
  const tracked = [
    { id: 3, box: { ...rightBox, x: rightBox.x + 15 }, video },
    { id: 4, box: { ...leftBox, x: leftBox.x - 10 }, video },
  ];

  it("joins each tracked face to the recognition result it overlaps", () => {
    const hud = buildHudFromReal({
      ...base,
      trackedFaces: tracked,
      matches: [
        { known: true, name: "Asha", id: 7, box: leftBox },
        { known: true, name: "Ronit", id: 9, box: rightBox },
      ],
    });
    expect(hud.faces.map((face) => [face.name, face.screenBox.x])).toEqual([
      ["Ronit", 815],
      ["Asha", 90],
    ]);
  });

  it("gives a known person and a stranger their own tags, Add only on the cached stranger", () => {
    const hud = buildHudFromReal({
      ...base,
      trackedFaces: [...tracked, { id: 5, box: { x: 500, y: 400, width: 120, height: 120 }, video }],
      matches: [
        { known: true, name: "Asha", id: 7, box: leftBox },
        { known: false, name: "Unknown", box: rightBox, canEnroll: true },
        { known: false, name: "Unknown", box: { x: 500, y: 400, width: 120, height: 120 } },
      ],
    });
    expect(hud.faces.map((face) => [face.id, face.name, face.canEnroll])).toEqual([
      ["unknown-3", null, true],
      ["person-7", "Asha", undefined],
      ["unknown-5", null, false],
    ]);
  });

  it("leaves a newcomer the recognition hasn't seen yet without a tag", () => {
    const hud = buildHudFromReal({
      ...base,
      trackedFaces: tracked,
      matches: [{ known: true, name: "Asha", id: 7, box: leftBox }],
    });
    expect(hud.faces.map((face) => face.name)).toEqual(["Asha"]);
  });

  it("joins one-to-one, so two boxes can't both become the same person", () => {
    expect(joinTrackedToMatches(tracked, [{ box: leftBox }])).toEqual([-1, 0]);
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
