import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// face-api.js pulls in TensorFlow; it is replaced by stubs. detectAllFaces returns whatever
// the multi-face test queues up, through the same .withFaceLandmarks().withFaceDescriptors() chain.
const faceApi = vi.hoisted(() => ({ detections: [] as unknown[] }));
vi.mock("face-api.js", () => {
  const loader = { loadFromUri: vi.fn().mockResolvedValue(undefined) };
  return {
    SsdMobilenetv1Options: vi.fn(),
    TinyFaceDetectorOptions: vi.fn(),
    nets: { ssdMobilenetv1: loader, tinyFaceDetector: loader, faceLandmark68Net: loader, faceRecognitionNet: loader },
    detectSingleFace: vi.fn().mockResolvedValue(undefined),
    detectFaceLandmarks: vi.fn().mockResolvedValue(undefined),
    computeFaceDescriptor: vi.fn().mockResolvedValue(undefined),
    detectAllFaces: vi.fn(() => ({
      withFaceLandmarks: () => ({ withFaceDescriptors: () => Promise.resolve(faceApi.detections) }),
    })),
  };
});

vi.mock("@/lib/faceDatabase", () => ({
  faceDB: {
    getAllFaces: vi.fn().mockResolvedValue([]),
    addFace: vi.fn().mockResolvedValue(1),
    enrollFace: vi.fn().mockResolvedValue(7),
    clearAllFaces: vi.fn().mockResolvedValue(undefined),
    updateLastSeen: vi.fn().mockResolvedValue(undefined),
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

describe("useFaceRecognition.detectAndMatchAll", () => {
  // A descriptor that is `offset` away from the all-zero one along the first axis
  const descriptor = (offset: number) => {
    const values = new Float32Array(128);
    values[0] = offset;
    return values;
  };
  const detection = (x: number, size: number, offset: number) => ({
    detection: { score: 0.9, box: { x, y: 50, width: size, height: size } },
    descriptor: descriptor(offset),
  });

  beforeEach(() => {
    vi.mocked(faceDB.updateLastSeen).mockClear();
    vi.mocked(faceDB.getAllFaces).mockResolvedValue([
      { id: 1, name: "Ronit", relation: "Friend", descriptor: descriptor(0), lastSeen: new Date(), createdAt: new Date() },
    ]);
  });

  it("matches every face one-to-one, biggest first, and marks each known person as seen", async () => {
    // Two faces both look like Ronit; only the closer one may be him. A third is a stranger.
    faceApi.detections = [detection(500, 80, 0.3), detection(100, 200, 0.1), detection(800, 60, 2)];
    const { result } = renderHook(() => useFaceRecognition());
    await act(async () => {
      await result.current.loadModels();
    });
    await waitFor(() => expect(result.current.isModelsLoaded).toBe(true));

    let matches: Awaited<ReturnType<typeof result.current.detectAndMatchAll>> = null;
    await act(async () => {
      matches = await result.current.detectAndMatchAll(document.createElement("video"));
    });

    expect(matches!.map((match) => [match.name, match.box?.x])).toEqual([
      ["Ronit", 100],
      ["Unknown", 500],
      ["Unknown", 800],
    ]);
    expect(faceDB.updateLastSeen).toHaveBeenCalledTimes(1);
    expect(faceDB.updateLastSeen).toHaveBeenCalledWith(1);
    // The biggest face is lastMatch; the biggest stranger is the one "remember X" would save
    expect(result.current.lastMatch?.name).toBe("Ronit");
    expect(result.current.lastMatches).toHaveLength(3);
    expect(result.current.lastUnknownDescriptor?.[0]).toBeCloseTo(0.3);
  });
});
