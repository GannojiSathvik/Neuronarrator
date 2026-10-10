import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { HazardBanner } from "./HazardBanner";
import { SceneCaption } from "./SceneCaption";

describe("HazardBanner", () => {
  it("shows the hazard in an alert region", () => {
    render(<HazardBanner hazard={{ text: "Stairs ahead", at: Date.now() }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Stairs ahead");
  });

  it("leaves 4 seconds after the hazard was raised", async () => {
    // Raised 3.9s ago: 100ms left on screen, then the exit animation
    render(<HazardBanner hazard={{ text: "Stairs ahead", at: Date.now() - 3_900 }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Stairs ahead");
    await waitFor(() => expect(screen.getByRole("alert")).not.toHaveTextContent("Stairs ahead"), { timeout: 2_000 });
  });

  it("does not show a hazard that is already older than 4 seconds", () => {
    render(<HazardBanner hazard={{ text: "Stairs ahead", at: Date.now() - 5_000 }} />);
    expect(screen.getByRole("alert")).not.toHaveTextContent("Stairs ahead");
  });
});

describe("SceneCaption", () => {
  it("gives screen readers the whole caption at once, with no aria-label on the expandable element", () => {
    render(<SceneCaption text="A desk with a laptop is ahead of you." isVisible announce={false} />);
    const caption = screen.getByRole("button");
    expect(caption).not.toHaveAttribute("aria-label");
    expect(caption).toHaveAttribute("aria-expanded", "false");
    expect(caption).toHaveTextContent("A desk with a laptop is ahead of you.");
  });

  it("announces errors through the alert region even when captions are not announced", () => {
    render(<SceneCaption text="Network down" isVisible isError announce={false} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Network down");
  });
});
