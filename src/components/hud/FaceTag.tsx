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
            <span className="max-w-full truncate rounded-lg bg-hud-name px-3 py-1 text-[1.75rem] font-bold leading-tight text-white shadow-md sm:text-[2rem]">
              {face.name}
            </span>
            {face.relation && (
              <span className="rounded-lg bg-hud-relation px-2.5 py-1 text-[1.125rem] font-semibold leading-tight text-white shadow-md">
                {face.relation}
              </span>
            )}
          </>
        ) : (
          <>
            <span className="rounded-lg bg-hud-unknown px-3 py-1 text-[1.5rem] font-bold leading-tight text-white shadow-md">
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
                className="pointer-events-auto inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-white px-3 text-[1.125rem] font-semibold text-black shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                aria-label="Add: save this person's face"
              >
                <UserPlus className="h-5 w-5" aria-hidden="true" />
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
          <p className="text-[1.125rem] text-white/80 [text-shadow:0_1px_3px_rgb(0_0_0/0.8)]">No saved memories yet</p>
        ))}
    </>
  );
}
