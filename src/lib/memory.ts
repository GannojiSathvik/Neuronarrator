export interface ConversationMemory {
  id?: number;
  personId: number;
  title: string;
  body: string;
  occurredAt: Date;
  createdAt: Date;
  source: "note" | "dictation" | "sample";
}

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
