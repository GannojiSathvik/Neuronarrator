import { describe, expect, it } from "vitest";
import { confirmStep } from "./confirmWindow";

describe("confirmStep", () => {
  it("only arms on the first trigger", () => {
    expect(confirmStep(null, 1_000)).toEqual({ confirmed: false, armedAt: 1_000 });
  });

  it("confirms a second trigger within 5 seconds", () => {
    const first = confirmStep(null, 1_000);
    const second = confirmStep(first.armedAt, 5_500);
    expect(second).toEqual({ confirmed: true, armedAt: null });
  });

  it("does not confirm two triggers 6 seconds apart, and re-arms instead", () => {
    const first = confirmStep(null, 1_000);
    const second = confirmStep(first.armedAt, 7_000);
    expect(second).toEqual({ confirmed: false, armedAt: 7_000 });
    // A prompt follow-up to the re-armed trigger then confirms
    expect(confirmStep(second.armedAt, 8_000).confirmed).toBe(true);
  });

  it("needs a fresh pair after confirming", () => {
    const confirmed = confirmStep(confirmStep(null, 0).armedAt, 1_000);
    expect(confirmStep(confirmed.armedAt, 2_000).confirmed).toBe(false);
  });
});
