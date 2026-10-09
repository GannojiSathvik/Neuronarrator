/**
 * Clean-up for push-to-talk (useVoiceControl) speech-recognition transcripts.
 */

// How the recognizer tends to mishear the "neuro" wake word (the same spellings
// useVoiceCommand's phrase lists cover). "new row" must come before any single word.
const WAKE_WORD_MISHEARINGS = /\b(?:new\s+row|neural|nero|euro|nuro)\b/g;

/**
 * Lowercase, strip punctuation (apostrophes inside words are kept, so "what's" survives),
 * collapse spaces and spell every misheard wake word as "neuro".
 */
export function normalizeTranscript(transcript: string): string {
  return transcript
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'\s]/gu, " ")
    .replace(/(^|\s)'+|'+(?=\s|$)/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .replace(WAKE_WORD_MISHEARINGS, "neuro");
}

/** One recognition result: whether it is final, and its alternatives, best first. */
export interface RecognitionSegment {
  isFinal: boolean;
  alternatives: string[];
}

/** Copies every result of a recognition event, in order, so later code needn't touch the live list. */
export function segmentsFromResults(results: SpeechRecognitionEventLike["results"]): RecognitionSegment[] {
  const segments: RecognitionSegment[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const alternatives: string[] = [];
    for (let j = 0; j < (result.length || 1); j++) {
      const transcript = result[j]?.transcript;
      if (transcript) alternatives.push(transcript);
    }
    segments.push({ isFinal: result.isFinal, alternatives });
  }
  return segments;
}

/**
 * Whole-utterance readings, best first: candidate j joins every segment's j-th alternative
 * (falling back to its best one when it has fewer). Duplicates and empties are dropped.
 */
export function transcriptCandidates(segments: RecognitionSegment[]): string[] {
  const maxAlternatives = Math.max(0, ...segments.map((s) => s.alternatives.length));
  const candidates: string[] = [];
  for (let j = 0; j < maxAlternatives; j++) {
    const text = segments
      .map((s) => (s.alternatives[j] ?? s.alternatives[0] ?? "").trim())
      .filter(Boolean)
      .join(" ");
    if (text && !candidates.includes(text)) candidates.push(text);
  }
  return candidates;
}
