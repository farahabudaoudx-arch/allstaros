"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { LiveDealCelebration } from "./LiveDealCelebration";
import {
  LIVE_CELEBRATION_MS,
  LIVE_SOUND_STORAGE_KEY,
  mergeLiveCelebrationQueue,
} from "@/lib/producer/live-leaderboard-celebrations";
import {
  EMPTY_LIVE_EVENT_TRACKER,
  LIVE_LEADERBOARD_POLL_MS,
  reconcileLiveDealEvents,
  type LiveEventTracker,
} from "@/lib/producer/live-leaderboard-events";

type DealEvent = {
  id: string;
  display_name: string;
  submitted_ap_cents: number;
  carrier: string | null;
  occurred_at: string | null;
};

type Snapshot = {
  scope: "team" | "organization";
  asOf: string;
  shop_day: string;
  range: { from: string; to: string };
  totals: {
    submitted_ap_cents: number;
    deals: number;
    people: number;
    average_ticket_cents: number;
  };
  periods: {
    week: { range: { from: string; to: string }; submitted_ap_cents: number; deals: number };
    month: { range: { from: string; to: string }; submitted_ap_cents: number; deals: number };
  };
  rows: Array<{
    full_name: string;
    photo_url: string | null;
    submitted_ap_cents: number;
    sales_count: number;
  }>;
  events: DealEvent[];
};

type State =
  | { kind: "loading" }
  | { kind: "dead" }
  | { kind: "error" }
  | { kind: "ready"; snapshot: Snapshot };

type ConnectionState = "connecting" | "live" | "reconnecting";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function dollars(cents: number) {
  return money.format(cents / 100);
}

function playLiveGong(context: AudioContext) {
  const now = context.currentTime;
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.72, now + 0.018);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
  master.connect(context.destination);

  [196, 247, 294].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.detune.setValueAtTime(index === 1 ? -7 : index === 2 ? 9 : 0, now);
    gain.gain.setValueAtTime(0.8 / (index + 1), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.25 + index * 0.08);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(now + index * 0.018);
    oscillator.stop(now + 2.5);
  });
}

