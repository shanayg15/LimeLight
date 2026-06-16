// Saved, representative generation-model responses for deterministic, free
// testing of the defensive prompt parser (no live API).

// A clean JSON array — the ideal case.
export const CLEAN_JSON = JSON.stringify([
  { text: "Who is Ada Lovelace?", topic: "", intent: "reputation" },
  { text: "Is Ada Lovelace considered the first programmer?", topic: "", intent: "reputation" },
  { text: "Ada Lovelace reviews of her notes on the Analytical Engine", topic: "analytical engines", intent: "reputation" },
  { text: "Best resources on analytical engines", topic: "analytical engines", intent: "discovery" },
  { text: "Who are the key figures in analytical engines?", topic: "analytical engines", intent: "discovery" },
  { text: "Ada Lovelace work on analytical engines", topic: "analytical engines", intent: "discovery" },
  { text: "How to understand analytical engines for beginners", topic: "analytical engines", intent: "how_to" },
  { text: "Best books on computing history", topic: "computing history", intent: "discovery" },
  { text: "Who shaped early computing history?", topic: "computing history", intent: "discovery" },
  { text: "Ada Lovelace computing history legacy", topic: "computing history", intent: "discovery" },
  { text: "How to get started learning computing history", topic: "computing history", intent: "how_to" },
  { text: "Charles Babbage vs Ada Lovelace contributions", topic: "", intent: "comparison" },
  { text: "Alternatives to Ada Lovelace's writings for learning programming", topic: "", intent: "comparison" },
  { text: "Is Ada Lovelace's reputation overstated?", topic: "", intent: "reputation" },
  { text: "Best introductions to the Analytical Engine", topic: "analytical engines", intent: "discovery" },
  { text: "How did Ada Lovelace influence computing history?", topic: "computing history", intent: "how_to" },
]);

// The same array wrapped in a markdown code fence (common model behavior).
export const FENCED_JSON = "```json\n" + CLEAN_JSON + "\n```";

// A JSON array surrounded by chatty prose (also common).
export const TRAILING_PROSE = `Sure! Here are the prompts a real person might type:

${CLEAN_JSON}

Let me know if you'd like more or a different angle.`;

// No JSON array at all — the parser must throw (caller retries), not crash.
export const MALFORMED = `I can't return JSON, but here are some ideas:
- Who is Ada Lovelace
- Best computing history books`;

// A mix of valid and invalid items — the parser keeps valid ones, drops the rest.
export const MIXED_VALIDITY = JSON.stringify([
  { text: "Who is Ada Lovelace?", topic: "", intent: "reputation" },
  { text: "x", intent: "reputation" }, // too short -> dropped
  { text: "Bad intent prompt about analytical engines", topic: "analytical engines", intent: "buy" }, // bad intent -> dropped
  { topic: "computing history", intent: "discovery" }, // missing text -> dropped
  { text: "Best resources on computing history", topic: "computing history", intent: "discovery" },
]);

// A well-behaved comparison-heavy response that references ONLY the provided
// competitors — used to assert we never surface invented competitor names.
export const PROVIDED_COMPETITORS = ["Notion", "Obsidian"];
export const COMPETITOR_JSON = JSON.stringify([
  { text: "Who makes Mailwise?", topic: "", intent: "reputation" },
  { text: "Notion vs Mailwise for notes", topic: "notes", intent: "comparison" },
  { text: "Obsidian vs Mailwise", topic: "notes", intent: "comparison" },
  { text: "Alternatives to Mailwise", topic: "", intent: "comparison" },
  { text: "Best note-taking tools", topic: "notes", intent: "discovery" },
]);
