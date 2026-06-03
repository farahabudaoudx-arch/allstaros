"use client";

import { useEffect } from "react";
import confetti from "canvas-confetti";

const OK_MESSAGES: Record<string, string> = {
  "guide-read": "Video marked as watched — let's schedule your exam.",
  "exam-scheduled": "Exam date saved. Study materials are unlocked.",
  studying: "Study login confirmed — next up, pass your exam.",
  "exam-passed": "Marked exam passed — your builder will confirm.",
  "check-in": "Check-in recorded.",
  policy: "Policy submission recorded.",
  lesson: "Lesson marked complete.",
};

const MILESTONE_MESSAGES: Record<string, string> = {
  first_dial: "First dial! 🎯",
  first_presentation: "First presentation!",
  first_policy: "First policy submitted!",
  first_deposit: "First deposit cleared!",
};

export default function FlashBanner({
  flash,
}: {
  flash: { ok?: string; error?: string; milestone?: string };
}) {
  useEffect(() => {
    if (flash.milestone) {
      // Section 5.4 — fire confetti on milestone.
      void confetti({
        particleCount: 160,
        spread: 75,
        origin: { y: 0.6 },
      });
    }
  }, [flash.milestone]);

  if (flash.error) {
    return (
      <div className="mb-4 rounded-xl border border-neg/40 bg-neg/[0.08] px-4 py-3 text-sm text-neg">
        {decodeURIComponent(flash.error)}
      </div>
    );
  }
  if (flash.milestone) {
    return (
      <div className="mb-4 rounded-xl border border-accent/40 bg-accent/[0.08] px-4 py-3 text-sm font-medium text-accent">
        {MILESTONE_MESSAGES[flash.milestone] ?? "Milestone reached!"}
      </div>
    );
  }
  if (flash.ok) {
    return (
      <div className="mb-4 rounded-xl border border-pos/40 bg-pos/[0.08] px-4 py-3 text-sm text-pos">
        {OK_MESSAGES[flash.ok] ?? "Saved."}
      </div>
    );
  }
  return null;
}
