// Deciding who is who when several faces are in view at once.
// Each face's descriptor (128 numbers from the recognition network) is compared with every saved
// person's descriptor. Matching each face on its own could call two faces "Ronit" if both look a
// bit like him, but one person can only be in one place. So the pairs are assigned one-to-one:
// the closest face/person pair overall is locked in first, both leave the pool, then the next
// closest, and so on. Whoever is left over (or only matches above the threshold) is unknown.

/** Below this Euclidean distance two descriptors are the same person (relaxed for phone cameras). */
export const MATCH_THRESHOLD = 0.55;

export function euclideanDistance(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export interface IdentityAssignment {
  /** Index into the saved people, or null for an unknown face. */
  person: number | null;
  /** Distance to the assigned person, or to the nearest one for an unknown face (for logs). */
  distance: number;
}

/**
 * Assign each face to at most one saved person and each person to at most one face, closest
 * pairs first. Greedy on sorted distances: with a handful of faces this gives the same answer
 * as an optimal assignment in practice, and it is easy to reason about.
 */
export function assignIdentities(
  faces: ArrayLike<number>[],
  people: ArrayLike<number>[],
  threshold = MATCH_THRESHOLD,
): IdentityAssignment[] {
  const distances = faces.map((face) => people.map((person) => euclideanDistance(face, person)));
  const pairs: { face: number; person: number; distance: number }[] = [];
  distances.forEach((row, face) =>
    row.forEach((distance, person) => {
      if (distance < threshold) pairs.push({ face, person, distance });
    }),
  );
  pairs.sort((a, b) => a.distance - b.distance);

  const result: IdentityAssignment[] = distances.map((row) => ({ person: null, distance: Math.min(Infinity, ...row) }));
  const takenPeople = new Set<number>();
  for (const pair of pairs) {
    if (result[pair.face].person !== null || takenPeople.has(pair.person)) continue;
    result[pair.face] = { person: pair.person, distance: pair.distance };
    takenPeople.add(pair.person);
  }
  return result;
}
