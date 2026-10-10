import { motion, useReducedMotion } from "framer-motion";
import { UserPlus } from "lucide-react";
import type { HudFace } from "@/lib/hudState";
import { MemoryCard } from "./MemoryCard";

interface FaceTagProps {
  face: HudFace;
  announce: boolean;
  onAddPerson: () => void;
}

/**
 * What sits beside a face: a name chip and a relationship chip, then the memory card.
 * An unrecognised face gets a grey "Unknown" chip with a small Add button and no card.
 */
export function FaceTag({ face, announce, onAddPerson }: FaceTagProps) {
  const reduceMotion = useReducedMotion();
  const known = face.name !== null;

  return (
    <>
      {/* Chips fade and slide in over 200ms when the face is first recognised */}
      <motion.div
        className="flex max-w-full flex-wrap items-center gap-2"
        initial={reduceMotion ? false : { opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        {known ? (
          <>
            <span className="max-w-full truncate rounded-md bg-hud-name/90 px-3 py-1 text-[1.375rem] font-bold leading-tight text-white shadow">
              {face.name}
            </span>
            {face.relation && (
              <span className="rounded-md bg-hud-relation/90 px-2 py-0.5 text-[0.8125rem] font-semibold leading-tight text-white shadow">
                {face.relation}
              </span>
            )}
          </>
        ) : (
          <>
            <span className="rounded-md bg-hud-unknown/90 px-3 py-1 text-[1.125rem] font-semibold leading-tight text-white shadow">
              Unknown
            </span>
            {face.canEnroll && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onAddPerson();
                }}
                // The full-screen push-to-talk layer is underneath; don't let a press reach it
                onTouchStart={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
                className="pointer-events-auto inline-flex min-h-7 items-center gap-1 rounded-md bg-white/90 px-2 text-[0.8125rem] font-semibold text-black shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                aria-label="Add: save this person's face"
              >
                <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                Add
              </button>
            )}
          </>
        )}
      </motion.div>

      {known &&
        (face.memory ? (
          <MemoryCard key={face.memory} text={face.memory} announce={announce} />
        ) : (
          <p className="text-[0.8125rem] text-white/75 [text-shadow:0_1px_3px_rgb(0_0_0/0.8)]">No saved memories yet</p>
        ))}
    </>
  );
}
