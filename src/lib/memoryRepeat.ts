// A familiar face's memory is spoken when they appear, but a person who keeps stepping in and
// out of view must not have the same note read to the user over and over.

export const MEMORY_REPEAT_MS = 60_000;

/** Whether a person's memory may be spoken now, given when it was last spoken (if ever). */
export function shouldSpeakMemory(lastSpokenAt: number | undefined, now: number, windowMs = MEMORY_REPEAT_MS): boolean {
  return lastSpokenAt === undefined || now - lastSpokenAt >= windowMs;
}
