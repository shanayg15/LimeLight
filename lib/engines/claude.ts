import Anthropic from "@anthropic-ai/sdk";
import { actualCallCost } from "./pricing";
import {
  normalizeDomain,
  type AnswerEngine,
  type EngineCitation,
  type EngineQueryOpts,
  type EngineResult,
} from "./types";

const CLAUDE_MODEL = process.env.CLAUDE_ENGINE_MODEL ?? "claude-haiku-4-5";

type LooseItem = { type?: string; url?: string; title?: string };
type LooseBlock = {
  type?: string;
  text?: string;
  content?: LooseItem[] | unknown;
  citations?: LooseItem[];
};
type LooseMessage = {
  content?: LooseBlock[];
  usage?: { input_tokens?: number; output_tokens?: number };
};

export const ClaudeEngine: AnswerEngine = {
  id: "claude",
  async query(prompt: string, opts: EngineQueryOpts): Promise<EngineResult> {
    const client = new Anthropic({ apiKey: opts.apiKey });
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
      tools: [
        { type: "web_search_20250305", name: "web_search", max_uses: 5 },
      ] as Anthropic.Messages.ToolUnion[],
    });

    const msg = response as unknown as LooseMessage;
    const citations: EngineCitation[] = [];
    const seen = new Set<string>();
    let rank = 1;
    let text = "";
    let searched = false;

    const add = (url?: string, title?: string) => {
      if (!url) return;
      const domain = normalizeDomain(url);
      if (!domain) return;
      const key = url.trim().toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      citations.push({ url: url.trim(), domain, title, rank: rank++ });
    };

    for (const b of msg.content ?? []) {
      if (b.type === "text") {
        if (b.text) text += b.text;
        for (const c of b.citations ?? []) {
          if (c.type === "web_search_result_location") add(c.url, c.title);
        }
      } else if (b.type === "web_search_tool_result") {
        searched = true;
        if (Array.isArray(b.content)) {
          for (const item of b.content as LooseItem[]) {
            if (item.type === "web_search_result") add(item.url, item.title);
          }
        }
      } else if (b.type === "server_tool_use") {
        searched = true;
      }
    }

    const tokensIn = msg.usage?.input_tokens;
    const tokensOut = msg.usage?.output_tokens;
    return {
      text: text.trim(),
      citations,
      model: CLAUDE_MODEL,
      searchEnabled: searched,
      tokensIn,
      tokensOut,
      costUsd: actualCallCost("claude", tokensIn ?? 0, tokensOut ?? 0),
    };
  },
};
