import { useState, useCallback, useRef, useEffect } from 'react';
import * as faceapi from 'face-api.js';
import { faceDB, type FaceRecord, type RelationType } from '@/lib/faceDatabase';

// Model CDN URL
const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';

// Primary detector: SSD MobileNet (good for frontal faces)
const SSD_OPTIONS = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.25 });

// Fallback detector: TinyFaceDetector (better for angled/side faces)
const TINY_OPTIONS = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.3 });

// Min detection score to proceed with matching (reject garbage detections)
const MIN_DETECTION_SCORE = 0.35;

// Match threshold — slightly relaxed for mobile camera conditions
const MATCH_THRESHOLD = 0.55;

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
}

export interface UseFaceRecognitionReturn {
  isModelsLoaded: boolean;
  isLoadingModels: boolean;
  modelLoadError: string | null;
  lastMatch: FaceMatch | null;
  lastUnknownDescriptor: Float32Array | null;
  isProcessing: boolean;
  storedFacesCount: number;
  detectAndMatch: (videoElement: HTMLVideoElement) => Promise<FaceMatch | null>;
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

// Calculate Euclidean distance between two descriptors
function euclideanDistance(desc1: Float32Array, desc2: Float32Array): number {
  if (desc1.length !== desc2.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < desc1.length; i++) {
    const diff = desc1[i] - desc2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
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

  // Main detection and matching pipeline
  const detectAndMatch = useCallback(async (videoElement: HTMLVideoElement): Promise<FaceMatch | null> => {
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

      if (!detections || detections.length === 0) {
        console.log('[Face] No faces detected by either detector');
        setLastMatch(null);
        // Forget the previous stranger so "remember X" can't save an old face under a new name
        updateLastUnknownDescriptor(null);
        return null;
      }

      // Pick the detection with the highest score (most confident)
      let bestDetection = detections[0];
      for (let i = 1; i < detections.length; i++) {
        if (detections[i].detection.score > bestDetection.detection.score) {
          bestDetection = detections[i];
        }
      }

      const score = bestDetection.detection.score;
      console.log(`[Face] Best detection score: ${score.toFixed(3)} (min: ${MIN_DETECTION_SCORE})`);

      // Reject low-confidence detections
      if (score < MIN_DETECTION_SCORE) {
        console.log('[Face] Detection score too low, skipping match');
        setLastMatch(null);
        updateLastUnknownDescriptor(null);
        return null;
      }

      const currentDescriptor = new Float32Array(bestDetection.descriptor);

      // Fetch latest faces from database
      const storedFaces = storedFacesRef.current;

      if (storedFaces.length === 0) {
        const unknownMatch: FaceMatch = {
          name: 'Unknown',
          known: false,
          descriptor: currentDescriptor
        };
        setLastMatch(unknownMatch);
        updateLastUnknownDescriptor(currentDescriptor);
        return unknownMatch;
      }

      // Find best match across all stored faces
      let bestMatchRecord: FaceRecord | null = null;
      let bestDistance = Infinity;

      for (const face of storedFaces) {
        const storedDescriptor = toFloat32Array(face.descriptor);
        if (!storedDescriptor) {
          console.warn(`[Face] Skipping face ${face.name} — invalid descriptor`);
          continue;
        }

        const distance = euclideanDistance(currentDescriptor, storedDescriptor);

        if (distance < bestDistance) {
          bestDistance = distance;
          bestMatchRecord = face;
        }
      }

      console.log(`[Face] Best match: ${bestMatchRecord?.name || 'none'}, distance: ${bestDistance.toFixed(4)}, threshold: ${MATCH_THRESHOLD}`);

      if (bestMatchRecord && bestDistance < MATCH_THRESHOLD) {
        // Calculate temporal context
        const now = new Date();
        const lastSeen = bestMatchRecord.lastSeen instanceof Date
          ? bestMatchRecord.lastSeen
          : new Date(bestMatchRecord.lastSeen);
        const daysSinceLastSeen = daysBetween(lastSeen, now);

        const context: FaceContext = {
          name: bestMatchRecord.name,
          relation: bestMatchRecord.relation || 'Acquaintance',
          lastSeen,
          daysSinceLastSeen,
          isLongAbsence: daysSinceLastSeen >= DAYS_THRESHOLD
        };

        // Never train on an unconfirmed prediction: a false positive would corrupt enrollment.
        if (bestMatchRecord.id) {
          // A failed timestamp write must not turn a successful match into "no face".
          await faceDB.updateLastSeen(bestMatchRecord.id).catch(err =>
            console.error('[Face] Failed to update lastSeen:', err)
          );
        }

        const knownMatch: FaceMatch = {
          name: bestMatchRecord.name,
          known: true,
          distance: bestDistance,
          id: bestMatchRecord.id,
          context
        };
        setLastMatch(knownMatch);
        updateLastUnknownDescriptor(null);

        // Refresh last-seen timestamps before the next cycle
        refreshStoredFaces();

        return knownMatch;
      } else {
        const unknownMatch: FaceMatch = {
          name: 'Unknown',
          known: false,
          descriptor: currentDescriptor,
          distance: bestDistance
        };
        setLastMatch(unknownMatch);
        updateLastUnknownDescriptor(currentDescriptor);
        return unknownMatch;
      }
    } catch (error) {
      console.error('[Face] Detection error:', error);
      return null;
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
    }
  }, [isModelsLoaded, refreshStoredFaces, updateLastUnknownDescriptor]);

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
      setLastMatch({
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
      });

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
    lastUnknownDescriptor,
    isProcessing,
    storedFacesCount,
    detectAndMatch,
    registerCurrentFace,
    loadModels,
    retryLoadModels,
    refreshStoredFaces,
    clearAllFaces,
    generateSpeechText
  };
}
