"use server";

import { getActiveSubject } from "@/lib/actions/subjects";
import { askAssistant, type AssistantAnswer, type ChatTurn } from "@/lib/core/assistant";

/** Answer a question over the active subject's own data. Read-only — never executes effects. */
export async function askAssistantAction(question: string, history: ChatTurn[] = []): Promise<AssistantAnswer> {
  const q = question.trim();
  if (!q) {
    return { answer: "Ask me anything about your visibility, sources, or what to do next.", citations: [], proposedAction: null, grounded: false, source: "keyless" };
  }
  const data = await getActiveSubject();
  if (!data) {
    return {
      answer: "Set up a subject first, then run an audit — I can only answer from your own data.",
      citations: [],
      proposedAction: null,
      grounded: false,
      source: "keyless",
    };
  }
  // Cap history defensively (the client supplies it).
  const trimmed = history.slice(-10).map((t) => ({ role: t.role === "assistant" ? ("assistant" as const) : ("user" as const), content: String(t.content).slice(0, 4000) }));
  return askAssistant(data.subject.id, q.slice(0, 1000), trimmed);
}

export async function getAssistantSubject(): Promise<{ name: string } | null> {
  const data = await getActiveSubject();
  return data ? { name: data.subject.name } : null;
}
