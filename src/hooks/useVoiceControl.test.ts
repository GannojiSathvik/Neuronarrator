import { describe, it, expect } from "vitest";
import { parseCommand } from "./useVoiceControl";

describe("parseCommand (push-to-talk)", () => {
  it("maps currency phrases, including Hindi, to currency mode", () => {
    expect(parseCommand("Count notes")).toEqual({ mode: "currency", targetItem: "" });
    expect(parseCommand("kitne paise hai")).toEqual({ mode: "currency", targetItem: "" });
  });

  it("extracts the target item for finder commands", () => {
    expect(parseCommand("Find my keys")).toEqual({ mode: "finder", targetItem: "keys" });
    expect(parseCommand("where is my water bottle?")).toEqual({ mode: "finder", targetItem: "water bottle" });
    expect(parseCommand("look for the remote please")).toEqual({ mode: "finder", targetItem: "remote" });
  });

  it("maps describe phrases to standard mode", () => {
    expect(parseCommand("What do you see")).toEqual({ mode: "standard", targetItem: "" });
  });

  it("returns null for unrecognised speech", () => {
    expect(parseCommand("hello there")).toBeNull();
  });

  it("checks currency before finder, so money-related finds switch to currency mode", () => {
    // Documents current precedence: "money" matches a currency pattern first.
    expect(parseCommand("find my money")).toEqual({ mode: "currency", targetItem: "" });
  });
});
