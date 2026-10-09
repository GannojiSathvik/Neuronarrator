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
      className="max-w-full rounded-2xl border border-white/25 bg-white/20 px-4 py-3 shadow-lg backdrop-blur-md"
    >
      {/* Screen readers get the whole note at once, not each typed letter */}
      <p className="sr-only">{text}</p>
      <p
        aria-hidden="true"
        className="min-h-[1.5em] text-[1.125rem] font-medium leading-snug text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.65)] sm:text-[1.25rem]"
      >
        {shown}
      </p>
    </div>
  );
}
