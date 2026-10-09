// Safety: if the AI returns raw JSON instead of a clean description, extract it
export function sanitizeCaption(raw: string): string {
  if (!raw) return "";
  if (raw.trim().startsWith("{") || raw.includes('"description"')) {
    const cleaned = raw.replace(/<\|[^|]*\|>/g, "").replace(/\bassistant\b/g, "");
    const match = cleaned.match(/"description"\s*:\s*"([^"]+)"/);
    if (match) return match[1];
    return raw
      .replace(/[{}":[\]]/g, "")
      .replace(/text_content|description|hazards|priority|found/g, "")
      .replace(/<\|[^|]*\|>/g, "")
      .replace(/\bassistant\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  return raw;
}