export default function LiveLeaderboardPage() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [activeCelebration, setActiveCelebration] = useState<DealEvent | null>(null);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const eventTrackerRef = useRef<LiveEventTracker>({ ...EMPTY_LIVE_EVENT_TRACKER, seenIds: [] });
  const celebrationQueueRef = useRef<DealEvent[]>([]);
  const activeCelebrationRef = useRef<DealEvent | null>(null);
  const celebrationTimerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioUnlockPromiseRef = useRef<Promise<boolean> | null>(null);
  const audioUnlockedRef = useRef(false);
  const soundEnabledRef = useRef(true);

  const unlockAudio = useCallback(async () => {
    if (audioUnlockPromiseRef.current) return audioUnlockPromiseRef.current;

    const attempt = (async () => {
      try {
        let context = audioContextRef.current;
        if (!context || context.state === "closed") {
          context = new AudioContext();
          audioContextRef.current = context;
        }
        if (context.state === "suspended") await context.resume();
        const unlocked = context.state === "running";
        audioUnlockedRef.current = unlocked;
        setAudioUnlocked(unlocked);
        return unlocked;
      } catch {
        audioUnlockedRef.current = false;
        setAudioUnlocked(false);
        return false;
      }
    })();

    audioUnlockPromiseRef.current = attempt;
    try {
      return await attempt;
    } finally {
      if (audioUnlockPromiseRef.current === attempt) audioUnlockPromiseRef.current = null;
    }
  }, []);

  function toggleSound() {
    const next = !soundEnabledRef.current;
    soundEnabledRef.current = next;
    setSoundEnabled(next);
    try {
      window.localStorage.setItem(LIVE_SOUND_STORAGE_KEY, next ? "on" : "off");
    } catch {
      // Storage can be blocked on hardened TV browsers; the in-memory preference still works.
    }
  }

  async function handleSoundControl() {
    const context = audioContextRef.current;
    if (!audioUnlockedRef.current || !context || context.state !== "running") {
      await unlockAudio();
      return;
    }
    toggleSound();
  }

  useEffect(() => {
    try {
      if (window.localStorage.getItem(LIVE_SOUND_STORAGE_KEY) === "off") {
        soundEnabledRef.current = false;
        queueMicrotask(() => setSoundEnabled(false));
      }
    } catch {
      // Keep sound enabled in memory if storage is unavailable.
    }
    return () => {
      const context = audioContextRef.current;
      audioContextRef.current = null;
      if (context && context.state !== "closed") void context.close().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    function handleAudioKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("button, a, input, select, textarea")) return;
      const context = audioContextRef.current;
      if (audioUnlockedRef.current && context?.state === "running") return;
      if (event.key === "Enter" || event.key === " " || event.code === "NumpadEnter") {
        void unlockAudio();
      }
    }
    window.addEventListener("keydown", handleAudioKeyDown);
    return () => window.removeEventListener("keydown", handleAudioKeyDown);
  }, [unlockAudio]);

  useEffect(() => {
    const token = window.location.hash.slice(1);
    if (!token) {
      queueMicrotask(() => setState({ kind: "dead" }));
      return;
    }

    let stopped = false;
    let inFlight = false;
    let timer: number | null = null;
    let activeController: AbortController | null = null;

    function clearCelebrationTimer() {
      if (celebrationTimerRef.current !== null) {
        window.clearTimeout(celebrationTimerRef.current);
        celebrationTimerRef.current = null;
      }
    }

    function clearCelebrations(updateState: boolean) {
      clearCelebrationTimer();
      celebrationQueueRef.current = [];
      activeCelebrationRef.current = null;
      if (updateState) setActiveCelebration(null);
    }

    function startNextCelebration() {
      if (stopped || activeCelebrationRef.current || celebrationQueueRef.current.length === 0) return;
      const next = celebrationQueueRef.current.shift();
      if (!next) return;
      activeCelebrationRef.current = next;
      setActiveCelebration(next);

      clearCelebrationTimer();
      celebrationTimerRef.current = window.setTimeout(() => {
        celebrationTimerRef.current = null;
        activeCelebrationRef.current = null;
        setActiveCelebration(null);
        startNextCelebration();
      }, LIVE_CELEBRATION_MS);

      const context = audioContextRef.current;
      if (soundEnabledRef.current && audioUnlockedRef.current) {
        if (context?.state === "running") {
          try {
            playLiveGong(context);
          } catch {
            audioUnlockedRef.current = false;
            setAudioUnlocked(false);
          }
        } else {
          audioUnlockedRef.current = false;
          setAudioUnlocked(false);
        }
      }
    }

    function queueCelebrations(events: DealEvent[], rolledOver: boolean) {
      if (rolledOver) {
        clearCelebrationTimer();
        celebrationQueueRef.current = [];
        activeCelebrationRef.current = null;
        setActiveCelebration(null);
      }
      celebrationQueueRef.current = mergeLiveCelebrationQueue(
        celebrationQueueRef.current,
        events,
        rolledOver,
      );
      startNextCelebration();
    }
    function clearTimer() {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    }

    function scheduleNextPoll() {
      clearTimer();
      if (stopped) return;
      timer = window.setTimeout(() => void poll(), LIVE_LEADERBOARD_POLL_MS);
    }

    async function poll() {
      if (stopped || inFlight) return;
      inFlight = true;
      const controller = new AbortController();
      activeController = controller;
      try {
        const response = await fetch("/api/live-leaderboard/snapshot", {
          method: "GET",
          headers: { Authorization: "Bearer " + token },
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as ({ ok?: boolean } & Partial<Snapshot>);
        if (!response.ok || !payload.ok) {
          if (response.status === 404 || response.status === 410 || response.status === 401) {
            stopped = true;
            clearTimer();
            clearCelebrations(true);
            setState({ kind: "dead" });
            return;
          }
          throw new Error("live_snapshot_unavailable");
        }

        const snapshot = payload as Snapshot;
        const reconciled = reconcileLiveDealEvents(
          eventTrackerRef.current,
          snapshot.shop_day,
          snapshot.events,
        );
        eventTrackerRef.current = reconciled.tracker;
        queueCelebrations(reconciled.newEvents, reconciled.rolledOver);

        setState({ kind: "ready", snapshot });
        setConnection("live");
        setLastUpdatedAt(Date.now());
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setConnection("reconnecting");
        setState((current) => current.kind === "ready" ? current : { kind: "error" });
      } finally {
        inFlight = false;
        activeController = null;
        scheduleNextPoll();
      }
    }

    function handleOnline() {
      if (stopped) return;
      setConnection("reconnecting");
      clearTimer();
      if (!inFlight) void poll();
    }

    function handleOffline() {
      if (!stopped) setConnection("reconnecting");
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    void poll();

    return () => {
      stopped = true;
      clearTimer();
      clearCelebrations(false);
      activeController?.abort();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (state.kind === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#05070a] px-6 text-white">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-white/40">All Star OS Live</p>
          <p className="mt-4 text-2xl font-semibold text-white/80">Loading leaderboard…</p>
        </div>
      </main>
    );
  }

  if (state.kind === "dead") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#05070a] px-6 text-white">
        <div className="max-w-xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-white/45">All Star OS Live</p>
          <h1 className="mt-4 text-4xl font-semibold sm:text-5xl">Ask for a new link.</h1>
        </div>
      </main>
    );
  }

  if (state.kind === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#05070a] px-6 text-white">
        <div className="max-w-xl text-center">
          <h1 className="text-3xl font-semibold sm:text-4xl">Connection interrupted.</h1>
          <p className="mt-3 text-white/55">Reconnecting automatically…</p>
        </div>
      </main>
    );
  }

  const { snapshot } = state;
  const title = snapshot.scope === "team" ? "Team Today" : "All Star Today";
  const podiumRows = snapshot.rows.slice(0, 3);
  const rankedRows = snapshot.rows.slice(3);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#05070a] text-white">
      <button
        type="button"
        onClick={() => void handleSoundControl()}
        aria-label={
          !audioUnlocked
            ? "Unlock Live Leaderboard sound"
            : soundEnabled
              ? "Turn Live Leaderboard sound off"
              : "Turn Live Leaderboard sound on"
        }
        aria-pressed={audioUnlocked ? soundEnabled : undefined}
        className="fixed right-4 top-4 z-[160] inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white shadow-xl backdrop-blur transition hover:border-lime-300/50 hover:bg-black/85 focus:outline-none focus:ring-2 focus:ring-lime-300/60 sm:right-6 sm:top-6"
      >
        <span
          aria-hidden="true"
          className={
            "h-2 w-2 rounded-full " +
            (!audioUnlocked ? "bg-amber-300" : soundEnabled ? "bg-lime-300" : "bg-white/35")
          }
        />
        {!audioUnlocked ? "Sound locked · OK / click" : soundEnabled ? "Sound on" : "Sound off"}
      </button>

      {connection === "reconnecting" ? (
        <div role="status" aria-live="polite" className="fixed left-1/2 top-4 z-[120] -translate-x-1/2 rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-sm font-semibold text-amber-100 shadow-xl backdrop-blur">
          Connection interrupted · Reconnecting…{lastUpdatedAt ? " Last update " + new Date(lastUpdatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""}
        </div>
      ) : null}

      {activeCelebration ? (
        <LiveDealCelebration
          event={activeCelebration}
          amount={dollars(activeCelebration.submitted_ap_cents)}
          audioUnlocked={audioUnlocked}
          onUnlockAudio={() => void unlockAudio()}
        />
      ) : null}

      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(197,255,74,0.08),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.05),transparent_32%)]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-4 py-5 sm:px-7 sm:py-7 lg:px-10 xl:px-14">
        <header className="grid gap-5 border-b border-white/10 pb-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="flex items-center gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-2.5">
              <Image src="/logo.png" alt="All Star Life Group" width={120} height={68} priority className="h-auto w-20 sm:w-24 lg:w-28" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-white/40 sm:text-xs">All Star Life Group · Live</p>
              <h1 className="mt-1 text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">{title}</h1>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-center sm:px-5">
              <div className="truncate text-2xl font-semibold sm:text-3xl">{dollars(snapshot.totals.submitted_ap_cents)}</div>
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">Submitted</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-center sm:px-5">
              <div className="text-2xl font-semibold sm:text-3xl">{snapshot.totals.deals}</div>
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">Deals</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-center sm:px-5">
              <div className="text-2xl font-semibold sm:text-3xl">{snapshot.totals.people}</div>
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">People</div>
            </div>
            <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-center sm:px-5">
              <div className="truncate text-2xl font-semibold sm:text-3xl">{dollars(snapshot.totals.average_ticket_cents)}</div>
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">Avg ticket</div>
            </div>
          </div>
        </header>

        <section className="flex-1 py-6 sm:py-8">
          {snapshot.rows.length === 0 ? (
            <div className="flex min-h-[42vh] items-center justify-center rounded-3xl border border-dashed border-white/10 bg-white/[0.025] px-6 text-center">
              <div>
                <p className="text-3xl font-semibold sm:text-5xl">No deals yet today.</p>
                <p className="mt-3 text-sm text-white/40 sm:text-base">The board is ready for the first counted submitted deal.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <section aria-label="Top three" className="grid gap-3 sm:grid-cols-3 sm:gap-4">
                {podiumRows.map((row, index) => (
                  <article
                    key={row.full_name + "-podium-" + index}
                    className={"relative overflow-hidden rounded-3xl border p-5 text-center sm:p-6 lg:p-7 " + (index === 0 ? "border-lime-300/35 bg-lime-300/[0.07] sm:-translate-y-2" : "border-white/10 bg-white/[0.035]")}
                  >
                    <div className="absolute right-4 top-3 text-5xl font-black leading-none text-white/[0.06]">#{index + 1}</div>
                    <div className="mx-auto flex w-fit items-center justify-center rounded-full border border-white/10 bg-black/20 p-1.5">
                      <Avatar name={row.full_name} photoUrl={row.photo_url} className="h-20 w-20 text-xl ring-1 ring-white/15 sm:h-24 sm:w-24 lg:h-28 lg:w-28 lg:text-2xl" />
                    </div>
                    <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/35">Rank {index + 1}</p>
                    <h2 className="mt-1 truncate text-2xl font-semibold sm:text-3xl lg:text-4xl">{row.full_name}</h2>
                    <p className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">{dollars(row.submitted_ap_cents)}</p>
                    <p className="mt-2 text-sm text-white/45">{row.sales_count} {row.sales_count === 1 ? "deal" : "deals"}</p>
                  </article>
                ))}
              </section>

              {rankedRows.length > 0 ? (
                <section aria-label="Ranks four and below" className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.025]">
                  <ol className="divide-y divide-white/8">
                    {rankedRows.map((row, index) => (
                      <li key={row.full_name + "-rank-" + index} className="grid grid-cols-[3.25rem_2.75rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 sm:grid-cols-[4rem_3rem_minmax(0,1fr)_7rem_auto] sm:px-6 lg:py-4">
                        <span className="text-xl font-semibold text-white/30 sm:text-2xl">#{index + 4}</span>
                        <Avatar name={row.full_name} photoUrl={row.photo_url} className="h-10 w-10 text-xs ring-1 ring-white/10 sm:h-11 sm:w-11" />
                        <span className="truncate text-lg font-medium sm:text-xl lg:text-2xl">{row.full_name}</span>
                        <span className="hidden text-right text-sm text-white/40 sm:block">{row.sales_count} {row.sales_count === 1 ? "deal" : "deals"}</span>
                        <span className="min-w-24 text-right text-xl font-semibold sm:text-2xl">{dollars(row.submitted_ap_cents)}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}
            </div>
          )}
        </section>

        <footer className="grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-2">
          {[
            { label: "Week so far", period: snapshot.periods.week },
            { label: "Month so far", period: snapshot.periods.month },
          ].map(({ label, period }) => (
            <div key={label} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white/80 sm:text-base">{label}</p>
                <p className="mt-0.5 truncate text-[10px] uppercase tracking-[0.16em] text-white/30">{period.range.from} → {period.range.to}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold sm:text-xl">{dollars(period.submitted_ap_cents)}</p>
                <p className="text-[10px] uppercase tracking-[0.14em] text-white/35">Submitted</p>
              </div>
              <div className="min-w-14 text-right">
                <p className="text-lg font-semibold sm:text-xl">{period.deals}</p>
                <p className="text-[10px] uppercase tracking-[0.14em] text-white/35">Deals</p>
              </div>
            </div>
          ))}
        </footer>
      </div>
    </main>
  );
}
