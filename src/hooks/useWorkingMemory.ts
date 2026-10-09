import { useMemo, useRef, useState } from "react";
import { WorkingMemory, recordFace, recordFrame, recordQuestion, type ObservedFrame } from "@/lib/workingMemory";
import { sightingDue } from "@/lib/memory";
import { memoryRepository } from "@/lib/memoryRepository";

interface SeenFace {
  known: boolean;
  id?: number;
  name?: string;
  context?: { relation?: string };
}

/**
 * The camera page's short-term memory, plus the automatic "seen at" log for known faces.
 * Every method is stable, so Index can call it from callbacks without adding dependencies.
 */
export function useWorkingMemory() {
  const [memory] = useState(() => new WorkingMemory());
  // When each person's last sighting was saved this session (once per SIGHTING_INTERVAL_MS)
  const sightingsRef = useRef(new Map<number, number>());

  return useMemo(() => {
    return {
      /** Scene, any text read, and any hazard from one analysed frame. */
      recordFrame: (frame: ObservedFrame) => recordFrame(memory, frame, Date.now()),
      /** A recognised or unknown face. A known one is also logged as a sighting now and then. */
      recordFace: (face: SeenFace | null) => {
        if (!face) return;
        const now = Date.now();
        recordFace(memory, { known: face.known, id: face.id, name: face.name, relation: face.context?.relation }, now);
        if (!face.known || face.id === undefined || !sightingDue(sightingsRef.current.get(face.id), now)) return;
        sightingsRef.current.set(face.id, now);
        memoryRepository.saveSighting(face.id, new Date(now))
          .catch((error) => console.warn("[Memory] Couldn't save sighting:", error));
      },
      recordQuestion: (question: string, answer: string | null) =>
        recordQuestion(memory, question, answer, Date.now()),
      /** What happened recently, newest first, for a spoken question. */
      summary: () => memory.summarize(Date.now()),
      /** People seen in the last few minutes, most recent first. */
      recentPeople: () => memory.recentPeople(Date.now()),
    };
  }, [memory]);
}
