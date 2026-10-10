import { useState, useCallback, useRef, useEffect } from 'react';
import * as faceapi from 'face-api.js';
import { faceDB, type FaceRecord, type RelationType } from '@/lib/faceDatabase';
import type { Rect } from '@/lib/facePlacement';
import { assignIdentities } from '@/lib/faceIdentity';
import { pickProminent } from '@/lib/faceTracks';

// Model CDN URL
const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';

// Primary detector: SSD MobileNet (good for frontal faces)
const SSD_OPTIONS = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.25 });

// Fallback detector: TinyFaceDetector (better for angled/side faces)
const TINY_OPTIONS = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.3 });

// The first inference of each network compiles its GPU shaders, which took 4-12 s in testing and
// landed on the user's first Describe. Run every network once on a blank frame while loading.
async function warmUpModels(): Promise<void> {
  const started = performance.now();
  try {
    const blank = document.createElement('canvas');
    blank.width = 160;
    blank.height = 160;
    await faceapi.detectSingleFace(blank, SSD_OPTIONS);
    await faceapi.detectSingleFace(blank, TINY_OPTIONS);
    // No face on a blank frame, so call the landmark and descriptor networks directly.
    await faceapi.detectFaceLandmarks(blank);
    await faceapi.computeFaceDescriptor(blank);
    console.log(`[Face] Models warmed up in ${Math.round(performance.now() - started)} ms`);
  } catch (error) {
    // Only a speed-up: recognition still works, just slower the first time.
    console.warn('[Face] Warm-up skipped:', error);
  }
}

// Min detection score to proceed with matching (reject garbage detections)
const MIN_DETECTION_SCORE = 0.35;

// Time thresholds for contextual announcements
const DAYS_THRESHOLD = 3;

export interface FaceContext {
  name: string;
  relation: RelationType;
  lastSeen: Date;
  daysSinceLastSeen: number;
  isLongAbsence: boolean;
}

export interface FaceMatch {
  name: string;
  known: boolean;
  descriptor?: Float32Array;
  distance?: number;
  id?: number;
  context?: FaceContext;
  /** Where the face is, in the video's own pixels (joins it to a tracked box for the HUD). */
  box?: Rect;
}

export interface UseFaceRecognitionReturn {
  isModelsLoaded: boolean;
  isLoadingModels: boolean;
  modelLoadError: string | null;
  /** The most prominent face from the last recognition (kept for single-face callers). */
  lastMatch: FaceMatch | null;
  /** Every face from the last recognition, most prominent first. */
  lastMatches: FaceMatch[];
  lastUnknownDescriptor: Float32Array | null;
  isProcessing: boolean;
  storedFacesCount: number;
  detectAndMatch: (videoElement: HTMLVideoElement) => Promise<FaceMatch | null>;
  detectAndMatchAll: (videoElement: HTMLVideoElement) => Promise<FaceMatch[] | null>;
  registerCurrentFace: (
    name: string,
    relation: RelationType,
    options?: { descriptor?: Float32Array | null; personId?: number },
  ) => Promise<boolean>;
  loadModels: () => Promise<void>;
  retryLoadModels: () => Promise<void>;
  refreshStoredFaces: () => Promise<void>;
  clearAllFaces: () => Promise<void>;
  generateSpeechText: (match: FaceMatch) => string;
}

/**
 * Safely reconstruct a Float32Array from whatever IndexedDB stored.
 * Dexie may give us a Float32Array, a plain object with numeric keys, or a regular array.
 */
function toFloat32Array(data: unknown): Float32Array | null {
  if (data instanceof Float32Array) return data;
  if (data instanceof ArrayBuffer) return new Float32Array(data);
  if (Array.isArray(data)) return new Float32Array(data);
  if (data && typeof data === 'object') {
    // Plain object with numeric keys from JSON round-trip
    const values = Object.keys(data)
      .sort((a, b) => Number(a) - Number(b))
      .map(k => Number((data as Record<string, unknown>)[k]));
    if (values.length === 128 && values.every(v => !isNaN(v))) {
      return new Float32Array(values);
    }
  }
  return null;
}

