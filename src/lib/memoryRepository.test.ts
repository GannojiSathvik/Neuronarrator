import "fake-indexeddb/auto";
import Dexie from "dexie";
import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { db, faceDB } from "./faceDatabase";
import { memoryRepository as repository } from "./memoryRepository";

const input = (personId: number, title = "Coffee together") => ({
  personId,
  title,
  body: "We talked about the weekend.",
  occurredAt: new Date("2020-01-01"),
  source: "note" as const,
});
beforeEach(async () => {
  await db.delete();
  await db.open();
});
afterAll(async () => {
  await db.delete();
});

describe("local memory persistence", () => {
  it("upgrades a legacy v2 face library without changing its IDs or descriptors", async () => {
    await db.delete();
    const legacy = new Dexie("NeuroMemory");
    legacy
      .version(2)
      .stores({ faces: "++id, name, relation, lastSeen, descriptor" });
    const descriptor = new Float32Array(128).fill(0.1);
    await legacy
      .table("faces")
      .add({
        id: 7,
        name: "Existing friend",
        relation: "Friend",
        descriptor,
        createdAt: new Date("2020-01-01"),
        lastSeen: new Date("2020-01-01"),
      });
    legacy.close();
    await db.open();
    const person = await db.faces.get(7);
    expect(person?.name).toBe("Existing friend");
    expect(Array.from(person!.descriptor!)).toEqual(Array.from(descriptor));
    await repository.saveMemory(input(7));
    expect(await db.memories.where("personId").equals(7).count()).toBe(1);
  });

  it("persists an edited memory across a database reopen", async () => {
    const person = await repository.addPerson("Arjun", "Friend");
    const id = await repository.saveMemory(input(person));
    await repository.saveMemory(
      { ...input(person), body: "The walk is on Sunday." },
      id,
    );
    db.close();
    await db.open();
    expect((await db.memories.get(id))?.body).toBe("The walk is on Sunday.");
    expect(await db.memories.count()).toBe(1);
  });

  it("rejects orphan notes and moving an existing note to another person", async () => {
    await expect(repository.saveMemory(input(99))).rejects.toThrow(
      "person was removed",
    );
    const first = await repository.addPerson("Arjun", "Friend");
    const second = await repository.addPerson("Meera", "Family");
    const id = await repository.saveMemory(input(first));
    await expect(repository.saveMemory(input(second), id)).rejects.toThrow(
      "no longer available",
    );
    expect((await db.memories.get(id))?.personId).toBe(first);
  });

  it("finds a person's most recent note by date, ignoring other people", async () => {
    const first = await repository.addPerson("Arjun", "Friend");
    const second = await repository.addPerson("Meera", "Family");
    expect(await repository.latestMemory(first)).toBeUndefined();
    await repository.saveMemory({ ...input(first, "Newest"), occurredAt: new Date("2021-06-01") });
    await repository.saveMemory({ ...input(first, "Oldest"), occurredAt: new Date("2019-01-01") });
    await repository.saveMemory({ ...input(second, "Other person"), occurredAt: new Date("2022-01-01") });
    expect((await repository.latestMemory(first))?.title).toBe("Newest");
  });

  it("deletes only the selected person and their notes", async () => {
    const first = await repository.addPerson("Arjun", "Friend");
    const second = await repository.addPerson("Meera", "Family");
    await repository.saveMemory(input(first));
    await repository.saveMemory(input(first, "Another memory"));
    await repository.saveMemory(input(second));
    await repository.deletePerson(first);
    expect(await db.faces.get(first)).toBeUndefined();
    expect(await db.memories.where("personId").equals(first).count()).toBe(0);
    expect(await db.memories.where("personId").equals(second).count()).toBe(1);
  });

  it("links a face to an existing profile and forgets faces without deleting notes", async () => {
    const person = await repository.addPerson("Arjun", "Friend");
    await repository.saveMemory(input(person));
    expect(await faceDB.enrollFace(person, new Float32Array(128))).toBe(person);
    expect(await db.faces.count()).toBe(1);
    await faceDB.clearAllFaces();
    expect((await db.faces.get(person))?.descriptor).toBeUndefined();
    expect(await db.memories.count()).toBe(1);
  });

  it("creates an idempotent fictional sample with no fake biometric records", async () => {
    const [first, second] = await Promise.all([
      repository.seedSampleStory(),
      repository.seedSampleStory(),
    ]);
    expect(first).toBe(second);
    expect(await db.faces.count()).toBe(3);
    expect(await db.memories.count()).toBe(5);
    expect(
      (await db.faces.toArray()).every(
        (person) => !person.descriptor && person.isSample,
      ),
    ).toBe(true);
    await expect(
      faceDB.enrollFace(first, new Float32Array(128)),
    ).rejects.toThrow("real person");
  });

  it("removes sample data while preserving user-written notes on a sample person", async () => {
    const person = await repository.seedSampleStory();
    await repository.saveMemory(input(person, "My own note"));
    await repository.removeSamples();
    expect(await db.faces.count()).toBe(1);
    expect((await db.faces.get(person))?.isSample).toBe(false);
    expect((await db.memories.toArray()).map((memory) => memory.title)).toEqual(
      ["My own note"],
    );
  });
});
