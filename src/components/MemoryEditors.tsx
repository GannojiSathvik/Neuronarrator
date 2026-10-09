import { useState, type FormEvent } from "react";
import { Mic, Square, Loader2, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  RELATION_OPTIONS,
  type FaceRecord,
  type RelationType,
} from "@/lib/faceDatabase";
import type { ConversationMemory } from "@/lib/memory";
import { memoryRepository } from "@/lib/memoryRepository";
import { useMemoryDictation } from "@/hooks/useMemoryDictation";

const localDateTime = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);

export function PersonEditor({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (id: number) => void;
}) {
  const [name, setName] = useState("");
  const [relation, setRelation] = useState<RelationType>("Friend");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      onSaved(await memoryRepository.addPerson(name, relation));
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save this person.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="memory-dialog">
        <DialogHeader>
          <DialogTitle>A familiar person</DialogTitle>
          <DialogDescription>
            Add someone whose conversations you want to remember.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="memory-form">
          <label htmlFor="person-name">
            Name
            <input
              id="person-name"
              autoFocus
              required
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Arjun Mehta"
            />
          </label>
          <label htmlFor="person-relation">
            Relationship
            <select
              id="person-relation"
              value={relation}
              onChange={(event) =>
                setRelation(event.target.value as RelationType)
              }
            >
              {RELATION_OPTIONS.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <p className="form-hint">
            A photo is not required. You can connect a face later in Live
            vision, with their permission.
          </p>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <button
              type="button"
              className="memory-button secondary"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              className="memory-button primary"
              disabled={busy || !name.trim()}
            >
              {busy ? <Loader2 className="spin" size={16} /> : null}Add person
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MemoryEditor({
  person,
  memory,
  onClose,
}: {
  person: FaceRecord;
  memory?: ConversationMemory;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(memory?.title ?? "");
  const [body, setBody] = useState(memory?.body ?? "");
  const [date, setDate] = useState(
    localDateTime(memory?.occurredAt ?? new Date()),
  );
  const [consent, setConsent] = useState(false);
  const [usedDictation, setUsedDictation] = useState(
    memory?.source === "dictation",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dictation = useMemoryDictation((text) => {
    setUsedDictation(true);
    setBody((previous) => `${previous}${previous ? " " : ""}${text}`);
  });
  const close = () => {
    if (!busy) {
      dictation.cancel();
      onClose();
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || dictation.listening) return;
    setBusy(true);
    try {
      await memoryRepository.saveMemory(
        {
          personId: person.id!,
          title,
          body,
          occurredAt: new Date(date),
          source: usedDictation ? "dictation" : "note",
        },
        memory?.id,
      );
      dictation.cancel();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save this memory.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="memory-dialog memory-editor-dialog">
        <DialogHeader>
          <DialogTitle>
            {memory ? "Edit this memory" : "Keep a little moment"}
          </DialogTitle>
          <DialogDescription>
            A conversation with {person.name}. Review your words before saving.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="memory-form">
          <label htmlFor="memory-title">
            A short title
            <input
              id="memory-title"
              required
              maxLength={100}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Coffee and weekend plans"
            />
          </label>
          <label htmlFor="memory-date">
            When did you talk?
            <input
              type="datetime-local"
              id="memory-date"
              required
              value={date}
              max={localDateTime(new Date())}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <label htmlFor="memory-body">
            What would you like to remember?
            <textarea
              id="memory-body"
              required
              rows={5}
              maxLength={6000}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="What you talked about, a shared plan, or something to ask next time…"
            />
          </label>
          <span className="character-count">
            {body.length.toLocaleString()} / 6,000
          </span>
          <div className="dictation-box">
            <div className="dictation-heading">
              <Mic size={17} />
              <strong>Prefer to say it?</strong>
              <span>Optional</span>
            </div>
            <p>
              Browser dictation may send audio to your browser’s speech
              provider. NeuroNarrator saves only the text you review, with no
              speaker identification.
            </p>
            {dictation.supported ? (
              <>
                <label className="consent-label">
                  <input
                    type="checkbox"
                    checked={consent}
                    disabled={dictation.listening}
                    onChange={(event) => setConsent(event.target.checked)}
                  />
                  Everyone involved agrees to transcription.
                </label>
                <button
                  type="button"
                  className="memory-button secondary"
                  disabled={!consent || busy}
                  onClick={
                    dictation.listening ? dictation.stop : dictation.start
                  }
                >
                  {dictation.listening ? (
                    <Square size={14} />
                  ) : (
                    <Mic size={15} />
                  )}
                  {dictation.listening ? "Stop dictation" : "Start dictation"}
                </button>
                <p role="status" className="dictation-status">
                  {dictation.listening
                    ? dictation.interim || "Listening… stops after one minute."
                    : dictation.error}
                </p>
              </>
            ) : (
              <p className="form-hint">
                Dictation is not supported in this browser. You can type your
                note above.
              </p>
            )}
          </div>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <span>
              <ShieldCheck size={14} />
              Saved on this device
            </span>
            <button
              type="button"
              className="memory-button secondary"
              onClick={close}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              className="memory-button primary"
              disabled={
                busy || dictation.listening || !title.trim() || !body.trim()
              }
            >
              {busy && <Loader2 className="spin" size={16} />}Save memory
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
