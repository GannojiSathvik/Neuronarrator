import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ControlBar } from "./ControlBar";

const setup = (overrides: Partial<Parameters<typeof ControlBar>[0]> = {}) => {
  const props = {
    isActive: true,
    onStartStop: vi.fn(),
    targetItem: "",
    isListening: false,
    isTranscribing: false,
    onMicStart: vi.fn(),
    onMicEnd: vi.fn(),
    showDescribeNow: false,
    describeDisabled: false,
    onDescribeNow: vi.fn(),
    ...overrides,
  };
  render(<ControlBar {...props} />);
  return props;
};

describe("ControlBar", () => {
  it("ends a quick mic tap even before listening has started", () => {
    const props = setup();
    const mic = screen.getByRole("button", { name: "Hold to speak a command" });
    fireEvent.pointerDown(mic, { button: 0, pointerId: 1 });
    fireEvent.pointerUp(mic, { button: 0, pointerId: 1 });
    expect(props.onMicStart).toHaveBeenCalledTimes(1);
    expect(props.onMicEnd).toHaveBeenCalledTimes(1);
  });

  it("holds to talk with the keyboard, ignoring key repeat", () => {
    const props = setup();
    const mic = screen.getByRole("button", { name: "Hold to speak a command" });
    fireEvent.keyDown(mic, { key: " " });
    fireEvent.keyDown(mic, { key: " ", repeat: true });
    fireEvent.keyUp(mic, { key: " " });
    expect(props.onMicStart).toHaveBeenCalledTimes(1);
    expect(props.onMicEnd).toHaveBeenCalledTimes(1);
  });

  it("disables the mic until the camera is started", () => {
    setup({ isActive: false });
    expect(screen.getByRole("button", { name: "Hold to speak a command" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Start camera and narration" })).toBeInTheDocument();
  });

  it("shows Describe now only in manual mode", () => {
    const props = setup({ showDescribeNow: true });
    fireEvent.click(screen.getByRole("button", { name: /Describe now/ }));
    expect(props.onDescribeNow).toHaveBeenCalled();
  });
});
