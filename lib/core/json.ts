export class JsonArrayParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JsonArrayParseError";
  }
}

/**
 * Defensively extract a JSON array from a model response, tolerating markdown
 * fences and stray prose. Throws JsonArrayParseError when no array can be
 * recovered (so callers can retry); never returns a non-array.
 */
export function extractJsonArray(raw: string): unknown[] {
  if (!raw || !raw.trim()) throw new JsonArrayParseError("Empty response.");
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence && fence[1].includes("[")) text = fence[1].trim();

  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    throw new JsonArrayParseError("No JSON array found.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new JsonArrayParseError("Invalid JSON.");
  }
  if (!Array.isArray(parsed)) throw new JsonArrayParseError("Not an array.");
  return parsed;
}

/**
 * Defensively extract a JSON OBJECT from a model response, tolerating markdown
 * fences and stray prose. Throws JsonArrayParseError when none can be recovered
 * (so callers can retry/degrade); never returns a non-object.
 */
export function extractJsonObject(raw: string): Record<string, unknown> {
  if (!raw || !raw.trim()) throw new JsonArrayParseError("Empty response.");
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence && fence[1].includes("{")) text = fence[1].trim();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new JsonArrayParseError("No JSON object found.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new JsonArrayParseError("Invalid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new JsonArrayParseError("Not an object.");
  }
  return parsed as Record<string, unknown>;
}
