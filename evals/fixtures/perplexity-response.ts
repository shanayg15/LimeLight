import type { PplxResponse } from "@/lib/engines/perplexity";

// A realistic Perplexity (sonar) response for "Who is Ada Lovelace?" — sources
// live in `search_results`. Includes a www host and a duplicate URL to exercise
// normalization + dedupe.
export const PPLX_WITH_SOURCES: PplxResponse = {
  choices: [
    {
      message: {
        content:
          "Ada Lovelace (1815–1852) was an English mathematician known for her work on Charles Babbage's Analytical Engine, where she wrote what is often considered the first algorithm.",
      },
    },
  ],
  search_results: [
    { title: "Ada Lovelace - Wikipedia", url: "https://en.wikipedia.org/wiki/Ada_Lovelace", date: "2024-01-01" },
    { title: "Ada Lovelace | Biography & Facts", url: "https://www.britannica.com/biography/Ada-Lovelace", date: null },
    { title: "Ada Lovelace (dup)", url: "https://en.wikipedia.org/wiki/Ada_Lovelace" },
    { title: "Ada Lovelace", url: "https://computerhistory.org/profiles/ada-lovelace/" },
  ],
  usage: { prompt_tokens: 12, completion_tokens: 210 },
};

// A response where the engine returned no sources — must yield ZERO citations.
export const PPLX_NO_SOURCES: PplxResponse = {
  choices: [{ message: { content: "I don't have enough information to answer that." } }],
  search_results: [],
  usage: { prompt_tokens: 8, completion_tokens: 18 },
};