function daysBetween(date1: Date, date2: Date): number {
  const diffTime = Math.abs(date2.getTime() - date1.getTime());
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

function formatRelationForSpeech(relation: RelationType): string {
  switch (relation) {
    case 'Family': return 'your family member';
    case 'Friend': return 'your friend';
    case 'Doctor': return 'your doctor';
    case 'Colleague': return 'your colleague';
    case 'Stranger': return 'a stranger';
    case 'Acquaintance':
    default: return 'your acquaintance';
  }
}

export function useFaceRecognition(): UseFaceRecognitionReturn {
  const [isModelsLoaded, setIsModelsLoaded] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelLoadError, setModelLoadError] = useState<string | null>(null);
  const [lastMatch, setLastMatch] = useState<FaceMatch | null>(null);
  const [lastMatches, setLastMatches] = useState<FaceMatch[]>([]);
  const [lastUnknownDescriptor, setLastUnknownDescriptor] = useState<Float32Array | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [storedFacesCount, setStoredFacesCount] = useState(0);

  const storedFacesRef = useRef<FaceRecord[]>([]);
  const isProcessingRef = useRef(false);
  // Mirror of lastUnknownDescriptor so registerCurrentFace sees a descriptor set by a
  // detectAndMatch call that completed in the same tick (before React re-renders)
  const lastUnknownDescriptorRef = useRef<Float32Array | null>(null);

  const updateLastUnknownDescriptor = useCallback((descriptor: Float32Array | null) => {
    lastUnknownDescriptorRef.current = descriptor;
    setLastUnknownDescriptor(descriptor);
  }, []);

  const refreshStoredFaces = useCallback(async () => {
    try {
      const faces = await faceDB.getAllFaces();
      const enrolled = faces.filter(face => !!face.descriptor && !face.isSample);
      storedFacesRef.current = enrolled;
      setStoredFacesCount(enrolled.length);
    } catch (error) {
      console.error('[Face] Error loading stored faces:', error);
    }
  }, []);

  useEffect(() => {
    refreshStoredFaces();
  }, [refreshStoredFaces]);

  // Load models sequentially with retry
  const loadModels = useCallback(async () => {
    if (isModelsLoaded || isLoadingModels) return;

    setIsLoadingModels(true);
    setModelLoadError(null);

    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[Face] Loading models (attempt ${attempt}/${maxRetries})`);
        await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
        await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
        console.log('[Face] All models loaded (SSD + TinyFace + Landmarks + Recognition)');
        await warmUpModels();
        setIsModelsLoaded(true);
        setIsLoadingModels(false);
        setModelLoadError(null);
        await refreshStoredFaces();
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Failed to load models');
        console.error(`[Face] Model loading attempt ${attempt} failed:`, error);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    setModelLoadError(`${lastError?.message || 'Failed to load models'}. Check your internet connection.`);
    setIsLoadingModels(false);
  }, [isModelsLoaded, isLoadingModels, refreshStoredFaces]);

  const generateSpeechText = useCallback((match: FaceMatch): string => {
    if (!match.known) return 'An unknown person is present.';
    if (!match.context) return `${match.name} is here.`;

    const { name, relation, daysSinceLastSeen, isLongAbsence } = match.context;
    const relationText = formatRelationForSpeech(relation);

    if (isLongAbsence) {
      return `${name}, ${relationText}. You haven't seen them in ${daysSinceLastSeen} days.`;
    }
    return `${name}, ${relationText}, is here.`;
  }, []);

  // Main detection and matching pipeline: every face in view (up to MAX_FACES), each matched
  // one-to-one against the saved people. Returns null when it couldn't run (models not loaded,
  // a run already in progress, an error) and [] when there is simply nobody in view.
  const detectAndMatchAll = useCallback(async (videoElement: HTMLVideoElement): Promise<FaceMatch[] | null> => {
    if (!isModelsLoaded) {
      console.warn('[Face] Models not loaded yet');
      return null;
    }

    if (isProcessingRef.current) return null;
    isProcessingRef.current = true;
    setIsProcessing(true);

    try {
      // Try SSD MobileNet first (best for frontal faces)
      let detections = await faceapi
        .detectAllFaces(videoElement, SSD_OPTIONS)
        .withFaceLandmarks()
        .withFaceDescriptors();

      // If SSD found nothing, try TinyFaceDetector (better at side/angled faces)
      if (!detections || detections.length === 0) {
        console.log('[Face] SSD found nothing, trying TinyFaceDetector...');
        detections = await faceapi
          .detectAllFaces(videoElement, TINY_OPTIONS)
          .withFaceLandmarks()
          .withFaceDescriptors();
      }

      // Reject low-confidence detections (garbage boxes), then keep the most prominent few:
      // landmarks and descriptors already ran, but matching and the HUD stay bounded.
      const faces = pickProminent(
        (detections ?? [])
          .filter(d => d.detection.score >= MIN_DETECTION_SCORE)
          .map(d => {
            const { x, y, width, height } = d.detection.box;
            return { box: { x, y, width, height }, score: d.detection.score, descriptor: new Float32Array(d.descriptor) };
          }),
      );

      if (faces.length === 0) {
        console.log('[Face] No confident faces detected');
        setLastMatch(null);
        setLastMatches([]);
        // Forget the previous stranger so "remember X" can't save an old face under a new name
        updateLastUnknownDescriptor(null);
        return [];
      }

      // Saved people with a usable descriptor, in the same order as their descriptors
      const people: { record: FaceRecord; descriptor: Float32Array }[] = [];
      for (const record of storedFacesRef.current) {
        const descriptor = toFloat32Array(record.descriptor);
        if (descriptor) people.push({ record, descriptor });
        else console.warn(`[Face] Skipping face ${record.name} — invalid descriptor`);
      }

      const assignments = assignIdentities(faces.map(face => face.descriptor), people.map(person => person.descriptor));
      const now = new Date();
      const matches: FaceMatch[] = faces.map((face, index) => {
        const { person, distance } = assignments[index];
        if (person === null) {
          return { name: 'Unknown', known: false, descriptor: face.descriptor, distance: people.length ? distance : undefined, box: face.box };
        }
        const record = people[person].record;
        const lastSeen = record.lastSeen instanceof Date ? record.lastSeen : new Date(record.lastSeen);
        const daysSinceLastSeen = daysBetween(lastSeen, now);
        return {
          name: record.name,
          known: true,
          distance,
          id: record.id,
          box: face.box,
          context: {
            name: record.name,
            relation: record.relation || 'Acquaintance',
            lastSeen,
            daysSinceLastSeen,
            isLongAbsence: daysSinceLastSeen >= DAYS_THRESHOLD,
          },
        };
      });
      console.log(`[Face] ${matches.length} face(s): ${matches.map(m => `${m.name}${m.distance !== undefined ? ` (${m.distance.toFixed(3)})` : ''}`).join(', ')}`);

      // Never train on an unconfirmed prediction: a false positive would corrupt enrollment.
      // A failed timestamp write must not turn a successful match into "no face".
      const known = matches.filter(match => match.known && match.id !== undefined);
      await Promise.all(known.map(match =>
        faceDB.updateLastSeen(match.id as number).catch(err => console.error('[Face] Failed to update lastSeen:', err))
      ));

      // The most prominent face stays lastMatch for single-face callers; the most prominent
      // stranger is the one "neuro remember X" and the Add button save.
      setLastMatch(matches[0]);
      setLastMatches(matches);
      updateLastUnknownDescriptor(matches.find(match => !match.known)?.descriptor ?? null);

      // Refresh last-seen timestamps before the next cycle
      if (known.length > 0) refreshStoredFaces();

      return matches;
    } catch (error) {
      console.error('[Face] Detection error:', error);
      return null;
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
    }
  }, [isModelsLoaded, refreshStoredFaces, updateLastUnknownDescriptor]);

  // Single-face form: the most prominent face only, as before multi-face support.
  const detectAndMatch = useCallback(async (videoElement: HTMLVideoElement): Promise<FaceMatch | null> => {
    const matches = await detectAndMatchAll(videoElement);
    return matches?.[0] ?? null;
  }, [detectAndMatchAll]);

  // Register the current unknown face. A caller that already holds a fresh descriptor (e.g. the
  // "Neuro remember <name>" path straight after detectAndMatch) can pass it explicitly; otherwise
  // the ref mirror is used, which already reflects a detectAndMatch that finished this tick.
  // With personId, the face is enrolled onto that existing Memory-space person instead of
  // creating a new record.
  const registerCurrentFace = useCallback(async (
    name: string,
    relation: RelationType,
    options?: { descriptor?: Float32Array | null; personId?: number },
  ): Promise<boolean> => {
    const descriptor = options?.descriptor ?? lastUnknownDescriptorRef.current;
    const personId = options?.personId;
    if (!descriptor) {
      console.warn('[Face] No unknown face to register');
      return false;
    }

    try {
      // Store as a plain Array for reliable IndexedDB serialization
      const id = personId !== undefined
        ? await faceDB.enrollFace(personId, descriptor)
        : await faceDB.addFace(name.trim(), descriptor, relation);
      await refreshStoredFaces();
      updateLastUnknownDescriptor(null);

      const now = new Date();
      const registered: FaceMatch = {
        id,
        name: name.trim(),
        known: true,
        context: {
          name: name.trim(),
          relation,
          lastSeen: now,
          daysSinceLastSeen: 0,
          isLongAbsence: false
        }
      };
      setLastMatch(registered);
      // The saved stranger's tag turns into their name straight away, in the same place
      setLastMatches(matches => matches.map(match =>
        match.descriptor === descriptor ? { ...registered, box: match.box } : match
      ));

      console.log(`[Face] Registered: ${name} (${relation})`);
      return true;
    } catch (error) {
      console.error('[Face] Error registering face:', error);
      return false;
    }
  }, [refreshStoredFaces, updateLastUnknownDescriptor]);

  const clearAllFaces = useCallback(async () => {
    try {
      await faceDB.clearAllFaces();
      await refreshStoredFaces();
      setLastMatch(null);
      setLastMatches([]);
      updateLastUnknownDescriptor(null);
    } catch (error) {
      console.error('[Face] Error clearing faces:', error);
    }
  }, [refreshStoredFaces, updateLastUnknownDescriptor]);

  const retryLoadModels = useCallback(async () => {
    setModelLoadError(null);
    setIsLoadingModels(false);
    await new Promise(resolve => setTimeout(resolve, 100));
    await loadModels();
  }, [loadModels]);

  return {
    isModelsLoaded,
    isLoadingModels,
    modelLoadError,
    lastMatch,
    lastMatches,
    lastUnknownDescriptor,
    isProcessing,
    storedFacesCount,
    detectAndMatch,
    detectAndMatchAll,
    registerCurrentFace,
    loadModels,
    retryLoadModels,
    refreshStoredFaces,
    clearAllFaces,
    generateSpeechText
  };
}
