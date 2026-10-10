import { useReducedMotion } from "framer-motion";
import { useReveal } from "@/hooks/useReveal";
import { CHAR_REVEAL_MS } from "@/lib/reveal";

interface MemoryCardProps {
  text: string;
  /** Let screen readers read it. Off while the app narrates the same memory with TTS. */
  announce: boolean;
  /** Wait for the name chips to slide in first. */
  delayMs?: number;
}

/** Frosted-glass card under the name chips with the person's latest saved note, typed out. */
export function MemoryCard({ text, announce, delayMs = 200 }: MemoryCardProps) {
  const reduceMotion = useReducedMotion();
  const shown = useReveal(text, "char", CHAR_REVEAL_MS, { animate: !reduceMotion, delayMs });

  return (
    <div
      aria-live={announce ? "polite" : "off"}
      aria-atomic="true"
      className="max-w-full rounded-xl border border-white/20 bg-white/15 px-4 py-3 shadow backdrop-blur-md"
    >
      {/* Screen readers get the whole note at once, not each typed letter */}
      <p className="sr-only">{text}</p>
      <p
        aria-hidden="true"
        className="min-h-[1.5em] text-[0.9375rem] font-normal leading-relaxed text-white/95 [text-shadow:0_1px_2px_rgb(0_0_0/0.55)]"
      >
        {shown}
      </p>
    </div>
  );
}
