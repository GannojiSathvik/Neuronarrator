import { describe, expect, it } from "vitest";
import { boxIoU, EMPTY_TRACKER, matchBoxes, MAX_FACES, pickProminent, TRACK_HOLD_MS, updateTracks } from "./faceTracks";

const box = (x: number, y = 100, size = 100) => ({ x, y, width: size, height: size });
const idAt = (state: { tracks: { id: number; box: { x: number; y: number } }[] }, x: number, y = 100) =>
  state.tracks.find((track) => track.box.x === x && track.box.y === y)?.id;

describe("boxIoU", () => {
  it("is 1 for the same box and 0 for boxes that don't touch", () => {
    expect(boxIoU(box(0), box(0))).toBe(1);
    expect(boxIoU(box(0), box(300))).toBe(0);
  });

  it("is overlap over union", () => {
    // Half overlap: 5000 / (10000 + 10000 - 5000)
    expect(boxIoU(box(0), box(50))).toBeCloseTo(1 / 3);
  });
});

describe("pickProminent", () => {
  it("keeps the biggest faces first, then the most confident, capped", () => {
    const faces = [
      { box: box(0, 0, 50), score: 0.9, name: "small" },
      { box: box(0, 0, 200), score: 0.5, name: "big" },
      { box: box(0, 0, 100), score: 0.6, name: "mid-low" },
      { box: box(0, 0, 100), score: 0.8, name: "mid-high" },
      { box: box(0, 0, 10), score: 0.99, name: "tiny" },
    ];
    expect(pickProminent(faces).map((face) => face.name)).toEqual(["big", "mid-high", "mid-low", "small"]);
    expect(pickProminent(faces)).toHaveLength(MAX_FACES);
  });
});

describe("matchBoxes", () => {
  it("pairs each new box with the old box it overlaps, whatever order the detector lists them in", () => {
    expect(matchBoxes([box(100), box(500)], [box(510), box(110)])).toEqual([1, 0]);
  });

  it("never gives one old box to two new ones", () => {
    const assigned = matchBoxes([box(100)], [box(105), box(120)]);
    expect(assigned.filter((index) => index === 0)).toHaveLength(1);
    expect(assigned).toContain(-1);
  });

  it("leaves a far-away box unmatched", () => {
    expect(matchBoxes([box(0)], [box(900)])).toEqual([-1]);
  });
});

describe("updateTracks", () => {
  it("keeps ids when two faces walk past each other", () => {
    // A starts on the left and walks right, B (a little lower) the other way, 40px per step.
    // Halfway they overlap; each must still keep its own id.
    let state = updateTracks(EMPTY_TRACKER, [box(100), box(500, 160)], 0);
    const a = idAt(state, 100)!;
    const b = idAt(state, 500, 160)!;
    for (let step = 1; step <= 10; step++) {
      const ax = 100 + step * 40;
      const bx = 500 - step * 40;
      // The detector lists them in either order
      state = updateTracks(state, step % 2 ? [box(bx, 160), box(ax)] : [box(ax), box(bx, 160)], step * 250);
      expect(idAt(state, ax)).toBe(a);
      expect(idAt(state, bx, 160)).toBe(b);
    }
    // They have now swapped sides and still carry their own ids
    expect(idAt(state, 500)).toBe(a);
    expect(idAt(state, 100, 160)).toBe(b);
  });

  it("holds a face that left for the hold time, then drops it", () => {
    let state = updateTracks(EMPTY_TRACKER, [box(100), box(500)], 0);
    const a = idAt(state, 100);
    state = updateTracks(state, [box(100)], 250);
    // B is missing but kept, frozen at its last box
    expect(state.tracks).toHaveLength(2);
    expect(idAt(state, 500)).toBeDefined();
    state = updateTracks(state, [box(100)], TRACK_HOLD_MS);
    expect(state.tracks).toHaveLength(2);
    state = updateTracks(state, [box(100)], TRACK_HOLD_MS + 1);
    expect(state.tracks.map((track) => track.id)).toEqual([a]);
  });

  it("gives the old id back to a face that returns within the hold", () => {
    let state = updateTracks(EMPTY_TRACKER, [box(100)], 0);
    const a = idAt(state, 100);
    state = updateTracks(state, [], 250);
    state = updateTracks(state, [box(110)], 500);
    expect(idAt(state, 110)).toBe(a);
  });

  it("gives a face that appears a new id and leaves the others alone", () => {
    let state = updateTracks(EMPTY_TRACKER, [box(100)], 0);
    const a = idAt(state, 100);
    state = updateTracks(state, [box(105), box(600)], 250);
    expect(idAt(state, 105)).toBe(a);
    const newcomer = idAt(state, 600);
    expect(newcomer).toBeDefined();
    expect(newcomer).not.toBe(a);
  });

  it("never reuses an id, so a new face can't inherit an old overlay", () => {
    let state = updateTracks(EMPTY_TRACKER, [box(100)], 0);
    const a = idAt(state, 100);
    state = updateTracks(state, [], TRACK_HOLD_MS * 2);
    state = updateTracks(state, [box(100)], TRACK_HOLD_MS * 3);
    expect(idAt(state, 100)).not.toBe(a);
  });
});
