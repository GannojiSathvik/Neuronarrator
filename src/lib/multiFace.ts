// What the capture loop says and sends when several people are in view. Pure, so the wording
// and the "who gets a reminder this time" rules can be tested without a camera.

import type { KnownFaceInfo } from "@/services/vision";

/** The fields of a recognition result these helpers read (FaceMatch satisfies it). */
export interface RecognisedFace {
  known: boolean;
  id?: number;
  context?: { name: string; relation: string; daysSinceLastSeen: number; isLongAbsence: boolean };
}

/** Every recognised person, for the vision AI's prompt ("Asha, your friend, is on the left"). */
export function toKnownFaces(matches: RecognisedFace[]): KnownFaceInfo[] {
  return matches.flatMap((match) =>
    match.known && match.context
      ? [{
          name: match.context.name,
          relation: match.context.relation,
          daysSinceLastSeen: match.context.daysSinceLastSeen,
          isLongAbsence: match.context.isLongAbsence,
        }]
      : [],
  );
}

const COUNT_WORDS = ["no", "one", "two", "three", "four"];
const countWord = (count: number) => COUNT_WORDS[count] ?? String(count);

/** Spoken once per appearance of strangers. The "remember" flow saves the nearest stranger. */
export function unknownFacePrompt(count: number): string {
  return count > 1
    ? `There are ${countWord(count)} people I don't know in front of you. To save the nearest one, say neuro remember and their name.`
    : "There's someone I don't know in front of you. To save them, say neuro remember and their name.";
}

export function unknownFaceCaption(count: number): string {
  return count > 1
    ? `${count} unknown faces — say "Neuro remember [name]" to save the nearest`
    : 'Unknown face detected — say "Neuro remember [name]" to save';
}

/** At most this many "Last time: …" notes per capture, so narration doesn't become a list. */
export const MAX_REMINDERS_PER_CYCLE = 2;

/**
 * Which people in view get their memory note looked up this cycle. `announced` holds the
 * people already reminded during their current appearance (id → last seen), already pruned of
 * anyone gone longer than the absence reset. Those are only refreshed. Of the rest, the first
 * `max` (most prominent first) are looked up; anyone beyond that waits for the next cycle.
 */
export function pickReminderPeople(
  seenIds: number[],
  announced: ReadonlyMap<number, number>,
  max = MAX_REMINDERS_PER_CYCLE,
): { lookup: number[]; refresh: number[] } {
  const unique = [...new Set(seenIds)];
  return {
    refresh: unique.filter((id) => announced.has(id)),
    lookup: unique.filter((id) => !announced.has(id)).slice(0, max),
  };
}

/** The reminders as one spoken line. With several people in view, say whose note it is. */
export function joinReminders(reminders: { name: string; sentence: string }[], namePeople: boolean): string {
  return reminders
    .filter((reminder) => reminder.sentence)
    .map((reminder) => (namePeople ? `${reminder.name}. ${reminder.sentence}` : reminder.sentence))
    .join(" ");
}
