import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// face-api.js pulls in TensorFlow; only the option constructors run at import time.
vi.mock("face-api.js", () => ({
  SsdMobilenetv1Options: vi.fn(),
  TinyFaceDetectorOptions: vi.fn(),
  nets: {},
}));

vi.mock("@/lib/faceDatabase", () => ({
  faceDB: {
    getAllFaces: vi.fn().mockResolvedValue([]),
    addFace: vi.fn().mockResolvedValue(1),
    enrollFace: vi.fn().mockResolvedValue(7),
    clearAllFaces: vi.fn().mockResolvedValue(undefined),
  },
}));

import { faceDB } from "@/lib/faceDatabase";
import { useFaceRecognition } from "./useFaceRecognition";

describe("useFaceRecognition.registerCurrentFace", () => {
  beforeEach(() => {
    vi.mocked(faceDB.addFace).mockClear();
    vi.mocked(faceDB.enrollFace).mockClear();
  });

  it("saves an explicitly passed descriptor even when no unknown face is in state", async () => {
    // This is the "Neuro remember <name>" path: detectAndMatch has just found a face,
    // but its setLastUnknownDescriptor update is not yet visible to the caller's closure.
    const { result } = renderHook(() => useFaceRecognition());
    await waitFor(() => expect(faceDB.getAllFaces).toHaveBeenCalled());
    expect(result.current.lastUnknownDescriptor).toBeNull();

    const descriptor = new Float32Array(128).fill(0.1);
    let success = false;
    await act(async () => {
      success = await result.current.registerCurrentFace("  Ronit ", "Friend", { descriptor });
    });

    expect(success).toBe(true);
    expect(faceDB.addFace).toHaveBeenCalledWith("Ronit", descriptor, "Friend");
    expect(result.current.lastMatch?.name).toBe("Ronit");
  });

  it("returns false without saving when there is no descriptor at all", async () => {
    const { result } = renderHook(() => useFaceRecognition());

    let success = true;
    await act(async () => {
      success = await result.current.registerCurrentFace("Ronit", "Friend");
    });

    expect(success).toBe(false);
    expect(faceDB.addFace).not.toHaveBeenCalled();
  });

  it("enrolls the face onto an existing Memory-space person when personId is given", async () => {
    const { result } = renderHook(() => useFaceRecognition());
    await waitFor(() => expect(faceDB.getAllFaces).toHaveBeenCalled());

    const descriptor = new Float32Array(128).fill(0.2);
    let success = false;
    await act(async () => {
      success = await result.current.registerCurrentFace("Asha", "Family", { descriptor, personId: 7 });
    });

    expect(success).toBe(true);
    expect(faceDB.enrollFace).toHaveBeenCalledWith(7, descriptor);
    expect(faceDB.addFace).not.toHaveBeenCalled();
    expect(result.current.lastMatch?.id).toBe(7);
  });
});
