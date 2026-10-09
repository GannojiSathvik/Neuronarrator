export interface ConversationMemory {
  id?: number;
  personId: number;
  title: string;
  body: string;
  occurredAt: Date;
  createdAt: Date;
  // "sighting" is written automatically when a known face is recognised ("Seen at 4:12 PM").
  // It answers "when did I last see Meera?" but stays out of the Memory space timeline.
  source: "note" | "dictation" | "sample" | "sighting";
}

export const MEMORY_SOURCES: ConversationMemory["source"][] = ["note", "dictation", "sample", "sighting"];

/** Notes the user wrote (or the sample story); automatic sightings are kept out of the timeline. */
export const isTimelineMemory = (memory: ConversationMemory) => memory.source !== "sighting";

export interface MemoryHit {
  memory: ConversationMemory;
  score: number;
  matchedTerms: string[];
}

const STOP_WORDS = new Set(
  "a an and are as at be did do does for from had has have how i in is it me my of on or our that the their them there these they this to was we were what when where which who with you your about last discussed talk talked conversation remember".split(
    " ",
  ),
);

/** Unicode word tokens, deliberately conservative: this is lexical retrieval, not embeddings. */
export function tokenize(text: string): string[] {
  return (text.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (word) => !STOP_WORDS.has(word),
  );
}

/** BM25 over one person's notes. Scope BEFORE ranking to prevent cross-person recall. */
export function searchMemories(
  memories: ConversationMemory[],
  personId: number,
  query: string,
): MemoryHit[] {
  const scoped = memories.filter((memory) => memory.personId === personId);
  const terms = [...new Set(tokenize(query))];
  const newestFirst = (a: MemoryHit, b: MemoryHit) =>
    b.memory.occurredAt.getTime() - a.memory.occurredAt.getTime() ||
    (b.memory.id ?? 0) - (a.memory.id ?? 0);
  if (!query.trim())
    return scoped
      .map((memory) => ({ memory, score: 0, matchedTerms: [] }))
      .sort(newestFirst);
  if (!terms.length || !scoped.length) return [];

  const documents = scoped.map((memory) =>
    tokenize(`${memory.title} ${memory.body}`),
  );
  const averageLength =
    documents.reduce((total, words) => total + words.length, 0) /
      documents.length || 1;
  const frequencies = terms.map(
    (term) => documents.filter((words) => words.includes(term)).length,
  );
  return scoped
    .map((memory, index) => {
      const words = documents[index];
      const counts = new Map<string, number>();
      words.forEach((word) => counts.set(word, (counts.get(word) ?? 0) + 1));
      let score = 0;
      const matchedTerms: string[] = [];
      terms.forEach((term, termIndex) => {
        const count = counts.get(term) ?? 0;
        if (!count) return;
        matchedTerms.push(term);
        const idf = Math.log(
          1 +
            (scoped.length - frequencies[termIndex] + 0.5) /
              (frequencies[termIndex] + 0.5),
        );
        score +=
          (idf * (count * 2.2)) /
          (count + 1.2 * (0.25 + (0.75 * words.length) / averageLength));
      });
      return { memory, score, matchedTerms };
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || newestFirst(a, b));
}

/** Extract original text so a reminder never invents a personal fact. */
export function memoryExcerpt(body: string, limit = 220): string {
  const text = body.replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  const boundary = text.lastIndexOf(" ", limit);
  return `${text.slice(0, boundary > 0 ? boundary : limit)}…`;
}

export function validateMemory(
  input: Pick<ConversationMemory, "title" | "body" | "occurredAt">,
): void {
  if (!input.title.trim() || input.title.trim().length > 100)
    throw new Error("Use a title between 1 and 100 characters.");
  if (!input.body.trim() || input.body.trim().length > 6000)
    throw new Error("Use a note between 1 and 6,000 characters.");
  if (
    !Number.isFinite(input.occurredAt.getTime()) ||
    input.occurredAt.getTime() > Date.now() + 60_000
  ) {
    throw new Error(
      "Choose a valid conversation date that is not in the future.",
    );
  }
}

// Abbreviations whose period doesn't end a sentence ("Dr. Rao said…").
const FIRST_SENTENCE = /^.*?(?<!\b(?:Mr|Mrs|Ms|Dr|Prof|St|Jr|Sr))[.!?](?=\s|$)/;

/** The spoken reminder for a familiar face: the note's first sentence, in the user's own words. */
export function lastTimeSentence(body: string, limit = 120): string {
  const text = body.replace(/\s+/g, " ").trim();
  if (!text) return "";
  const excerpt = memoryExcerpt(text.match(FIRST_SENTENCE)?.[0] ?? text, limit);
  return `Last time: ${/[.!?…]$/.test(excerpt) ? excerpt : `${excerpt}.`}`;
}

/** A person is logged as seen at most once per this interval. */
export const SIGHTING_INTERVAL_MS = 10 * 60_000;

/** Whether a sighting should be saved now, given when this person's last one was saved. */
export const sightingDue = (lastLoggedAt: number | undefined, now: number) =>
  lastLoggedAt === undefined || now - lastLoggedAt >= SIGHTING_INTERVAL_MS;

/** The automatic note for a sighting: "Seen at 4:12 PM on 10 Oct 2026." */
export function sightingNote(at: Date): Pick<ConversationMemory, "title" | "body"> {
  const time = at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return { title: "Seen", body: `Seen at ${time} on ${noteDate(at)}.` };
}

const noteDate = (date: Date) =>
  date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** The saved notes about one person sent with a spoken question. */
export interface PersonNotes {
  name: string;
  notes: string[];
}

/** Notes sent with one question stay under this many characters in total (names included). */
export const PERSON_NOTES_MAX_CHARS = 1200;
const NOTE_EXCERPT_CHARS = 300;

/** The size measure the edge function also checks: every name and note, summed. */
export const personNotesLength = (people: PersonNotes[]) =>
  people.reduce(
    (total, person) => total + person.name.length + person.notes.reduce((sum, note) => sum + note.length, 0),
    0,
  );

/**
 * The notes worth sending for one person: the top `top` BM25 matches for the question, or the
 * `fallback` newest notes when nothing matches. Each is dated and quoted from the user's own
 * words, never paraphrased. The newest sighting is added as a separate line.
 */
export function selectPersonNotes(
  memories: ConversationMemory[],
  personId: number,
  question: string,
  top = 3,
  fallback = 2,
): string[] {
  const own = memories.filter((memory) => memory.personId === personId);
  const written = own.filter(isTimelineMemory);
  const hits = searchMemories(written, personId, question).slice(0, top);
  const chosen = hits.length
    ? hits.map((hit) => hit.memory)
    : searchMemories(written, personId, "").slice(0, fallback).map((hit) => hit.memory);
  const lines = chosen.map(
    (memory) => `${noteDate(memory.occurredAt)} — ${memory.title}: ${memoryExcerpt(memory.body, NOTE_EXCERPT_CHARS)}`,
  );
  const sighting = own
    .filter((memory) => memory.source === "sighting")
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0];
  if (sighting) lines.push(`Last recorded sighting: ${sighting.body}`);
  return lines;
}

