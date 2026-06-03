"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/lib/db/types";

/**
 * Live recruit↔builder chat. Renders the existing thread, streams new messages
 * in via Supabase Realtime, and posts new ones with the browser client (RLS
 * enforces that the sender is the current user). Used on both the recruit's
 * /portal/messages page and the builder's recruit thread.
 */
export default function MessageThread({
  recruitId,
  currentPersonId,
  initialMessages,
  otherLabel,
  placeholder = "Write a message…",
}: {
  recruitId: string;
  currentPersonId: string;
  initialMessages: Message[];
  /** What to label the other participant's bubbles (their name). */
  otherLabel: string;
  placeholder?: string;
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabaseRef = useRef(createClient());
  const endRef = useRef<HTMLDivElement | null>(null);

  // Stream new builder-channel messages into the thread as they're inserted.
  useEffect(() => {
    const supabase = supabaseRef.current;
    const channel = supabase
      .channel(`messages:${recruitId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "message",
          filter: `recruit_id=eq.${recruitId}`,
        },
        (payload) => {
          const m = payload.new as Message;
          if (m.channel !== "builder") return;
          setMessages((prev) =>
            prev.some((x) => x.id === m.id) ? prev : [...prev, m],
          );
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [recruitId]);

  // Keep the latest message in view.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  async function send() {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    const { data, error: insertError } = await supabaseRef.current
      .from("message")
      .insert({
        recruit_id: recruitId,
        sender_person_id: currentPersonId,
        body: text,
        is_ai: false,
        channel: "builder",
      })
      .select()
      .single();
    if (insertError) {
      setError("Couldn't send — please try again.");
      setSending(false);
      return;
    }
    if (data) {
      const m = data as Message;
      setMessages((prev) =>
        prev.some((x) => x.id === m.id) ? prev : [...prev, m],
      );
    }
    setBody("");
    setSending(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto pb-4">
        {messages.length === 0 ? (
          <p className="rounded-xl border border-dashed border-hairline px-4 py-10 text-center text-sm text-mute">
            No messages yet — say hello.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_person_id === currentPersonId && !m.is_ai;
            const label = mine ? "You" : otherLabel;
            const tone = mine
              ? "ml-auto border-transparent bg-accent text-black"
              : "mr-auto border-hairline bg-card text-ink";
            return (
              <div
                key={m.id}
                className={`max-w-[80%] rounded-2xl border px-4 py-3 ${tone}`}
              >
                <div className="text-xs opacity-70">
                  {label} · {new Date(m.created_at).toLocaleString()}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{m.body}</p>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {error ? <p className="mb-2 text-xs text-neg">{error}</p> : null}

      <div className="flex items-end gap-2 border-t border-hairline pt-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder={placeholder}
          className="min-h-[44px] flex-1 resize-none rounded-xl border border-hairline bg-card-hi px-3 py-2 text-sm text-ink outline-none transition placeholder:text-mute focus:border-accent"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={sending || !body.trim()}
          className="shrink-0 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
