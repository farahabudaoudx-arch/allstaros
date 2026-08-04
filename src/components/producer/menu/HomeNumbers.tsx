"use client";

import { useEffect, useState } from "react";
import { AppChrome } from "@/components/producer/AppChrome";
import { PageTransition } from "@/components/PageTransition";
import { type MenuPerson } from "./MenuSettingsDrawer";

/** One "You have made 1,204 dials" line: the sentence with its number set
 *  apart, so the figure is what the eye lands on. */
export type NumberLine = {
  /** Text before the figure, e.g. "You have made". */
  before: string;
  value: string;
  /** Text after the figure, e.g. "dials". Optional. */
  after?: string;
};

function greetingWord(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Morning";
  if (hour < 18) return "Afternoon";
  return "Evening";
}

/**
 * The producer/builder landing screen. Replaces the old tile launcher: the
 * sidebar handles navigation now, so the first thing you see on login is your
 * own year-to-date scoreboard rather than a grid of buttons.
 *
 * The lines themselves are computed on the server (lib/producer/home-numbers)
 * and differ by role; this component only lays them out.
 */
export function HomeNumbers({
  person,
  greetingName,
  lines,
  chatHref,
  unreadChat,
  previewOf,
}: {
  person: MenuPerson;
  greetingName: string;
  lines: NumberLine[];
  chatHref: string;
  unreadChat: boolean;
  /** Set only by the dev ?preview=<name> escape hatch, to label whose numbers
   *  these are so a screenshot is never mistaken for your own. */
  previewOf?: string;
}) {
  // Computed after mount so the server and client agree on the markup; the
  // server has no idea what time it is where the reader is.
  const [greeting, setGreeting] = useState("Morning");
  useEffect(() => setGreeting(greetingWord()), []);

  return (
    <AppChrome
      person={person}
      chatHref={chatHref}
      unreadChat={unreadChat}
      alwaysOpenRail
    >
      <PageTransition className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 py-10 md:px-10">
        <main>
          {previewOf ? (
            <p className="mb-5 text-sm text-mute">
              Dev preview: viewing as {previewOf}
            </p>
          ) : null}
          <h1 className="text-[clamp(2.25rem,5.5vw,3.5rem)] font-semibold leading-[1.1] tracking-[-0.03em]">
            Good {greeting},{" "}
            <em className="text-accent not-italic">{greetingName}.</em>
          </h1>

          <p className="mt-8 text-lg text-subtle md:text-xl">
            Here are your YTD numbers:
          </p>

          <ul className="mt-5 flex flex-col gap-2.5">
            {lines.map((line) => (
              <li
                key={line.before + line.after}
                className="text-xl leading-snug tracking-[-0.01em] text-subtle md:text-2xl"
              >
                {line.before}{" "}
                <span className="font-semibold tabular-nums text-ink">
                  {line.value}
                </span>
                {line.after ? ` ${line.after}` : null}
              </li>
            ))}
          </ul>

          <p className="mt-10 text-xl font-semibold tracking-[-0.02em] text-ink md:text-2xl">
            Let&apos;s get to work.
          </p>
        </main>
      </PageTransition>
    </AppChrome>
  );
}
