import Dexie, { type EntityTable } from "dexie";
import type { ConversationMemory } from "./memory";

// Relationship types for categorizing faces
export type RelationType =
  "Family" | "Friend" | "Doctor" | "Colleague" | "Stranger" | "Acquaintance";

export const RELATION_OPTIONS: RelationType[] = [
  "Family",
  "Friend",
  "Doctor",
  "Colleague",
  "Stranger",
  "Acquaintance",
];

// Face record interface with relationships and temporal data
export interface FaceRecord {
  id?: number;
  name: string;
  relation: RelationType;
  lastSeen: Date;
  descriptor?: Float32Array;
  createdAt: Date;
  isSample?: boolean;
}

// Database class extending Dexie
class NeuroMemoryDatabase extends Dexie {
  faces!: EntityTable<FaceRecord, "id">;
  memories!: EntityTable<ConversationMemory, "id">;

  constructor() {
    super("NeuroMemory");

    // Version 1: Original schema
    this.version(1).stores({
      faces: "++id, name, descriptor, createdAt",
    });

    // Version 2: Add relation and lastSeen fields
    this.version(2)
      .stores({
        faces: "++id, name, relation, lastSeen, descriptor",
      })
      .upgrade((tx) => {
        return tx
          .table("faces")
          .toCollection()
          .modify((face) => {
            if (!face.relation) {
              face.relation = "Acquaintance";
            }
            if (!face.lastSeen) {
              face.lastSeen = face.createdAt || new Date();
            }
          });
      });

    // Preserve existing face IDs: memories reference the same people, including legacy faces.
    // Descriptors are binary data, not lookup keys, so no descriptor index is needed.
    this.version(3).stores({
      faces: "++id, name, relation, lastSeen",
      memories: "++id, personId, occurredAt, [personId+occurredAt]",
    });
  }
}

// Singleton database instance
export const db = new NeuroMemoryDatabase();

// Helper functions for face operations
export const faceDB = {
  // Add a new face to the database with relationship
  async addFace(
    name: string,
    descriptor: Float32Array,
    relation: RelationType = "Acquaintance",
  ): Promise<number> {
    const now = new Date();
    // Store descriptor as plain array for reliable IndexedDB serialization
    return await db.faces.add({
      name,
      relation,
      descriptor: descriptor as Float32Array,
      lastSeen: now,
      createdAt: now,
    });
  },

  async enrollFace(
    personId: number,
    descriptor: Float32Array,
  ): Promise<number> {
    return db.transaction("rw", db.faces, async () => {
      const person = await db.faces.get(personId);
      if (!person || person.isSample)
        throw new Error("Choose a real person from your memory space.");
      if (descriptor.length !== 128 || !descriptor.every(Number.isFinite))
        throw new Error("Invalid face descriptor.");
      await db.faces.update(personId, { descriptor, lastSeen: new Date() });
      return personId;
    });
  },

  // Get all stored faces
  async getAllFaces(): Promise<FaceRecord[]> {
    return await db.faces.toArray();
  },

  // Delete a face by ID
  async deleteFace(id: number): Promise<void> {
    await db.transaction("rw", db.faces, db.memories, async () => {
      await db.memories.where("personId").equals(id).delete();
      await db.faces.delete(id);
    });
  },

  // Update a face name
  async updateFaceName(id: number, name: string): Promise<void> {
    await db.faces.update(id, { name });
  },

  // Update a face relation
  async updateFaceRelation(id: number, relation: RelationType): Promise<void> {
    await db.faces.update(id, { relation });
  },

  // Update lastSeen timestamp
  async updateLastSeen(id: number): Promise<void> {
    await db.faces.update(id, { lastSeen: new Date() });
  },

  // Update descriptor AND lastSeen — used for adaptive descriptor blending
  async updateFaceDescriptorAndLastSeen(
    id: number,
    descriptor: Float32Array,
  ): Promise<void> {
    await db.faces.update(id, {
      descriptor: descriptor as Float32Array,
      lastSeen: new Date(),
    });
  },

  // Clear all faces
  async clearAllFaces(): Promise<void> {
    // Forget biometric enrollment without silently deleting a person's conversation notes.
    await db.faces.toCollection().modify((face) => {
      delete face.descriptor;
    });
  },

  // Get face count
  async getFaceCount(): Promise<number> {
    return (await db.faces.toArray()).filter((face) => !!face.descriptor)
      .length;
  },
};
