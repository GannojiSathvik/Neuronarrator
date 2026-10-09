import { describe, expect, it } from "vitest";
import {
  DEMO_CAPTIONS,
  DEMO_HAZARD,
  DEMO_MODE_KEY,
  DEMO_PERSON,
  DEMO_TIMING,
  demoEventsBetween,
  demoFacesAt,
  readDemoMode,
  writeDemoMode,
} from "./demoSchedule";

const memoryStorage = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) };
};

describe("demo mode setting", () => {
  it("defaults to off and round-trips", () => {
    const storage = memoryStorage();
    expect(readDemoMode(storage)).toBe(false);
    writeDemoMode(true, storage);
    expect(storage.getItem(DEMO_MODE_KEY)).toBe("on");
    expect(readDemoMode(storage)).toBe(true);
  });

  it("survives blocked storage", () => {
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(readDemoMode(blocked)).toBe(false);
    expect(() => writeDemoMode(true, blocked)).not.toThrow();
  });
});

describe("demoFacesAt", () => {
  it("shows Jake with his relation and memory once he walks in", () => {
    expect(demoFacesAt(0)).toEqual([]);
    const [jake] = demoFacesAt(DEMO_TIMING.personAppearsAt);
    expect(jake).toMatchObject({ name: "Jake", relation: "Son", memory: DEMO_PERSON.memory });
  });

  it("drifts Jake's box slowly, staying inside the frame", () => {
    const a = demoFacesAt(3_000)[0].box;
    const b = demoFacesAt(3_250)[0].box;
    expect(a.x).not.toBe(b.x);
    expect(Math.abs(a.x - b.x)).toBeLessThan(0.02);
    for (let t = 2_000; t < 60_000; t += 700) {
      const { box } = demoFacesAt(t)[0];
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(1);
      expect(box.y + box.height).toBeLessThanOrEqual(1);
    }
  });

  it("brings in an unknown face every 20 seconds for a few seconds", () => {
    const unknownAt = (t: number) => demoFacesAt(t).some((face) => face.name === null);
    expect(unknownAt(10_000)).toBe(false);
    expect(unknownAt(20_000)).toBe(true);
    expect(unknownAt(20_000 + DEMO_TIMING.unknownVisibleMs)).toBe(false);
    expect(unknownAt(41_000)).toBe(true);
  });
});

describe("demoEventsBetween", () => {
  it("emits captions every 8 seconds, cycling through the list", () => {
    const captions = demoEventsBetween(0, 30_000).filter((event) => event.kind === "caption");
    expect(captions.map((event) => event.at)).toEqual([2_500, 10_500, 18_500, 26_500]);
    expect(captions[0].text).toBe(DEMO_CAPTIONS[0]);
    expect(captions[1].text).toBe(DEMO_CAPTIONS[1]);
  });

  it("emits the stairs hazard every 25 seconds", () => {
    const hazards = demoEventsBetween(0, 70_000).filter((event) => event.kind === "hazard");
    expect(hazards.map((event) => event.at)).toEqual([12_000, 37_000, 62_000]);
    expect(hazards[0].text).toBe(DEMO_HAZARD);
  });

  it("never skips or repeats an event however the timer ticks", () => {
    const end = 100_000;
    const whole = demoEventsBetween(0, end);
    const stepped: ReturnType<typeof demoEventsBetween> = [];
    let previous = 0;
    for (const t of [250, 251, 2_499, 2_500, 9_000, 9_000, 12_000, 40_000, 77_777, end]) {
      stepped.push(...demoEventsBetween(previous, t));
      previous = t;
    }
    expect(stepped).toEqual(whole);
  });

  it("returns events in time order", () => {
    const events = demoEventsBetween(0, 60_000);
    expect(events.map((event) => event.at)).toEqual([...events.map((event) => event.at)].sort((a, b) => a - b));
  });
});
