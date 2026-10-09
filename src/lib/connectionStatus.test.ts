import { describe, expect, it } from "vitest";
import { connectionReducer, INITIAL_CONNECTION, isConnected, type ConnectionEvent } from "./connectionStatus";

const run = (...events: ConnectionEvent[]) => events.reduce(connectionReducer, INITIAL_CONNECTION);

describe("connectionReducer", () => {
  it("is connected before any call", () => {
    expect(isConnected(INITIAL_CONNECTION)).toBe(true);
  });

  it("stays connected after a single failure", () => {
    expect(isConnected(run("failure"))).toBe(true);
  });

  it("shows reconnecting after two failures in a row", () => {
    expect(isConnected(run("failure", "failure"))).toBe(false);
    expect(isConnected(run("failure", "failure", "failure"))).toBe(false);
  });

  it("needs the failures to be consecutive", () => {
    expect(isConnected(run("failure", "success", "failure"))).toBe(true);
  });

  it("recovers on the next success or a reset", () => {
    expect(isConnected(run("failure", "failure", "success"))).toBe(true);
    expect(isConnected(run("failure", "failure", "reset"))).toBe(true);
  });

  it("keeps the same object when nothing changes, so React skips a render", () => {
    expect(connectionReducer(INITIAL_CONNECTION, "success")).toBe(INITIAL_CONNECTION);
  });
});
