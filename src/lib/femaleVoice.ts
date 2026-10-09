// The browser's built-in voice is used for quick command confirmations and whenever the
// Sarvam voice is unavailable. Left to itself, an "en-IN" utterance on macOS picks Rishi
// (male); pick a smooth female voice instead, preferring Indian English.

// Most natural-sounding first. Google voices ship with Chrome; the rest are OS voices
// (macOS: Veena, Samantha, Karen…; Windows/Edge: Neerja, Heera…).
const PREFERRED_FEMALE = [
  "Google UK English Female",
  "Microsoft Neerja Online (Natural) - English (India)",
  "Microsoft Neerja",
  "Veena",
  "Google US English",
  "Samantha",
  "Microsoft Heera",
  "Karen",
  "Moira",
  "Tessa",
  "Serena",
  "Microsoft Zira",
];

// Names that are known to be male, so a fallback never lands on them.
const KNOWN_MALE = /rishi|daniel|alex|fred|ravi|google uk english male|david|mark|george|aaron|arthur|gordon|oliver|tom/i;

type VoiceLike = Pick<SpeechSynthesisVoice, "name" | "lang">;

export function pickFemaleVoice<T extends VoiceLike>(voices: T[]): T | null {
  for (const wanted of PREFERRED_FEMALE) {
    const match = voices.find((voice) => voice.name.startsWith(wanted));
    if (match) return match;
  }
  // Any voice whose name says it's female, then any English voice that isn't a known male one.
  return (
    voices.find((voice) => /female/i.test(voice.name)) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith("en") && !KNOWN_MALE.test(voice.name)) ??
    null
  );
}

let cachedVoice: SpeechSynthesisVoice | null = null;

function refreshVoice() {
  try {
    cachedVoice = pickFemaleVoice(window.speechSynthesis?.getVoices() ?? []);
  } catch {
    cachedVoice = null;
  }
}

// Chrome loads its voice list asynchronously, so pick again once it arrives.
if (typeof window !== "undefined" && window.speechSynthesis) {
  refreshVoice();
  window.speechSynthesis.addEventListener?.("voiceschanged", refreshVoice);
}

/** Use the chosen female voice for this utterance (keeps the browser default if none found). */
export function applyFemaleVoice(utterance: SpeechSynthesisUtterance): void {
  if (!cachedVoice) refreshVoice();
  if (cachedVoice) {
    utterance.voice = cachedVoice;
    utterance.lang = cachedVoice.lang;
  }
}
