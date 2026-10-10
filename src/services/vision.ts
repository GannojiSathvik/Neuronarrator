import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { z } from "zod";
import { capPersonNotes, type PersonNotes } from "@/lib/memory";

const visionResponseSchema = z.object({
  text_content: z.string().max(10_000).default(""),
  description: z.string().trim().min(1).max(5000),
  hazards: z.array(z.string().max(200)).max(20).default([]),
  // The edge function clamps priority to 1-10 but does not round, so a model's 7.5 can
  // pass through. Round and clamp instead of rejecting an otherwise usable result.
  priority: z
    .number()
    .finite()
    .transform((p) => Math.min(10, Math.max(1, Math.round(p)))),
  found: z.boolean().optional(),
});

export interface VisionResponse {
  text_content: string;
  description: string;
  hazards: string[];
  priority: number;
  // Finder mode specific
  found?: boolean;
}

export type VisionMode = "general" | "reader" | "currency" | "finder";

export interface KnownFaceInfo {
  name: string;
  relation: string;
  daysSinceLastSeen?: number;
  isLongAbsence?: boolean;
}

/** Memory sent with a spoken question: what happened recently, and saved notes about the people. */
export interface QuestionMemory {
  /** Working-memory summary, newest first (sent only with a question, at most 1000 chars). */
  recentContext?: string;
  /** Relevant saved notes per recognised person (at most 1200 chars in total). */
  personNotes?: PersonNotes[];
}

export async function analyzeImage(
  base64Image: string,
  mode: VisionMode = "general",
  knownFaces: KnownFaceInfo[] = [],
  previousDescription: string = "",
  targetItem: string = "",
  question: string = "",
  { recentContext = "", personNotes = [] }: QuestionMemory = {},
): Promise<VisionResponse> {
  const { data, error } = await supabase.functions.invoke("analyze-image", {
    body: {
      imageBase64: base64Image,
      mode,
      knownFaces,
      previousDescription,
      targetItem,
      // A spoken question, answered about this frame instead of the mode's usual task
      ...(question ? { question: question.slice(0, 300) } : {}),
      // Memory only helps answer a question; the capture loop doesn't send it
      ...(question && recentContext ? { recentContext: recentContext.slice(0, 1000) } : {}),
      ...(question && personNotes.length ? { personNotes: capPersonNotes(personNotes) } : {}),
    },
    // Longer than analyze-image's 13s server budget (so a late fallback answer still arrives)
    // but shorter than the 15s watchdog, so a hung request can't lock the capture guard.
    timeout: 14_000,
  });

  if (error) {
    console.error("Edge function error:", error);
    // Non-2xx responses come back as FunctionsHttpError with data=null; the function's
    // JSON {error} message (e.g. the 503 "models unavailable" text) is on error.context.
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null);
      if (body?.error) throw new Error(body.error);
    }
    throw new Error(error.message || "Analysis failed");
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  const parsed = visionResponseSchema.safeParse(data);
  if (
    !parsed.success ||
    (mode === "finder" && parsed.data.found === undefined)
  ) {
    throw new Error(
      "The vision service returned an invalid response. Please try again.",
    );
  }
  return parsed.data as VisionResponse;
}
