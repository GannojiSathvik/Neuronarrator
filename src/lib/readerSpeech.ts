// Read mode returns a short context ("Looks like a cafe menu.") in `description` and the text
// in `text_content`. Older server prompts also open text_content with that context, so saying
// both would repeat it. Speak the context once, then the text.
const CONTEXT_OPENER = /^(this |it )?(looks like|seems like|says|reads)\b/i;

const words = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);

export function readerSpeech(description: string, textContent: string): string {
  const context = description.trim();
  const text = textContent.trim();
  if (!text) return context;
  if (!context) return text;
  // The text already opens with its own context ("This looks like a menu. It says…")
  if (CONTEXT_OPENER.test(text)) return text;
  // …or repeats the context's words near the start
  const contextWords = words(context);
  const opening = new Set(words(text).slice(0, contextWords.length + 4));
  if (contextWords.length && contextWords.every((word) => opening.has(word))) return text;
  return `${context} ${text}`;
}
