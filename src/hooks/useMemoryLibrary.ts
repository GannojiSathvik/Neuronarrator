import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import { db, type FaceRecord } from "@/lib/faceDatabase";
import type { ConversationMemory } from "@/lib/memory";

export function useMemoryLibrary() {
  const [people, setPeople] = useState<FaceRecord[]>([]);
  const [memories, setMemories] = useState<ConversationMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const subscription = liveQuery(() =>
      db.transaction("r", db.faces, db.memories, async () => ({
        people: await db.faces.orderBy("name").toArray(),
        memories: await db.memories.orderBy("occurredAt").reverse().toArray(),
      })),
    ).subscribe({
      next: (value) => {
        setPeople(value.people);
        setMemories(value.memories);
        setError("");
        setLoading(false);
      },
      error: () => {
        setError(
          "Local storage is unavailable. Allow site storage and reload to use your memory library.",
        );
        setLoading(false);
      },
    });
    return () => subscription.unsubscribe();
  }, []);
  return { people, memories, loading, error };
}
