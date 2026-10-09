import { useLayoutEffect, useRef, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { PanelPlacement } from "@/lib/facePlacement";

interface FaceAnchoredPanelProps {
  /** Where to draw it, from placeFacePanels (beside its face, clear of the other panels). */
  placement: Pick<PanelPlacement, "left" | "top">;
  width: number;
  /** Reports the panel's height, which the layout needs to keep panels apart and on screen. */
  onHeight: (height: number) => void;
  children: ReactNode;
}

/**
 * A panel that follows a face and sits beside it (right, then left, then below or above),
 * like a name tag in AR, so it never covers the person you're looking at. The parent works out
 * where every face's panel goes at once so they can't overlap. Fades in and out when used
 * inside AnimatePresence.
 */
export function FaceAnchoredPanel({ placement, width, onHeight, children }: FaceAnchoredPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const onHeightRef = useRef(onHeight);
  onHeightRef.current = onHeight;

  // The height changes as the memory types out; measure it so the panel is kept on screen.
  useLayoutEffect(() => {
    const element = panelRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => onHeightRef.current(element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const { left, top } = placement;
  // A soft spring glides the panel between tracker updates (4 a second) instead of jumping.
  const follow = reduceMotion ? { duration: 0 } : { type: "spring" as const, stiffness: 140, damping: 22, mass: 0.9 };

  return (
    <motion.div
      ref={panelRef}
      // Only the buttons inside take taps; the rest lets a press reach the push-to-talk layer.
      className="fixed z-30 flex flex-col items-start gap-2 pointer-events-none"
      style={{ width }}
      initial={{ opacity: 0, left, top }}
      animate={{ opacity: 1, left, top }}
      exit={{ opacity: 0 }}
      transition={{ left: follow, top: follow, opacity: { duration: reduceMotion ? 0 : 0.3 } }}
    >
      {children}
    </motion.div>
  );
}
