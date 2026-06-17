"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowUp, Bot, Loader2, ExternalLink, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { askAssistantAction } from "@/lib/actions/assistant";
import type { AssistantAnswer, ChatTurn, DataCitation, ProposedAction } from "@/lib/core/assistant";

type Message = ChatTurn & { citations?: DataCitation[]; proposedAction?: ProposedAction | null; grounded?: boolean };

const SUGGESTIONS = [
  "What am I losing visibility on, and why?",
  "Summarize my visibility.",
  "What changed since my last run?",
  "Who gets cited for my topics instead of me?",
];

export function AssistantChat({ subjectName }: { subjectName: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, start] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  const send = (text: string) => {
    const q = text.trim();
    if (!q || pending) return;
    const history: ChatTurn[] = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { role: "user", content: q }]);
    setInput("");
    start(async () => {
      try {
        const res: AssistantAnswer = await askAssistantAction(q, history);
        setMessages((m) => [...m, { role: "assistant", content: res.answer, citations: res.citations, proposedAction: res.proposedAction, grounded: res.grounded }]);
      } catch {
        setMessages((m) => [...m, { role: "assistant", content: "Something went wrong answering that. Try again.", grounded: false }]);
      }
    });
  };

  return (
    <div className="flex h-[calc(100vh-12rem)] flex-col rounded-xl border border-border bg-card">
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-5">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <span className="mb-3 flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Sparkles className="size-5" />
            </span>
            <h2 className="text-base font-semibold">Ask about {subjectName}&apos;s AI visibility</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              I answer only from your own Limelight data — audits, sources, gaps, site findings, and what
              changed. I can&apos;t take actions; I&apos;ll point you to the right screen to confirm.
            </p>
            <div className="mt-5 grid w-full max-w-md gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-muted/50">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => <ChatBubble key={i} message={m} />)
        )}
        {pending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Bot className="size-4 text-primary" />
            <Loader2 className="size-3.5 animate-spin" /> Thinking…
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2 border-t border-border p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your visibility…"
          className="h-10 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          className={cn(buttonVariants({ size: "icon" }), "shrink-0")}
          aria-label="Send"
        >
          <ArrowUp className="size-4" />
        </button>
      </form>
    </div>
  );
}

function ChatBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[85%] space-y-2", isUser && "items-end")}>
        <div
          className={cn(
            "whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm",
            isUser ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground",
          )}
        >
          {message.content}
        </div>

        {!isUser && message.citations && message.citations.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs text-muted-foreground">Based on:</span>
            {message.citations.map((c) => (
              <Link key={c.kind} href={c.href} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground">
                {c.label}
                <ExternalLink className="size-2.5" />
              </Link>
            ))}
          </div>
        )}

        {!isUser && message.proposedAction && (
          <Link
            href={message.proposedAction.href}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
          >
            <Sparkles className="size-3.5" />
            {message.proposedAction.label} →
          </Link>
        )}

        {!isUser && message.grounded === false && (
          <Badge variant="secondary" className="font-normal">no data yet</Badge>
        )}
      </div>
    </div>
  );
}
