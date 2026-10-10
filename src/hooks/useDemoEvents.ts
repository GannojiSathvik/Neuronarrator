import { useEffect, useRef, useState } from "react";
import { demoEventsBetween, demoFacesAt, type DemoEvent } from "@/lib/demoSchedule";
import type { HudHazard, NormalizedFace } from "@/lib/hudState";

export interface DemoHud {
  faces: NormalizedFace[];
  caption?: string;
  hazard?: HudHazard;
}

/** What the page may want to say aloud: a caption, a hazard, or a face walking into view. */
export type DemoNotice = DemoEvent | { kind: "face"; face: NormalizedFace };

// Often enough that the drifting face glides (the panel's spring smooths between ticks)
const TICK_MS = 250;
const EMPTY: DemoHud = { faces: [] };

/** Plays the demo timeline (src/lib/demoSchedule) while enabled. Nothing touches the backend. */
export function useDemoEvents(enabled: boolean, onNotice: (notice: DemoNotice) => void): DemoHud {
  const [demo, setDemo] = useState<DemoHud>(EMPTY);
  const onNoticeRef = useRef(onNotice);
  onNoticeRef.current = onNotice;

  useEffect(() => {
    if (!enabled) {
      setDemo(EMPTY);
      return;
    }
    const startedAt = Date.now();
    let previous = 0;
    let inView = new Set<string>();

    const tick = () => {
      const t = Date.now() - startedAt;
      const faces = demoFacesAt(t);
      const events = demoEventsBetween(previous, t);
      previous = t;

      for (const face of faces) {
        if (!inView.has(face.id)) onNoticeRef.current({ kind: "face", face });
      }
      inView = new Set(faces.map((face) => face.id));
      events.forEach((event) => onNoticeRef.current(event));

      const caption = [...events].reverse().find((event) => event.kind === "caption");
      const hazard = [...events].reverse().find((event) => event.kind === "hazard");
      setDemo((current) => ({
        faces,
        caption: caption?.text ?? current.caption,
        hazard: hazard ? { text: hazard.text, at: Date.now() } : current.hazard,
      }));
    };
    tick();
    const timer = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(timer);
  }, [enabled]);

  return demo;
}
