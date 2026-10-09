import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  Camera,
  Check,
  ChevronRight,
  CircleHelp,
  Download,
  Fingerprint,
  Flower2,
  Heart,
  Loader2,
  MessageCircle,
  Pencil,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  Volume2,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMemoryLibrary } from "@/hooks/useMemoryLibrary";
import { MemoryEditor, PersonEditor } from "@/components/MemoryEditors";
import {
  memoryExcerpt,
  searchMemories,
  type ConversationMemory,
} from "@/lib/memory";
import { memoryRepository } from "@/lib/memoryRepository";
import "@/memory.css";

const dateLabel = (date: Date) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
const sourceLabel = (source: ConversationMemory["source"]) =>
  source === "sample"
    ? "Sample note"
    : source === "dictation"
      ? "Reviewed dictation"
      : "Written note";

export default function MemoryWorkspace() {
  const { people, memories, loading, error: storageError } = useMemoryLibrary();
  const [params, setParams] = useSearchParams();
  const [personQuery, setPersonQuery] = useState("");
  const [query, setQuery] = useState("");
  const [personEditor, setPersonEditor] = useState(false);
  const [noteEditor, setNoteEditor] = useState<
    ConversationMemory | "new" | null
  >(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    kind: "person" | "memory";
    id: number;
    name: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [reading, setReading] = useState(false);
  const noteSearchRef = useRef<HTMLInputElement>(null);
  const selected =
    people.find((person) => person.id === Number(params.get("person"))) ??
    people[0];
  const selectedId = selected?.id;
  const timeline = useMemo(
    () => searchMemories(memories, selectedId ?? -1, ""),
    [memories, selectedId],
  );
  const hits = useMemo(
    () => searchMemories(memories, selectedId ?? -1, query),
    [memories, selectedId, query],
  );
  const reminder = query.trim() ? hits[0]?.memory : timeline[0]?.memory;
  const filteredPeople = people.filter((person) =>
    `${person.name} ${person.relation}`
      .toLowerCase()
      .includes(personQuery.toLowerCase()),
  );
  const hasSamples = people.some((person) => person.isSample);

  useEffect(() => {
    window.speechSynthesis?.cancel();
    setReading(false);
    setQuery("");
    setNoteEditor(null);
  }, [selectedId]);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const select = (id: number) =>
    setParams({ person: String(id) }, { replace: true });
  const runAction = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      await action();
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  const loadSamples = () =>
    runAction(async () => {
      select(await memoryRepository.seedSampleStory());
      setPersonQuery("");
      setNotice(
        "Sample story opened. These people and conversations are fictional.",
      );
    });
  const readReminder = () => {
    if (reading) {
      window.speechSynthesis?.cancel();
      setReading(false);
      return;
    }
    if (!window.speechSynthesis || !reminder || !selected) {
      setActionError("Read-aloud is unavailable in this browser.");
      return;
    }
    const speech = new SpeechSynthesisUtterance(
      `${selected.name}, ${selected.relation}. From your saved note on ${dateLabel(reminder.occurredAt)}. ${memoryExcerpt(reminder.body)}`,
    );
    speech.lang = "en-IN";
    speech.rate = 0.92;
    speech.onend = () => setReading(false);
    speech.onerror = (event) => {
      setReading(false);
      // cancel() (Stop, switching person, a new read) reports "interrupted"/"canceled" in
      // Chrome. That is the user's own action, not a failure worth an alert.
      if (event.error === "interrupted" || event.error === "canceled") return;
      setActionError(
        "Read-aloud could not finish. Your note is still available below.",
      );
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(speech);
    setReading(true);
  };
  const exportNotes = () => {
    // Deliberately omit biometric descriptors from a portable conversation export.
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      people: people.map(({ id, name, relation, isSample }) => ({
        id,
        name,
        relation,
        isSample: !!isSample,
      })),
      memories,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "neuronarrator-memories.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(
      "Notes exported. Face data is excluded. Keep this file somewhere private.",
    );
  };

  return (
    <div className="memory-app">
      <a className="memory-skip" href="#memory-main">
        Skip to memories
      </a>
      <aside className="memory-sidebar">
        <Link className="memory-brand" to="/" aria-label="NeuroNarrator home">
          <span className="brand-mark">
            <Flower2 size={25} />
          </span>
          <span>
            neuro<span className="brand-light">narrator</span>
            <small>A little help remembering.</small>
          </span>
        </Link>
        <div className="sidebar-label">YOUR COMPANION</div>
        <nav aria-label="Main navigation">
          <Link to="/" className="sidebar-link active" aria-current="page">
            <BookOpen size={18} />
            Memory space
            <span className="nav-dot" />
          </Link>
          <Link to="/vision" className="sidebar-link">
            <Camera size={18} />
            Live vision
            <ArrowRight size={15} />
          </Link>
          <button className="sidebar-link" onClick={() => setInfoOpen(true)}>
            <CircleHelp size={18} />
            How it works
          </button>
        </nav>
        <div className="sidebar-story">
          <div className="story-illustration" aria-hidden="true">
            <div className="story-orbit" />
            <Heart size={24} />
            <span className="story-spark">✦</span>
          </div>
          <h3>More than a name.</h3>
          <p>The little details help us feel connected.</p>
          <button
            onClick={loadSamples}
            disabled={busy || loading || !!storageError}
          >
            Explore a sample story <ArrowRight size={15} />
          </button>
        </div>
        <div className="sidebar-bottom">
          <ShieldCheck size={20} />
          <div>
            <strong>Your notes, on your device</strong>
            <span>No account needed.</span>
          </div>
        </div>
      </aside>

      <div className="memory-shell">
        <header className="memory-topbar">
          <div>
            <span className="workspace-dot" />
            Personal workspace
            <ChevronRight size={14} />
            <strong>Memory space</strong>
          </div>
          <div className="topbar-right">
            <span className="local-pill">
              <span />
              Local storage
            </span>
            <span className="workspace-avatar" aria-label="Personal workspace">
              <Flower2 size={19} />
            </span>
          </div>
        </header>
        <main id="memory-main" className="memory-main">
          <section className="memory-hero">
            <div>
              <div className="eyebrow">
                <span />
                FAMILIAR PEOPLE. MEANINGFUL MOMENTS.
              </div>
              <h1>
                A little context.
                <br />
                <em>A closer connection.</em>
              </h1>
              <p>
                Remember the people in your world—and pick up
                <br className="desktop-break" /> right where you left off.
              </p>
            </div>
            <div className="hero-actions">
              <button
                className="memory-button secondary"
                onClick={loadSamples}
                disabled={busy || loading || !!storageError}
              >
                {busy ? (
                  <Loader2 size={15} className="spin" />
                ) : (
                  <Play size={14} />
                )}
                Try sample story
              </button>
              <button
                className="memory-button primary"
                onClick={() => setPersonEditor(true)}
                disabled={loading || !!storageError}
              >
                <Plus size={17} />
                Add person
              </button>
            </div>
          </section>

          {(storageError || actionError) && (
            <div className="memory-alert error" role="alert">
              {storageError || actionError}
              <button
                aria-label="Dismiss error"
                onClick={() => setActionError("")}
                disabled={!!storageError}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="memory-alert" role="status">
              <Check size={16} />
              {notice}
              <button
                aria-label="Dismiss message"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}

          <div className="memory-stats">
            <div>
              <span className="stat-icon sage">
                <Users size={19} />
              </span>
              <strong>{people.length.toString().padStart(2, "0")}</strong>
              <span>Familiar people</span>
            </div>
            <div>
              <span className="stat-icon peach">
                <MessageCircle size={19} />
              </span>
              <strong>{memories.length.toString().padStart(2, "0")}</strong>
              <span>Saved moments</span>
            </div>
            <div>
              <span className="stat-icon lilac">
                <ShieldCheck size={19} />
              </span>
              <div className="stat-text">
                <strong>Made to stay with you</strong>
                <span>Notes saved in this browser</span>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="workspace-loading" role="status">
              <Loader2 className="spin" />
              Opening your memory space…
            </div>
          ) : (
            <div className="memory-grid">
              <section className="people-panel" aria-labelledby="people-title">
                <div className="panel-heading">
                  <h2 id="people-title">
                    Your people <span>{people.length}</span>
                  </h2>
                  <button
                    className="icon-button"
                    onClick={() => setPersonEditor(true)}
                    disabled={!!storageError}
                    aria-label="Add a person"
                  >
                    <Plus size={19} />
                  </button>
                </div>
                <label className="people-search">
                  <Search size={16} />
                  <input
                    aria-label="Find a person"
                    placeholder="Find a familiar person…"
                    value={personQuery}
                    onChange={(event) => setPersonQuery(event.target.value)}
                  />
                </label>
                <div className="people-list">
                  {filteredPeople.map((person, index) => {
                    const count = memories.filter(
                      (memory) => memory.personId === person.id,
                    ).length;
                    return (
                      <button
                        key={person.id}
                        onClick={() => select(person.id!)}
                        className={`person-item ${selectedId === person.id ? "selected" : ""}`}
                        aria-pressed={selectedId === person.id}
                      >
                        <span className={`person-avatar avatar-${index % 4}`}>
                          {initials(person.name)}
                        </span>
                        <span className="person-meta">
                          <strong>{person.name}</strong>
                          <span>
                            {person.relation} <i>·</i> {count}{" "}
                            {count === 1 ? "memory" : "memories"}
                          </span>
                        </span>
                        <ChevronRight size={15} />
                      </button>
                    );
                  })}
                  {!filteredPeople.length && (
                    <div className="people-empty">
                      {personQuery
                        ? "No people match that search."
                        : "Your familiar people will appear here."}
                    </div>
                  )}
                </div>
                <div className="people-tip">
                  <Heart size={16} />
                  <p>
                    A familiar name is a start.
                    <br />A shared memory is a connection.
                  </p>
                </div>
              </section>

              <section
                className="person-workspace"
                aria-label="Selected person's memories"
              >
                {selected ? (
                  <>
                    <div className="profile-heading">
                      <span className="profile-avatar">
                        {initials(selected.name)}
                        <span>
                          <Heart size={11} fill="currentColor" />
                        </span>
                      </span>
                      <div>
                        <div className="profile-name">
                          <h2>{selected.name}</h2>
                          {selected.isSample && (
                            <span className="sample-badge">Sample person</span>
                          )}
                        </div>
                        <p>
                          {selected.relation}
                          <span>·</span>
                          {timeline.length} saved{" "}
                          {timeline.length === 1 ? "memory" : "memories"}
                        </p>
                      </div>
                      <button
                        className="icon-button profile-delete"
                        aria-label={`Delete ${selected.name}`}
                        onClick={() =>
                          setDeleteTarget({
                            kind: "person",
                            id: selected.id!,
                            name: selected.name,
                          })
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="reminder-card">
                      <div className="reminder-label">
                        <Sparkles size={17} />
                        <span>
                          {query.trim()
                            ? "A MEMORY THAT MATCHES"
                            : "A LITTLE REMINDER"}
                        </span>
                        <span className="source-pill">From saved notes</span>
                      </div>
                      {reminder ? (
                        <>
                          <p className="reminder-text">
                            “{memoryExcerpt(reminder.body)}”
                          </p>
                          <div className="reminder-footer">
                            <button
                              onClick={() => {
                                const note = document.getElementById(
                                  `memory-${reminder.id}`,
                                );
                                note?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "center",
                                });
                                // Move keyboard and screen-reader focus too, not just the view.
                                note?.focus({ preventScroll: true });
                              }}
                            >
                              <span className="source-number">1</span>
                              {reminder.title}
                              <ArrowDown size={13} />
                            </button>
                            <button
                              onClick={readReminder}
                              className="read-button"
                              aria-label={
                                reading
                                  ? "Stop reading reminder"
                                  : "Read reminder aloud"
                              }
                            >
                              <Volume2 size={16} />
                              {reading ? "Stop" : "Read aloud"}
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="reminder-text empty-reminder">
                            {query.trim()
                              ? "No saved note matches those words yet."
                              : "Every connection starts with a moment worth keeping."}
                          </p>
                          <p className="reminder-empty-hint">
                            {query.trim()
                              ? "Try a name, place, or topic from the conversation."
                              : "Add your first conversation to see a reminder here."}
                          </p>
                        </>
                      )}
                    </div>

                    <div className="timeline-heading">
                      <div>
                        <h2>Conversation timeline</h2>
                        <p>Little moments, kept in one place.</p>
                      </div>
                      <button
                        className="memory-button secondary small"
                        onClick={() => setNoteEditor("new")}
                      >
                        <Plus size={16} />
                        Add memory
                      </button>
                    </div>
                    <label className="memory-search">
                      <Search size={17} />
                      <input
                        ref={noteSearchRef}
                        aria-label={`Search memories with ${selected.name}`}
                        placeholder="Find a moment… try “weekend” or “coffee”"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                      />
                      {query && (
                        <button
                          onClick={() => {
                            setQuery("");
                            noteSearchRef.current?.focus();
                          }}
                          aria-label="Clear memory search"
                        >
                          <X size={15} />
                        </button>
                      )}
                      <span>Search notes</span>
                    </label>
                    <div className="search-summary" role="status">
                      {query.trim()
                        ? `${hits.length} matching ${hits.length === 1 ? "memory" : "memories"} for ${selected.name} · ranked by matching words`
                        : "MOST RECENT FIRST"}
                    </div>
                    <div className="memory-timeline">
                      {hits.map(({ memory, matchedTerms }) => (
                        <article
                          id={`memory-${memory.id}`}
                          key={memory.id}
                          tabIndex={-1}
                          className="timeline-item"
                        >
                          <span className="timeline-marker">
                            <MessageCircle size={14} />
                          </span>
                          <div className="timeline-content">
                            <div className="timeline-date">
                              <span>{dateLabel(memory.occurredAt)}</span>
                              <span
                                className={`note-source ${memory.source === "sample" ? "sample" : ""}`}
                              >
                                {sourceLabel(memory.source)}
                              </span>
                            </div>
                            <h3>{memory.title}</h3>
                            <p>{memory.body}</p>
                            {matchedTerms.length > 0 && (
                              <div className="match-terms">
                                Matched: {matchedTerms.join(", ")}
                              </div>
                            )}
                            <div className="note-actions">
                              <button onClick={() => setNoteEditor(memory)}>
                                <Pencil size={13} />
                                Edit
                              </button>
                              <button
                                onClick={() =>
                                  setDeleteTarget({
                                    kind: "memory",
                                    id: memory.id!,
                                    name: memory.title,
                                  })
                                }
                              >
                                <Trash2 size={13} />
                                Delete
                              </button>
                            </div>
                          </div>
                        </article>
                      ))}
                      {!hits.length && (
                        <div className="timeline-empty">
                          <MessageCircle size={25} />
                          <h3>
                            {query.trim()
                              ? "Nothing saved on that topic."
                              : "Your next conversation starts here."}
                          </h3>
                          <p>
                            {query.trim()
                              ? "Try a different keyword. We only show what is actually in your notes."
                              : "Write a note or dictate a moment you want to remember."}
                          </p>
                          {!query.trim() && (
                            <button
                              className="memory-button secondary"
                              onClick={() => setNoteEditor("new")}
                            >
                              <Plus size={15} />
                              Add a first memory
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="first-memory">
                    <span className="empty-flower">
                      <Flower2 size={45} />
                    </span>
                    <div className="eyebrow">A PLACE FOR YOUR CONNECTIONS</div>
                    <h2>
                      Some moments are
                      <br />
                      worth remembering.
                    </h2>
                    <p>
                      Add a person and a conversation, or explore a fictional
                      story to see how it feels.
                    </p>
                    <button
                      className="memory-button primary"
                      onClick={loadSamples}
                      disabled={busy || !!storageError}
                    >
                      <Play size={15} />
                      Explore the sample story
                    </button>
                    <button
                      className="text-button"
                      onClick={() => setPersonEditor(true)}
                      disabled={!!storageError}
                    >
                      Or add someone you know <ArrowRight size={14} />
                    </button>
                    <span className="empty-note">
                      <ShieldCheck size={14} />
                      No camera or microphone needed
                    </span>
                  </div>
                )}
              </section>

              <aside className="context-panel">
                <div className="context-card">
                  <span className="context-icon">
                    <Fingerprint size={23} />
                  </span>
                  <div className="eyebrow">FROM FACES TO FAMILIARITY</div>
                  <h3>
                    A face.
                    <br />A name.
                    <br />
                    <em>A shared story.</em>
                  </h3>
                  <p>
                    Connect a face to a person and bring their recent memories
                    into view.
                  </p>
                  <Link
                    className="memory-button secondary"
                    to={
                      selected && !selected.isSample
                        ? `/vision?person=${selected.id}`
                        : "/vision"
                    }
                  >
                    <Camera size={16} />
                    Open live vision
                    <ArrowRight size={14} />
                  </Link>
                  <span className="context-footnote">
                    Camera frames go to the vision service. Saved notes stay
                    here.
                  </span>
                </div>
                <div className="steps-card">
                  <h3>Make room for the little things.</h3>
                  <div>
                    <span>01</span>
                    <p>
                      <strong>Keep a moment</strong>Type or dictate a
                      conversation.
                    </p>
                  </div>
                  <div>
                    <span>02</span>
                    <p>
                      <strong>Find the connection</strong>Search one person’s
                      saved notes.
                    </p>
                  </div>
                  <div>
                    <span>03</span>
                    <p>
                      <strong>Pick up where you left off</strong>Read a reminder
                      with its source.
                    </p>
                  </div>
                </div>
                <button
                  className="export-button"
                  onClick={exportNotes}
                  disabled={!people.length}
                >
                  <Download size={15} />
                  Export people & notes
                  <ArrowRight size={14} />
                </button>
                {hasSamples && (
                  <button
                    className="remove-samples"
                    disabled={busy}
                    onClick={() =>
                      runAction(async () => {
                        await memoryRepository.removeSamples();
                        setNotice(
                          "Sample notes removed. Your own notes were kept.",
                        );
                      })
                    }
                  >
                    Remove sample story
                  </button>
                )}
              </aside>
            </div>
          )}
          <footer className="memory-footer">
            <span>
              <Flower2 size={15} />
              Built around human connection.
            </span>
            <span>
              Assistive prototype <i>·</i> Notes are not a medical record
            </span>
          </footer>
        </main>
      </div>

      {personEditor && (
        <PersonEditor
          onClose={() => setPersonEditor(false)}
          onSaved={(id) => {
            select(id);
            setPersonQuery("");
          }}
        />
      )}
      {noteEditor && selected && (
        <MemoryEditor
          person={selected}
          memory={noteEditor === "new" ? undefined : noteEditor}
          onClose={() => setNoteEditor(null)}
        />
      )}
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="memory-dialog">
          <DialogHeader>
            <DialogTitle>A little context, with a clear source.</DialogTitle>
            <DialogDescription>Your memory space, explained.</DialogDescription>
          </DialogHeader>
          <div className="about-memory">
            <p>
              <strong>Save what matters.</strong> Add a person and write a dated
              note. Dictation is optional, and you review the text before
              saving.
            </p>
            <p>
              <strong>Recall what was said.</strong> Search matches words in
              that person’s notes. Reminders are excerpts, not AI-generated
              personal facts. A source always links to the original note.
            </p>
            <p>
              <strong>Recognize with care.</strong> Live vision can match a
              saved face locally and show recent notes. A face match can be
              wrong; confirm the person’s identity.
            </p>
            <p>
              <strong>Know where data goes.</strong> People, face descriptors,
              and notes are stored in this browser. Camera frames are sent to
              the configured vision service. Dictation and read-aloud may use
              your browser’s speech provider.
            </p>
            <p>
              Clearing site data removes this library. Export notes for a
              portable copy; exports exclude face descriptors. This is an
              assistive prototype, not a medical device or a safety system.
            </p>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && !busy && setDeleteTarget(null)}
      >
        <DialogContent className="memory-dialog">
          <DialogHeader>
            <DialogTitle>
              Delete{" "}
              {deleteTarget?.kind === "person" ? "this person" : "this memory"}?
            </DialogTitle>
            <DialogDescription>
              {deleteTarget?.name}
              {deleteTarget?.kind === "person"
                ? " and all their saved notes and face data will be removed from this browser."
                : " will be removed from this browser."}{" "}
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {actionError && (
            <p role="alert" className="form-error">
              {actionError}
            </p>
          )}
          <div className="dialog-actions">
            <button
              className="memory-button secondary"
              disabled={busy}
              onClick={() => setDeleteTarget(null)}
            >
              Keep it
            </button>
            <button
              className="memory-button danger"
              disabled={busy}
              onClick={() =>
                runAction(async () => {
                  if (!deleteTarget) return;
                  if (deleteTarget.kind === "person")
                    await memoryRepository.deletePerson(deleteTarget.id);
                  else await memoryRepository.deleteMemory(deleteTarget.id);
                  window.speechSynthesis?.cancel();
                  setReading(false);
                  setDeleteTarget(null);
                  setNotice("Removed from your memory space.");
                })
              }
            >
              {busy ? "Deleting…" : "Delete"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
