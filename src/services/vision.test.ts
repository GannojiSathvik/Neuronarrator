import { beforeEach, describe, expect, it, vi } from "vitest";
import { FunctionsHttpError } from "@supabase/supabase-js";
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke } },
}));
import { analyzeImage } from "./vision";

describe("vision service boundary", () => {
  beforeEach(() => invoke.mockReset());
  it("preserves valid responses and bounds the request duration", async () => {
    invoke.mockResolvedValue({
      data: { description: "A chair ahead.", priority: 2 },
      error: null,
    });
    expect(await analyzeImage("image")).toEqual({
      description: "A chair ahead.",
      priority: 2,
      text_content: "",
      hazards: [],
    });
    expect(invoke).toHaveBeenCalledWith(
      "analyze-image",
      expect.objectContaining({ timeout: 14_000 }),
    );
  });
  it.each([
    null,
    { description: "A chair.", priority: Number.NaN },
    { description: "A chair.", priority: "high" },
    { description: {}, priority: 1 },
    { description: "A chair.", priority: 2, hazards: "fire" },
  ])(
    "rejects malformed model output instead of presenting it as a result",
    async (data) => {
      invoke.mockResolvedValue({ data, error: null });
      await expect(analyzeImage("image")).rejects.toThrow("invalid response");
    },
  );
  it.each([
    [7.5, 8],
    [99, 10],
    [0, 1],
  ])("rounds and clamps priority %s to %s", async (priority, expected) => {
    invoke.mockResolvedValue({
      data: { description: "A chair ahead.", priority },
      error: null,
    });
    expect((await analyzeImage("image")).priority).toBe(expected);
  });
  it("requires a boolean result when finding an item", async () => {
    invoke.mockResolvedValue({
      data: { description: "Looking for keys.", priority: 1 },
      error: null,
    });
    await expect(analyzeImage("image", "finder")).rejects.toThrow(
      "invalid response",
    );
  });
  it("keeps an explicit not-found response", async () => {
    invoke.mockResolvedValue({
      data: { description: "No keys visible.", priority: 1, found: false },
      error: null,
    });
    expect((await analyzeImage("image", "finder")).found).toBe(false);
  });
  it("surfaces the backend error from an HTTP failure", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(
        new Response(JSON.stringify({ error: "Vision service unavailable." }), {
          status: 503,
        }),
      ),
    });
    await expect(analyzeImage("image")).rejects.toThrow(
      "Vision service unavailable.",
    );
  });
});
