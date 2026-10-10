// Timing for text that appears progressively: the memory card types out character by character
// (~30ms each) and the scene caption appears word by word (~40ms each), like live subtitles.

export const CHAR_REVEAL_MS = 30;
export const WORD_REVEAL_MS = 40;

export type RevealUnit = "char" | "word";

/** The pieces revealed one at a time. Words keep their trailing space so joining is lossless. */
export function revealUnits(text: string, unit: RevealUnit): string[] {
  if (unit === "char") return Array.from(text);
  return text.match(/\s*\S+\s*/g) ?? [];
}

/** How many pieces are visible after elapsedMs (none before the first tick, never more than all). */
export function revealedCount(elapsedMs: number, total: number, msPerUnit: number): number {
  if (msPerUnit <= 0) return total;
  return Math.min(total, Math.max(0, Math.floor(elapsedMs / msPerUnit)));
}

export function revealText(text: string, unit: RevealUnit, count: number): string {
  return revealUnits(text, unit).slice(0, Math.max(0, count)).join("");
}

export function revealDurationMs(text: string, unit: RevealUnit, msPerUnit: number): number {
  return revealUnits(text, unit).length * msPerUnit;
}
