// Working (short-term) memory: what happened in the last few minutes, so a spoken question like
// "what did I just see?" or "who was here a moment ago?" can be answered. It lives only in this
// tab's memory: nothing here is written to IndexedDB or kept after a reload.
import { isRephrasing } from "./novelty";
import { memoryExcerpt } from "./memory";

export type WorkingMemoryKind = "scene" | "person" | "hazard" | "text" | "question" | "answer";

export interface WorkingMemoryEntry {
  /** When this was first observed (ms since epoch). */
  at: number;
  kind: WorkingMemoryKind;
  text: string;
  personId?: number;
  /** When a merged near-duplicate last confirmed it. Absent until something merges into it. */
  lastAt?: number;
}

/** Keep about three minutes of events... */
export const WORKING_MEMORY_WINDOW_MS = 3 * 60_000;
/** ...but never more than this many entries, however busy the scene. */
export const WORKING_MEMORY_MAX_ENTRIES = 40;
/** The summary sent with a question stays this short so the prompt stays small. */
export const WORKING_MEMORY_SUMMARY_CHARS = 800;
/** A person seen again within this gap is the same appearance, not a new one. */
const PERSON_GAP_MS = 60_000;
/** One long scene description must not crowd the other lines out of the summary. */
const LINE_TEXT_CHARS = 160;

/** The time something was last confirmed: the merge time, else when it was first seen. */
export const lastObserved = (entry: WorkingMemoryEntry) => entry.lastAt ?? entry.at;

/** "just now", "8s ago", "1m ago" */
export function ago(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 1) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

const clip = (text: string) => memoryExcerpt(text, LINE_TEXT_CHARS);

function describe(entry: WorkingMemoryEntry, now: number): string {
  const when = ago(now - lastObserved(entry));
  const text = clip(entry.text);
  switch (entry.kind) {
    case "scene":
      return `${when}: scene — ${text}`;
    case "hazard":
      return `${when}: hazard — ${text}`;
    case "text":
      return `${when}: read text — "${text}"`;
    case "person": {
      // An appearance is dated from when it started, with how recently it was still in view
      const stillSeen = entry.lastAt !== undefined && entry.lastAt - entry.at >= 5_000;
      return `${ago(now - entry.at)}: ${text}${stillSeen ? ` (still in view ${when})` : ""}`;
    }
    default:
      return `${when}: ${text}`;
  }
}

/**
 * A time-windowed ring buffer of recent observations. Near-duplicates (the same scene rephrased,
 * the same person still in view) refresh the existing entry instead of adding a new one, so an
 * unchanged scene doesn't fill the buffer. Pure: every method takes `now`.
 */
export class WorkingMemory {
  private entries: WorkingMemoryEntry[] = []; // oldest first

  constructor(
    private readonly windowMs = WORKING_MEMORY_WINDOW_MS,
    private readonly maxEntries = WORKING_MEMORY_MAX_ENTRIES,
  ) {}

  record(kind: WorkingMemoryKind, text: string, now: number, personId?: number): void {
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean) return;
    this.prune(now);
    const duplicate = this.findDuplicate(kind, clean, now, personId);
    if (duplicate) {
      // Keep the first wording: a later "Still the same desk." says less than the original
      duplicate.lastAt = now;
      // Keep the buffer ordered by last observation so the newest entry is always at the end
      this.entries.splice(this.entries.indexOf(duplicate), 1);
      this.entries.push(duplicate);
      return;
    }
    this.entries.push({ at: now, kind, text: clean, ...(personId !== undefined ? { personId } : {}) });
    if (this.entries.length > this.maxEntries) this.entries.splice(0, this.entries.length - this.maxEntries);
  }

  /** Entries observed within the last `ms`, newest first. */
  recentWithin(ms: number, now: number): WorkingMemoryEntry[] {
    this.prune(now);
    return this.entries.filter((entry) => now - lastObserved(entry) <= ms).reverse();
  }

  /** Person ids seen in the window, most recently seen first. */
  recentPeople(now: number): number[] {
    const ids = this.recentWithin(this.windowMs, now)
      .map((entry) => entry.personId)
      .filter((id): id is number => id !== undefined);
    return [...new Set(ids)];
  }

  /**
   * Compact lines, newest first, capped at `maxChars`. The newest line always comes first (and is
   * clipped rather than dropped), so the last couple of seconds are never cut for older context.
   */
  summarize(now: number, maxChars = WORKING_MEMORY_SUMMARY_CHARS): string {
    const lines = this.recentWithin(this.windowMs, now).map((entry) => describe(entry, now));
    if (!lines.length) return "";
    let summary = lines[0].length > maxChars ? `${lines[0].slice(0, maxChars - 1)}…` : lines[0];
    for (const line of lines.slice(1)) {
      if (summary.length + 1 + line.length > maxChars) break;
      summary += `\n${line}`;
    }
    return summary;
  }

  clear(): void {
    this.entries = [];
  }

  private prune(now: number): void {
    this.entries = this.entries.filter((entry) => now - lastObserved(entry) <= this.windowMs);
  }

  private findDuplicate(
    kind: WorkingMemoryKind,
    text: string,
    now: number,
    personId?: number,
  ): WorkingMemoryEntry | undefined {
    // A question or answer is always its own event, even when asked twice
    if (kind === "question" || kind === "answer") return undefined;
    if (kind === "person") {
      return [...this.entries].reverse().find((entry) =>
        entry.kind === "person" &&
        entry.personId === personId &&
        (personId !== undefined || entry.text === text) &&
        now - lastObserved(entry) <= PERSON_GAP_MS);
    }
    // Only the latest entry of this kind: going back to an earlier scene is news again
    const latest = [...this.entries].reverse().find((entry) => entry.kind === kind);
    if (!latest) return undefined;
    return latest.text === text || isRephrasing(text, latest.text) ? latest : undefined;
  }
}

/** Shape of a vision result this needs (structural, so it doesn't depend on the service). */
export interface ObservedFrame {
  description: string;
  text_content: string;
  hazards: string[];
  priority: number;
}

/** Record what one analysed frame showed: the scene, any text read, and any hazard. */
export function recordFrame(memory: WorkingMemory, frame: ObservedFrame, now: number): void {
  memory.record("scene", frame.description, now);
  if (frame.text_content.trim()) memory.record("text", frame.text_content, now);
  if (frame.priority > 7 || frame.hazards.length) {
    memory.record("hazard", frame.hazards.length ? frame.hazards.join(", ") : frame.description, now);
  }
}

/** Record a face: a known person by name and relation, or an unknown one. */
export function recordFace(
  memory: WorkingMemory,
  face: { known: boolean; id?: number; name?: string; relation?: string },
  now: number,
): void {
  if (face.known && face.id !== undefined && face.name) {
    memory.record("person", `${face.name}${face.relation ? ` (${face.relation})` : ""} appeared`, now, face.id);
  } else if (!face.known) {
    memory.record("person", "an unknown person appeared", now);
  }
}

const quote = (text: string, limit: number) => `'${memoryExcerpt(text, limit)}'`;

/** A question and its spoken answer as one event; a failed question is recorded on its own. */
export function recordQuestion(memory: WorkingMemory, question: string, answer: string | null, now: number): void {
  if (answer === null) memory.record("question", `you asked ${quote(question, 80)} (no answer)`, now);
  else memory.record("answer", `you asked ${quote(question, 80)} → ${quote(answer, 120)}`, now);
}
