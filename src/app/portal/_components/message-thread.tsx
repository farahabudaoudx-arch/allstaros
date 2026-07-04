"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  fetchMessagesSince,
  markThreadRead,
  sendMessage,
} from "@/lib/actions/messages";
import type { Message } from "@/lib/db/types";

/**
 * Live recruit↔builder chat. Renders the existing thread, streams new messages
 * in via Supabase Realtime, and posts new ones through the sendMessage server
 * action (works on filtered networks that block the Supabase host). Used on
 * both the recruit's /portal/messages page and the builder's recruit thread.
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

  // Realtime health, reported by the channel's subscribe callback. Starts
  // false so polling runs on the fast cadence until the websocket is up.
  const [realtimeHealthy, setRealtimeHealthy] = useState(false);
  // The interval callback reads these refs so it always sees current state
  // without re-creating the interval on every new message.
  const messagesRef = useRef<Message[]>(initialMessages);
  const pollInFlightRef = useRef(false);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

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
      .subscribe((status) => {
        // Status strings per REALTIME_SUBSCRIBE_STATES in @supabase/realtime-js:
        // SUBSCRIBED is healthy; TIMED_OUT, CLOSED, CHANNEL_ERROR are not.
        setRealtimeHealthy(status === "SUBSCRIBED");
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [recruitId]);

  // Polling fallback: filtered networks (VPN, corporate WiFi) block the
  // realtime websocket entirely, so without this incoming messages only show
  // up on refresh. Poll through our server every 5s while realtime is down,
  // and every 30s as a cheap safety net while it's healthy. The id-based
  // dedup below means realtime and polling never double-add a message.
  useEffect(() => {
    const intervalMs = realtimeHealthy ? 30_000 : 5_000;
    const id = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      const current = messagesRef.current;
      // Newest created_at in state (merges can land out of order, so scan).
      const since = current.reduce<string | null>(
        (acc, m) => (acc === null || m.created_at > acc ? m.created_at : acc),
        null,
      );
      void (async () => {
        try {
          const result = await fetchMessagesSince(recruitId, since);
          if (result.ok && result.messages.length > 0) {
            setMessages((prev) => {
              const known = new Set(prev.map((x) => x.id));
              const fresh = result.messages.filter((m) => !known.has(m.id));
              return fresh.length > 0 ? [...prev, ...fresh] : prev;
            });
          }
          // Structured { ok: false } results are ignored on purpose: polling
          // is a background fallback and must never surface an error toast.
        } catch {
          // Transport failure (offline, mid-deploy): swallow, try next tick.
        } finally {
          pollInFlightRef.current = false;
        }
      })();
    }, intervalMs);
    return () => clearInterval(id);
  }, [recruitId, realtimeHealthy]);

  // Keep the latest message in view.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  // Mark the thread read when opened and whenever a new message arrives while
  // it's on screen, so the nav unread dot clears once everything's been seen.
  useEffect(() => {
    void markThreadRead(recruitId);
  }, [recruitId, messages.length]);

  async function send() {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    // The try/catch covers the transport itself (offline, mid-deploy); the
    // action returns structured errors and never throws them.
    try {
      const result = await sendMessage(recruitId, text);
      if (!result.ok) {
        setError("Couldn't send. Please try again.");
        setSending(false);
        return;
      }
      const m = result.message;
      setMessages((prev) =>
        prev.some((x) => x.id === m.id) ? prev : [...prev, m],
      );
      setBody("");
    } catch {
      setError("Couldn't send. Please try again.");
    }
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
            No messages yet. Say hello.
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