/** Trim to `maxChars` in order: earlier people and better-ranked notes are kept first. */
export function capPersonNotes(people: PersonNotes[], maxChars = PERSON_NOTES_MAX_CHARS): PersonNotes[] {
  const kept: PersonNotes[] = [];
  let used = 0;
  for (const person of people) {
    if (used + person.name.length >= maxChars) break;
    used += person.name.length;
    const notes: string[] = [];
    for (const note of person.notes) {
      const room = maxChars - used;
      if (note.length <= room) {
        notes.push(note);
        used += note.length;
      } else {
        // Clip the note that doesn't fit if a useful part of it does, then stop
        if (room >= 60) {
          const clipped = memoryExcerpt(note, room - 1);
          notes.push(clipped);
          used += clipped.length;
        }
        break;
      }
    }
    if (notes.length) kept.push({ name: person.name, notes });
    else used -= person.name.length;
  }
  return kept;
}

/** People the question names ("what book did Arjun recommend?"), by any part of their name. */
export function peopleNamedIn<T extends { id?: number; name: string }>(question: string, people: T[]): T[] {
  const words = new Set(question.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
  return people.filter((person) =>
    person.id !== undefined &&
    (person.name.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).some(
      // Short parts ("Dr", "A") would match ordinary words
      (part) => part.length >= 3 && words.has(part),
    ),
  );
}
