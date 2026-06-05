"use client";

import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button, Card } from "@/components/ui";

type Source = { chunk_id: number; topic: string; cluster: string; similarity: number };
type Msg = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
};

function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-ink [&_a]:text-accent [&_a]:underline [&_code]:rounded [&_code]:bg-card-hi [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[13px] [&_em]:italic [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:leading-relaxed [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

const SUGGESTIONS = [
  "What do I say when a client says it's too expensive?",
  "How many dials should I make in a day?",
  "How do I recruit new agents to my team?",
  "When should I pitch an IUL over whole life?",
];

export function AllStarChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    const question = text.trim();
    if (!question || loading) return;
    setError(null);

    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    const next: Msg[] = [...messages, { role: "user", content: question }];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/allstar-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question, history }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || `request failed (${res.status})`);
      }
      setMessages([
        ...next,
        { role: "assistant", content: data.answer, sources: data.sources ?? [] },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setMessages(next);
    } finally {
      setLoading(false);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      });
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      {/* Transcript */}
      <div
        ref={scrollRef}
        className="flex max-h-[55vh] min-h-[280px] flex-col gap-4 overflow-y-auto pr-1"
      >
        {messages.length === 0 && (
          <Card className="p-5">
            <p className="text-sm text-subtle">
              Ask anything covered in the All Star training library — objection
              handling, dial targets, scripts, recruiting, products, mindset, and
              more. Answers come straight from the team&apos;s own training material.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-hairline bg-card-hi px-3 py-1.5 text-xs text-subtle transition hover:border-accent hover:text-ink"
                >
                  {s}
                </button>
              ))}
            </div>
          </Card>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
          >
            <div
              className={
                m.role === "user"
                  ? "max-w-[85%] rounded-2xl bg-accent px-4 py-2.5 text-sm font-medium text-background"
                  : "max-w-[90%] rounded-2xl border border-hairline bg-card px-4 py-3 text-sm text-ink"
              }
            >
              {m.role === "assistant" ? (
                <MarkdownMessage content={m.content} />
              ) : (
                <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
              )}
              {m.role === "assistant" && m.sources && m.sources.length > 0 && (
                <div className="mt-3 border-t border-hairline pt-2">
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-mute">
                    Sources
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {m.sources.map((s) => (
                      <span
                        key={s.chunk_id}
                        title={`${s.cluster} · ${(s.similarity * 100).toFixed(0)}% match`}
                        className="rounded-md bg-card-hi px-2 py-0.5 text-[11px] text-subtle"
                      >
                        {s.topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-hairline bg-card px-4 py-3 text-sm text-mute">
              Thinking…
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-neg">{error}</p>}

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-end gap-2"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={2}
          placeholder="Ask All Star AI…  (Enter to send, Shift+Enter for a new line)"
          className="w-full resize-none rounded-xl border border-hairline bg-card-hi px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-mute focus:border-accent"
        />
        <Button type="submit" variant="primary" disabled={loading || !input.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}
