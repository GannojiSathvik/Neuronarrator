import { useEffect, useState } from "react";
import { revealedCount, revealText, revealUnits, type RevealUnit } from "@/lib/reveal";

/**
 * Text that appears a piece at a time (typewriter or word by word). Restarts whenever the text
 * changes. With animate off (prefers-reduced-motion) the full text is returned immediately.
 */
export function useReveal(
  text: string,
  unit: RevealUnit,
  msPerUnit: number,
  { animate = true, delayMs = 0 }: { animate?: boolean; delayMs?: number } = {},
): string {
  // Tied to the text it counts for, so a new text never flashes in full before its reset
  const [progress, setProgress] = useState({ text: "", count: 0 });

  useEffect(() => {
    if (!animate) return;
    const total = revealUnits(text, unit).length;
    const startedAt = Date.now() + delayMs;
    setProgress({ text, count: 0 });
    const timer = window.setInterval(() => {
      const count = revealedCount(Date.now() - startedAt, total, msPerUnit);
      setProgress({ text, count });
      if (count >= total) window.clearInterval(timer);
    }, msPerUnit);
    return () => window.clearInterval(timer);
  }, [text, unit, msPerUnit, animate, delayMs]);

  if (!animate) return text;
  return progress.text === text ? revealText(text, unit, progress.count) : "";
}
