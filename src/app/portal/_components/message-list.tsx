import type { Message } from "@/lib/db/types";

export default function MessageList({
  messages,
  currentPersonId,
}: {
  messages: Message[];
  currentPersonId: string;
}) {
  if (messages.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-hairline px-4 py-8 text-center text-sm text-mute">
        No messages yet.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {messages.map((m) => {
        const mine = !m.is_ai && m.sender_person_id === currentPersonId;
        const tone = m.is_ai
          ? "border-accent/30 bg-accent/[0.06] text-ink"
          : mine
            ? "border-transparent bg-accent text-black"
            : "border-hairline bg-card text-ink";
        return (
          <li key={m.id} className={`rounded-2xl border px-4 py-3 ${tone}`}>
            <div className="text-xs opacity-70">
              {m.is_ai ? "Casey" : mine ? "You" : "Builder"} ·{" "}
              {new Date(m.created_at).toLocaleString()}
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{m.body}</p>
          </li>
        );
      })}
    </ul>
  );
}
