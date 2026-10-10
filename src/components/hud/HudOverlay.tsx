import { useCallback, useState, type ReactNode } from "react";
import { AnimatePresence } from "framer-motion";
import { FaceAnchoredPanel } from "@/components/FaceAnchoredPanel";
import { useHeldFaces } from "@/hooks/useHeldFaces";
import { facePanelWidth, placeFacePanels, type Size } from "@/lib/facePlacement";
import type { HudState } from "@/lib/hudState";
import type { VisionMode } from "@/services/vision";
import { AppLogo } from "./AppLogo";
import { FaceTag } from "./FaceTag";
import { HazardBanner } from "./HazardBanner";
import { SceneCaption } from "./SceneCaption";
import { StatusPill } from "./StatusPill";

interface HudOverlayProps {
  /** Everything the HUD shows, from real data or the demo (see src/lib/hudState). */
  hud: HudState;
  screen: Size;
  /** Scanning: the status pill is shown */
  active: boolean;
  processing: boolean;
  /** Screen readers read captions and memories (off while the app narrates them with TTS) */
  announce: boolean;
  mode: VisionMode;
  priority: number;
  onAddPerson: () => void;
  /** Small buttons placed left of the status pill (settings) */
  topRight?: ReactNode;
  /** Shown above the control bar when not scanning (the intro card) */
  intro?: ReactNode;
  controls: ReactNode;
}

/** The heads-up layer over the camera: face tags, hazard banner, status, caption, controls. */
export function HudOverlay({ hud, screen, active, processing, announce, mode, priority, onAddPerson, topRight, intro, controls }: HudOverlayProps) {
  const faces = useHeldFaces(hud.faces);
  const panelWidth = facePanelWidth(screen);
  // Each panel's measured height (until measured, a typical tag-plus-card height). All panels
  // are placed together so two people's tags never land on top of each other.
  const [heights, setHeights] = useState<Record<string, number>>({});
  const reportHeight = useCallback((id: string, height: number) => {
    setHeights((previous) => (previous[id] === height ? previous : { ...previous, [id]: height }));
  }, []);
  const placements = placeFacePanels(
    faces.map((face) => ({ id: face.id, face: face.screenBox, height: heights[face.id] ?? 120 })),
    panelWidth,
    screen,
  );

  return (
    <>
      <HazardBanner hazard={hud.hazard} />

      <AnimatePresence>
        {faces.map((face) => (
          <FaceAnchoredPanel
            key={face.id}
            placement={placements[face.id]}
            width={panelWidth}
            onHeight={(height) => reportHeight(face.id, height)}
          >
            <FaceTag face={face} announce={announce} onAddPerson={onAddPerson} />
          </FaceAnchoredPanel>
        ))}
      </AnimatePresence>

      {/* Top right: settings, then the status pill. One flex row, so they can never overlap. */}
      <div className="fixed right-4 top-4 z-30 flex items-center gap-2">
        {topRight}
        {active && <StatusPill connected={hud.connected} processing={processing} />}
      </div>

      {/* Bottom: caption (or intro), then logo + control bar. Empty space lets taps through to push-to-talk. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex flex-col gap-3 px-4 pb-4">
        <SceneCaption
          text={hud.caption?.text ?? ""}
          textContent={hud.caption?.textContent}
          isVisible={!!hud.caption}
          isError={hud.caption?.isError}
          announce={announce}
          mode={mode}
          priority={priority}
        />
        {intro}
        <div className="grid grid-cols-[3rem_minmax(0,1fr)] items-end gap-3 sm:grid-cols-[3rem_minmax(0,1fr)_3rem]">
          <AppLogo />
          <div className="flex justify-center">{controls}</div>
        </div>
      </div>
    </>
  );
}
