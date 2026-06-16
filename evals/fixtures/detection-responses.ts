// Saved detection-model responses (keyed to entities), for deterministic testing
// of the parser/mapping — independent of live LLM noise. Subject key = "subject",
// competitor key = its id.

// Subject clearly mentioned, competitor mentioned.
export const DETECT_CLEAR = JSON.stringify([
  { key: "subject", mentioned: true, position: 1, sentiment: "positive", snippet: "Ada Lovelace was a mathematician", confidence: 0.95 },
  { key: "comp-1", mentioned: true, position: 2, sentiment: "neutral", snippet: "Charles Babbage built the engine", confidence: 0.9 },
]);

// Name-collision trap: a DIFFERENT entity with the same name appears, so the model
// (correctly disambiguating) reports our subject as NOT mentioned.
export const DETECT_ABSENT = JSON.stringify([
  { key: "subject", mentioned: false, position: null, sentiment: "neutral", snippet: "", confidence: 0.88 },
  { key: "comp-1", mentioned: false, confidence: 0.8 },
]);

// The same array wrapped in prose + a code fence (robustness).
export const DETECT_FENCED = "Here's the analysis:\n```json\n" + DETECT_CLEAR + "\n```\nHope that helps.";

// No JSON array at all — parser must throw so the caller can retry.
export const DETECT_MALFORMED = "I cannot output JSON, but Ada Lovelace does appear to be referenced.";
