// Pure helpers for speech-to-text uploads. No Deno or npm imports, so Vitest can test it.

export interface AudioUpload {
  mimeType: string;
  fileName: string;
}

// Containers browsers' MediaRecorder produces (Chrome: webm, Safari: mp4, Firefox: ogg),
// plus common file types. Groq infers the format from the file extension, so it must match.
const EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "video/webm": "webm",
  "audio/mp4": "mp4",
  "video/mp4": "mp4",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/wave": "wav",
  "audio/x-wav": "wav",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/flac": "flac",
};

// "audio/webm;codecs=opus" -> { mimeType: "audio/webm", fileName: "recording.webm" }.
// Returns null for a type we can't label.
export function audioUpload(mime: string): AudioUpload | null {
  const mimeType = mime.split(";")[0].trim().toLowerCase();
  const ext = EXTENSIONS[mimeType];
  return ext ? { mimeType, fileName: `recording.${ext}` } : null;
}

// "en-IN" -> "en". Whisper takes ISO-639-1 codes; Indian English is just "en".
export function whisperLanguage(languageCode: string): string {
  return languageCode.split("-")[0].toLowerCase();
}
