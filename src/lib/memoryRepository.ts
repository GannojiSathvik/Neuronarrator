import Dexie from "dexie";
import {
  db,
  faceDB,
  RELATION_OPTIONS,
  type RelationType,
} from "./faceDatabase";
import { validateMemory, type ConversationMemory } from "./memory";

export const memoryRepository = {
  async addPerson(name: string, relation: RelationType): Promise<number> {
    if (!name.trim() || name.trim().length > 80)
      throw new Error("Use a name between 1 and 80 characters.");
    if (!RELATION_OPTIONS.includes(relation))
      throw new Error("Choose a relationship.");
    const now = new Date();
    return db.faces.add({
      name: name.trim(),
      relation,
      createdAt: now,
      lastSeen: now,
    });
  },

  async saveMemory(
    input: Omit<ConversationMemory, "id" | "createdAt">,
    id?: number,
  ): Promise<number> {
    validateMemory(input);
    if (!["note", "dictation", "sample"].includes(input.source))
      throw new Error("Invalid note source.");
    return db.transaction("rw", db.faces, db.memories, async () => {
      if (!(await db.faces.get(input.personId)))
        throw new Error("This person was removed. Choose another person.");
      const clean = {
        ...input,
        title: input.title.trim(),
        body: input.body.trim(),
      };
      if (id !== undefined) {
        const existing = await db.memories.get(id);
        if (!existing || existing.personId !== input.personId)
          throw new Error("This memory is no longer available.");
        await db.memories.update(id, clean);
        return id;
      }
      return db.memories.add({ ...clean, createdAt: new Date() });
    });
  },

  deleteMemory: (id: number) => db.memories.delete(id),

  /** One person's most recent note, read from the [personId+occurredAt] index (not the library). */
  latestMemory: (personId: number): Promise<ConversationMemory | undefined> =>
    db.memories
      .where("[personId+occurredAt]")
      .between([personId, Dexie.minKey], [personId, Dexie.maxKey])
      .last(),
  deletePerson: faceDB.deleteFace,

  async seedSampleStory(): Promise<number> {
    return db.transaction("rw", db.faces, db.memories, async () => {
      const existing = (await db.faces.toArray()).find(
        (person) => person.isSample,
      );
      if (existing?.id) return existing.id;
      const now = new Date();
      const ago = (days: number) => new Date(now.getTime() - days * 86_400_000);
      const arjun = await db.faces.add({
        name: "Arjun Mehta",
        relation: "Friend",
        isSample: true,
        createdAt: ago(14),
        lastSeen: ago(2),
      });
      const meera = await db.faces.add({
        name: "Meera Rao",
        relation: "Family",
        isSample: true,
        createdAt: ago(14),
        lastSeen: ago(1),
      });
      const priya = await db.faces.add({
        name: "Priya Shah",
        relation: "Colleague",
        isSample: true,
        createdAt: ago(14),
        lastSeen: ago(4),
      });
      await db.memories.bulkAdd([
        {
          personId: arjun,
          title: "Coffee and weekend plans",
          body: "Arjun and I met for coffee at the café near the park. He is training for a half marathon. We planned a walk at the lakeside on Saturday morning and agreed to bring coffee.",
          occurredAt: ago(2),
          createdAt: now,
          source: "sample",
        },
        {
          personId: arjun,
          title: "The book he recommended",
          body: "Arjun recommended The Alchemist during our afternoon catch-up. He offered to bring his copy the next time we meet. I told him I would like to read it over the weekend.",
          occurredAt: ago(6),
          createdAt: now,
          source: "sample",
        },
        {
          personId: arjun,
          title: "A new running routine",
          body: "Arjun started running in the park before work. He said shorter, regular runs helped him build a routine. We talked about joining him for a walk sometime.",
          occurredAt: ago(10),
          createdAt: now,
          source: "sample",
        },
        {
          personId: meera,
          title: "Sunday family lunch",
          body: "Meera is coming over for lunch on Sunday. We decided to make vegetable pulao together. She will bring the ingredients and our old family photo album.",
          occurredAt: ago(1),
          createdAt: now,
          source: "sample",
        },
        {
          personId: priya,
          title: "Preparing our project demo",
          body: "Priya and I reviewed the project demo. We agreed to start with the user problem, show one complete journey, and then explain the architecture. She will help rehearse the presentation.",
          occurredAt: ago(4),
          createdAt: now,
          source: "sample",
        },
      ]);
      return arjun;
    });
  },

  async removeSamples(): Promise<void> {
    await db.transaction("rw", db.faces, db.memories, async () => {
      const people = (await db.faces.toArray()).filter(
        (person) => person.isSample,
      );
      for (const person of people) {
        // Preserve user-written notes on sample profiles. Only delete the seeded notes.
        await db.memories
          .where("personId")
          .equals(person.id!)
          .filter((memory) => memory.source === "sample")
          .delete();
        if (
          !(await db.memories.where("personId").equals(person.id!).count()) &&
          !person.descriptor
        ) {
          await db.faces.delete(person.id!);
        } else {
          await db.faces.update(person.id!, { isSample: false });
        }
      }
    });
  },
};
