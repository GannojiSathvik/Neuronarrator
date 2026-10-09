import { describe, expect, it } from "vitest";
import { AUTO_DESCRIBE_KEY, readAutoDescribe, shouldAutoContinue, writeAutoDescribe } from "./autoDescribe";

const memoryStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
};

const blockedStorage = {
  getItem: () => { throw new Error("SecurityError"); },
  setItem: () => { throw new Error("SecurityError"); },
};

describe("auto-describe setting", () => {
  it("defaults to off", () => {
    expect(readAutoDescribe(memoryStorage())).toBe(false);
  });

  it("round-trips through storage", () => {
    const storage = memoryStorage();
    writeAutoDescribe(true, storage);
    expect(storage.getItem(AUTO_DESCRIBE_KEY)).toBe("on");
    expect(readAutoDescribe(storage)).toBe(true);
    writeAutoDescribe(false, storage);
    expect(readAutoDescribe(storage)).toBe(false);
  });

  it("falls back to off when storage is blocked", () => {
    expect(readAutoDescribe(blockedStorage)).toBe(false);
    expect(() => writeAutoDescribe(true, blockedStorage)).not.toThrow();
  });
});

describe("shouldAutoContinue", () => {
  it("keeps looping in every mode when auto-describe is on", () => {
    expect(shouldAutoContinue("general", true)).toBe(true);
    expect(shouldAutoContinue("reader", true)).toBe(true);
    expect(shouldAutoContinue("finder", true, true)).toBe(true);
  });

  it("stops after one description when auto-describe is off", () => {
    expect(shouldAutoContinue("general", false)).toBe(false);
    expect(shouldAutoContinue("currency", false)).toBe(false);
    expect(shouldAutoContinue("reader", false)).toBe(false);
  });

  it("keeps Finder scanning until the item is found, even when off", () => {
    expect(shouldAutoContinue("finder", false, false)).toBe(true);
    expect(shouldAutoContinue("finder", false, true)).toBe(false);
  });
});
