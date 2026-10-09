import { describe, expect, it } from "vitest";
import { assignIdentities, euclideanDistance, MATCH_THRESHOLD } from "./faceIdentity";

// 2-number "descriptors" keep the geometry readable; the maths is the same for 128.
describe("euclideanDistance", () => {
  it("is the straight-line distance", () => {
    expect(euclideanDistance([0, 0], [3, 4])).toBe(5);
  });

  it("is infinite for descriptors of different lengths", () => {
    expect(euclideanDistance([0], [0, 0])).toBe(Infinity);
  });
});

describe("assignIdentities", () => {
  const ronit = [0, 0];
  const asha = [1, 0];

  it("matches each face to its own person", () => {
    const result = assignIdentities([[1, 0.1], [0, 0.1]], [ronit, asha]);
    expect(result.map((r) => r.person)).toEqual([1, 0]);
  });

  it("never gives one person to two faces: the closer face wins, the other is unknown", () => {
    // Both faces look like Ronit; the second is closer
    const result = assignIdentities([[0, 0.3], [0, 0.1]], [ronit]);
    expect(result[1]).toEqual({ person: 0, distance: expect.closeTo(0.1) });
    expect(result[0].person).toBeNull();
    // An unknown still reports its nearest distance, for the logs
    expect(result[0].distance).toBeCloseTo(0.3);
  });

  it("assigns the closest pair first, so a slightly worse face falls to its second choice", () => {
    // Face 0 is 0.2 from Ronit and 0.4 from Asha; face 1 is 0.1 from Ronit. Face 1 takes Ronit,
    // face 0 gets Asha rather than nobody.
    const near = [0, 0];
    const far = [0.6, 0];
    const result = assignIdentities([[0.2, 0], [-0.1, 0]], [near, far]);
    expect(result.map((r) => r.person)).toEqual([1, 0]);
  });

  it("leaves a face unknown when nobody is under the threshold", () => {
    const result = assignIdentities([[5, 5]], [ronit, asha]);
    expect(result[0].person).toBeNull();
    expect(assignIdentities([[0, MATCH_THRESHOLD]], [ronit])[0].person).toBeNull();
  });

  it("handles no saved people and no faces", () => {
    expect(assignIdentities([[0, 0]], [])).toEqual([{ person: null, distance: Infinity }]);
    expect(assignIdentities([], [ronit])).toEqual([]);
  });
});
