import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { TrackedFace } from "@/hooks/useFaceTracker";
import { placeBesideFace, videoBoxToScreen, type Size } from "@/lib/facePlacement";

const PANEL_WIDTH = 280;

const screenSize = (): Size => ({ width: window.innerWidth, height: window.innerHeight });

/**
 * A small panel that follows a tracked face and sits beside it (right, left, below or
 * above), like a name tag in AR, so it never covers the person you're looking at.
 */
export function FaceAnchoredPanel({ face, children }: { face: TrackedFace; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [screen, setScreen] = useState<Size>(screenSize);
  const [panelHeight, setPanelHeight] = useState(120);

  useEffect(() => {
    const onResize = () => setScreen(screenSize());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // The height changes with the caption length; measure it so the panel is kept on screen.
  useLayoutEffect(() => {
    const element = panelRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setPanelHeight(element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const width = Math.min(PANEL_WIDTH, screen.width - 24);
  const faceOnScreen = videoBoxToScreen(face.box, face.video, screen);
  const { left, top } = placeBesideFace(faceOnScreen, { width, height: panelHeight }, screen);

  return (
    <div
      ref={panelRef}
      className="fixed z-30 flex flex-col gap-2"
      // Ease between positions so the panel glides with the face instead of jumping.
      style={{ left, top, width, transition: "left 200ms ease-out, top 200ms ease-out" }}
    >
      {children}
    </div>
  );
}
