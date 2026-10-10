import { describe, expect, it } from "vitest";
import { sanitizeCaption } from "./captionText";

describe("sanitizeCaption", () => {
  it("leaves a normal description alone", () => {
    expect(sanitizeCaption("A quiet street.")).toBe("A quiet street.");
  });

  it("pulls the description out of raw JSON", () => {
    expect(sanitizeCaption('{"description": "A desk", "priority": 2}')).toBe("A desk");
  });

  it("returns empty for empty input", () => {
    expect(sanitizeCaption("")).toBe("");
  });
});
