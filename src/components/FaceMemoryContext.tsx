import { Link } from "react-router-dom";
import { BookOpen, ArrowRight } from "lucide-react";
import { useMemoryLibrary } from "@/hooks/useMemoryLibrary";
import { memoryExcerpt } from "@/lib/memory";

export function FaceMemoryContext({ personId }: { personId: number }) {
  const { memories, loading, error } = useMemoryLibrary();
  const recent = memories
    .filter((memory) => memory.personId === personId)
    .slice(0, 2);
  return (
    <div className="mt-3 border-t border-white/15 pt-3">
      <p className="text-xs font-medium text-white/90 flex items-center gap-2">
        <BookOpen size={14} />
        From your saved conversations
      </p>
      {loading ? (
        <p className="text-xs text-white/70 mt-2">Loading saved notes…</p>
      ) : error ? (
        <p className="text-xs text-white/70 mt-2">
          Saved notes are unavailable.
        </p>
      ) : recent.length ? (
        recent.map((memory) => (
          <div key={memory.id} className="mt-2">
            <p className="text-sm text-white/90">
              {memoryExcerpt(memory.body, 150)}
            </p>
            <p className="text-xs text-white/60 mt-1">
              Source: {memory.title} ·{" "}
              {memory.occurredAt.toLocaleDateString("en-IN")}
            </p>
          </div>
        ))
      ) : (
        <p className="text-sm text-white/70 mt-2">
          No conversations saved yet.
        </p>
      )}
      <Link
        to={`/?person=${personId}`}
        className="inline-flex gap-2 items-center text-xs text-green-200 mt-3"
      >
        Open memories & add a note <ArrowRight size={13} />
      </Link>
    </div>
  );
}
