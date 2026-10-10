// The capture loop re-describes the scene every few seconds. In a static scene the vision model
// rephrases the same thing each cycle ("A desk with a laptop" → "You're facing a desk and a
// laptop"), which a listener hears as the app repeating itself. These helpers decide whether a
// new sentence actually tells the user anything the last spoken one didn't.

/** Word-set (Jaccard) similarity at or above which a sentence counts as a rephrasing. With the
 *  4-6 content words a typical description has, swapping one word for a synonym scores 0.6-0.7
 *  (4 shared of 6 = 0.67) while two changed words drop to about 0.4 (3 of 7), so 0.6 tolerates
 *  one reworded word and nothing more. */
export const REPEAT_SIMILARITY = 0.6;

/** A repeat is let through once this much time has passed since the last spoken sentence, so a
 *  long-static scene is re-confirmed now and then instead of going silent for good. */
export const REPEAT_MEMORY_MS = 30_000;

// Grammar, filler and "nothing changed" words: they appear in every rephrasing, so counting them
// would make any two sentences look alike (or, for "still"/"same", look different).
const STOP_WORDS = new Set(
  ("a an the and or but of in on at to for with by from as into onto over is are was were be been being " +
    "it its this that these those there here i me my we our you your yours they them their he she him his her " +
    "s re ll ve d m t has have had do does can see seen appears appear looks look like seems seem visible view " +
    "scene image picture frame camera front ahead near next some something just also very now currently " +
    "still same again before nothing new changed change unchanged much else similar")
    .split(" "),
);

const NUMBER_WORDS = new Set(
  ("zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen " +
    "seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand " +
    "lakh lakhs crore crores million half")
    .split(" "),
);

// A person, animal or vehicle that wasn't mentioned before is always worth saying, even when the
// rest of a long sentence is unchanged ("…and a man is walking towards you").
const SALIENT_WORDS = new Set(
  ("person people man men woman women boy girl child children kid kids baby someone somebody " +
    "dog dogs cat cats animal car cars bus truck bike bicycle motorcycle scooter vehicle auto rickshaw")
    .split(" "),
);

/** Lowercase content words, ignoring grammar and filler words. */
export function contentWords(text: string): Set<string> {
  const words = text.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return new Set(words.filter((word) => !STOP_WORDS.has(word)));
}

/** Jaccard similarity of two sentences' content-word sets (1 = same words, 0 = none shared). */
export function similarity(a: string, b: string): number {
  const left = contentWords(a);
  const right = contentWords(b);
  if (!left.size && !right.size) return 1;
  let shared = 0;
  left.forEach((word) => { if (right.has(word)) shared += 1; });
  return shared / (left.size + right.size - shared);
}

const isNumber = (word: string) => /^\d+$/.test(word) || NUMBER_WORDS.has(word);
const numbersIn = (words: Set<string>) => [...words].filter(isNumber).sort().join(" ");

/** True when `next` says nothing the user didn't just hear in `last`. */
export function isRephrasing(next: string, last: string): boolean {
  if (!next.trim() || !last.trim()) return false;
  const nextWords = contentWords(next);
  const lastWords = contentWords(last);
  // A changed count, price or denomination is news even in an otherwise identical sentence
  // ("one hundred rupees" → "two hundred rupees").
  if (numbersIn(nextWords) !== numbersIn(lastWords)) return false;
  if ([...nextWords].some((word) => SALIENT_WORDS.has(word) && !lastWords.has(word))) return false;
  // Told to "keep it brief" in a static scene, the model often says a shorter subset of the last
  // sentence ("Same desk and laptop."). Nothing in it is new, however low its Jaccard score.
  if ([...nextWords].every((word) => lastWords.has(word))) return true;
  return similarity(next, last) >= REPEAT_SIMILARITY;
}

export interface SpokenMemory {
  mode: string;
  text: string;
  spokenAt: number;
}

/** Whether to stay quiet: same mode, said within REPEAT_MEMORY_MS, and only a rephrasing. */
export function shouldSkipRepeat(last: SpokenMemory | null, mode: string, text: string, now: number): boolean {
  if (!last || last.mode !== mode) return false;
  if (now - last.spokenAt >= REPEAT_MEMORY_MS) return false;
  return isRephrasing(text, last.text);
}
