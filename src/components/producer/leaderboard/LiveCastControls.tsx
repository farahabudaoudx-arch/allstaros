"use client";

import { useEffect, useRef, useState } from "react";

type PresentationConnectionLike = {
  id: string;
  state?: string;
  close?: () => void;
  terminate?: () => void;
  addEventListener?: (type: string, listener: EventListener) => void;
  removeEventListener?: (type: string, listener: EventListener) => void;
};

type PresentationRequestLike = {
  start: () => Promise<PresentationConnectionLike>;
  reconnect?: (connectionId: string) => Promise<PresentationConnectionLike>;
};

type PresentationRequestConstructor = new (urls: string[]) => PresentationRequestLike;

type CastSessionState = "idle" | "starting" | "connected" | "disconnected" | "error" | "stopped";
type CastPath = "airplay" | "chromecast" | null;

function presentationRequestConstructor(): PresentationRequestConstructor | null {
  if (typeof window === "undefined") return null;
  return ((window as unknown as { PresentationRequest?: PresentationRequestConstructor }).PresentationRequest ?? null);
}

function resolveLiveUrl(explicitUrl: string | null | undefined): string | null {
  if (explicitUrl) return explicitUrl;
  if (explicitUrl === null || typeof window === "undefined") return null;
  return window.location.href;
}

function errorName(error: unknown): string {
  return error instanceof DOMException || error instanceof Error ? error.name : "Error";
}

export function LiveCastControls({
  liveUrl,
  scopeLabel,
  variant = "sheet",
}: {
  /** Pass null when no scoped link exists. Omit on the Live page to use its current capability URL. */
  liveUrl?: string | null;
  scopeLabel?: string;
  variant?: "sheet" | "tv";
}) {
  const [open, setOpen] = useState(variant === "sheet");
  const [activePath, setActivePath] = useState<CastPath>(null);
  const [presentationSupported, setPresentationSupported] = useState(false);
  const [sessionState, setSessionState] = useState<CastSessionState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [canReconnect, setCanReconnect] = useState(false);
  const requestRef = useRef<PresentationRequestLike | null>(null);
  const connectionRef = useRef<PresentationConnectionLike | null>(null);
  const connectionIdRef = useRef<string | null>(null);
  const listenerCleanupRef = useRef<(() => void) | null>(null);

  const hasLiveUrl = liveUrl !== null;

  useEffect(() => {
    const supported = Boolean(presentationRequestConstructor());
    queueMicrotask(() => setPresentationSupported(supported));
    return () => listenerCleanupRef.current?.();
  }, []);

  function bindConnection(connection: PresentationConnectionLike, request: PresentationRequestLike) {
    listenerCleanupRef.current?.();
    requestRef.current = request;
    connectionRef.current = connection;
    connectionIdRef.current = connection.id || null;
    setCanReconnect(Boolean(request.reconnect && connection.id));
    setSessionState("connected");
    setMessage("Connected. The selected display is opening this exact scoped Live board.");

    const onConnect: EventListener = () => {
      setSessionState("connected");
      setMessage("Connected. The selected display is opening this exact scoped Live board.");
    };
    const onClose: EventListener = () => {
      connectionRef.current = null;
      setCanReconnect(Boolean(request.reconnect && connectionIdRef.current));
      setSessionState("disconnected");
      setMessage(
        request.reconnect && connectionIdRef.current
          ? "The cast connection closed. Reconnect to the same session or choose Chromecast again for another TV."
          : "The cast connection closed. Choose Chromecast again or use the Live link fallback.",
      );
    };
    const onTerminate: EventListener = () => {
      connectionRef.current = null;
      connectionIdRef.current = null;
      setCanReconnect(false);
      setSessionState("stopped");
      setMessage("Casting stopped. Choose Chromecast again to select another TV.");
    };

    connection.addEventListener?.("connect", onConnect);
    connection.addEventListener?.("close", onClose);
    connection.addEventListener?.("terminate", onTerminate);
    listenerCleanupRef.current = () => {
      connection.removeEventListener?.("connect", onConnect);
      connection.removeEventListener?.("close", onClose);
      connection.removeEventListener?.("terminate", onTerminate);
    };
  }

  async function startChromecast() {
    setOpen(true);
    setActivePath("chromecast");
    setCopyFeedback(null);
    const url = resolveLiveUrl(liveUrl);
    if (!url) {
      setSessionState("error");
      setMessage("Create the selected scope's Live link before starting a cast.");
      return;
    }

    const PresentationRequest = presentationRequestConstructor();
    setPresentationSupported(Boolean(PresentationRequest));
    if (!PresentationRequest) {
      setSessionState("idle");
      setMessage(
        "This browser does not expose an in-page display picker. Use Chrome's Cast / Cast tab controls, or copy the Live link into the TV browser.",
      );
      return;
    }

    setSessionState("starting");
    setMessage("Opening the browser display picker…");
    const request = new PresentationRequest([url]);
    requestRef.current = request;
    try {
      const connection = await request.start();
      bindConnection(connection, request);
    } catch (error) {
      const name = errorName(error);
      setSessionState("error");
      setMessage(
        name === "NotFoundError" || name === "AbortError"
          ? "No cast display was selected. Retry Chromecast, use Chrome's Cast tab controls, or keep the Copy link fallback."
          : "Casting could not start. Retry or use the Live link fallback.",
      );
    }
  }

  function showAirPlaySteps() {
    setOpen(true);
    setActivePath("airplay");
    setSessionState("idle");
    setMessage(null);
    setCopyFeedback(null);
  }

  function stopCasting() {
    const connection = connectionRef.current;
    if (!connection) return;
    try {
      if (connection.terminate) connection.terminate();
      else connection.close?.();
    } catch {
      connection.close?.();
    }
    listenerCleanupRef.current?.();
    listenerCleanupRef.current = null;
    connectionRef.current = null;
    connectionIdRef.current = null;
    setCanReconnect(false);
    setSessionState("stopped");
    setMessage("Casting stopped. Choose Chromecast again to select another TV.");
  }

  async function reconnectCasting() {
    const request = requestRef.current;
    const connectionId = connectionIdRef.current;
    if (!request?.reconnect || !connectionId) {
      setMessage("This browser cannot reconnect the prior session. Choose Chromecast again to select a display.");
      return;
    }
    setSessionState("starting");
    setMessage("Reconnecting to the cast session…");
    try {
      const connection = await request.reconnect(connectionId);
      bindConnection(connection, request);
    } catch {
      setSessionState("error");
      setMessage("Reconnect failed. Choose Chromecast again or use the Live link fallback.");
    }
  }

  async function copyLiveLink() {
    const url = resolveLiveUrl(liveUrl);
    if (!url) {
      setCopyFeedback("Create the selected scope's Live link first.");
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopyFeedback("Live link copied.");
    } catch {
      setCopyFeedback("Copy failed. Use the visible Live URL or your browser's address bar.");
    }
  }

  const controls = (
    <>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!hasLiveUrl || sessionState === "connected"}
          onClick={showAirPlaySteps}
          className={
            variant === "sheet"
              ? "rounded-xl border border-hairline bg-card-hi px-3 py-2.5 text-sm font-semibold text-ink transition hover:border-mute disabled:cursor-not-allowed disabled:opacity-40"
              : "rounded-xl border border-white/15 bg-white/[0.05] px-3 py-2.5 text-sm font-semibold text-white transition hover:border-cyan-300/50 disabled:opacity-40"
          }
        >
          AirPlay
        </button>
        <button
          type="button"
          disabled={!hasLiveUrl || sessionState === "starting" || sessionState === "connected"}
          onClick={() => void startChromecast()}
          className={
            variant === "sheet"
              ? "rounded-xl border border-hairline bg-card-hi px-3 py-2.5 text-sm font-semibold text-ink transition hover:border-mute disabled:cursor-not-allowed disabled:opacity-40"
              : "rounded-xl border border-white/15 bg-white/[0.05] px-3 py-2.5 text-sm font-semibold text-white transition hover:border-cyan-300/50 disabled:opacity-40"
          }
        >
          {sessionState === "starting" && activePath === "chromecast" ? "Choosing…" : "Chromecast"}
        </button>
      </div>

      {!hasLiveUrl ? (
        <p className={variant === "sheet" ? "mt-3 text-xs leading-5 text-subtle" : "mt-3 text-xs leading-5 text-white/55"}>
          Create the selected scope&apos;s Live link before casting so the TV receives the intended board.
        </p>
      ) : null}

      {activePath === "airplay" ? (
        <div className={variant === "sheet" ? "mt-3 rounded-xl border border-hairline bg-bg p-3" : "mt-3 rounded-xl border border-white/10 bg-black/30 p-3"}>
          <p className={variant === "sheet" ? "text-sm font-semibold text-ink" : "text-sm font-semibold text-white"}>AirPlay from iPhone / iPad</p>
          <p className={variant === "sheet" ? "mt-2 text-xs leading-5 text-subtle" : "mt-2 text-xs leading-5 text-white/60"}>
            Open Control Center → Screen Mirroring → choose the Apple TV or AirPlay display. Web pages cannot open the system page-mirroring picker themselves, so device selection and stop/switch happen in Control Center.
          </p>
          <p className={variant === "sheet" ? "mt-2 text-xs leading-5 text-subtle" : "mt-2 text-xs leading-5 text-white/60"}>
            Wrong TV? Open Screen Mirroring, stop mirroring, then choose another display. Keep this preview open while mirroring.
          </p>
        </div>
      ) : null}

      {activePath === "chromecast" ? (
        <div className={variant === "sheet" ? "mt-3 rounded-xl border border-hairline bg-bg p-3" : "mt-3 rounded-xl border border-white/10 bg-black/30 p-3"}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={variant === "sheet" ? "text-sm font-semibold text-ink" : "text-sm font-semibold text-white"}>Chromecast / Chrome display</p>
              <p className={variant === "sheet" ? "mt-1 text-[11px] uppercase tracking-[0.12em] text-mute" : "mt-1 text-[11px] uppercase tracking-[0.12em] text-white/35"}>
                {presentationSupported ? "Browser picker available" : "Manual browser cast path"}
              </p>
            </div>
            {sessionState === "connected" ? (
              <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-400">Connected</span>
            ) : null}
          </div>
          {message ? (
            <p role="status" className={variant === "sheet" ? "mt-2 text-xs leading-5 text-subtle" : "mt-2 text-xs leading-5 text-white/60"}>{message}</p>
          ) : null}
          {!presentationSupported ? (
            <p className={variant === "sheet" ? "mt-2 text-xs leading-5 text-subtle" : "mt-2 text-xs leading-5 text-white/60"}>
              In Chrome, open the Cast controls, choose Cast tab, then select the Chromecast / Google TV. On Android, use the device&apos;s Cast or Screen Cast path when the browser does not expose a picker.
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {sessionState === "connected" ? (
              <button type="button" onClick={stopCasting} className={variant === "sheet" ? "rounded-lg border border-neg/30 px-3 py-1.5 text-xs font-semibold text-neg" : "rounded-lg border border-red-300/30 px-3 py-1.5 text-xs font-semibold text-red-200"}>
                Stop casting
              </button>
            ) : null}
            {sessionState === "disconnected" && canReconnect ? (
              <button type="button" onClick={() => void reconnectCasting()} className={variant === "sheet" ? "rounded-lg border border-accent/30 px-3 py-1.5 text-xs font-semibold text-accent" : "rounded-lg border border-cyan-300/30 px-3 py-1.5 text-xs font-semibold text-cyan-200"}>
                Reconnect
              </button>
            ) : null}
            {(sessionState === "error" || sessionState === "stopped" || sessionState === "disconnected") ? (
              <button type="button" onClick={() => void startChromecast()} className={variant === "sheet" ? "rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold text-ink" : "rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white"}>
                Choose another TV
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className={variant === "sheet" ? "text-xs leading-5 text-mute" : "text-xs leading-5 text-white/45"}>
          Browser fallback always remains available. Cast audio depends on the platform; the visual board keeps working either way.
        </p>
        <button
          type="button"
          disabled={!hasLiveUrl}
          onClick={() => void copyLiveLink()}
          className={variant === "sheet" ? "shrink-0 text-xs font-semibold text-accent disabled:opacity-40" : "shrink-0 text-xs font-semibold text-cyan-200 disabled:opacity-40"}
        >
          Copy link
        </button>
      </div>
      {copyFeedback ? <p role="status" className={variant === "sheet" ? "mt-2 text-xs text-subtle" : "mt-2 text-xs text-white/60"}>{copyFeedback}</p> : null}
    </>
  );

  if (variant === "sheet") {
    return (
      <section className="mt-5 rounded-2xl border border-hairline bg-card p-5" aria-label="Cast Live Leaderboard">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink">Cast {scopeLabel ? scopeLabel + " " : ""}board</p>
            <p className="mt-1 text-xs leading-5 text-subtle">Choose the scope above first. Casting always uses the current scoped Live link.</p>
          </div>
          <span className="rounded-full border border-hairline px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-mute">TV</span>
        </div>
        <div className="mt-4">{controls}</div>
      </section>
    );
  }

  return (
    <div className="fixed left-4 top-4 z-[160] sm:left-6 sm:top-6">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="live-cast-panel"
        className="rounded-full border border-white/15 bg-black/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white shadow-xl backdrop-blur transition hover:border-cyan-300/50 hover:bg-black/85 focus:outline-none focus:ring-2 focus:ring-cyan-300/60"
      >
        Cast
      </button>
      {open ? (
        <div id="live-cast-panel" className="mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-white/12 bg-[#091019]/95 p-4 text-left shadow-2xl backdrop-blur-xl">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Show this Live board on a TV</p>
              <p className="mt-1 text-xs leading-5 text-white/50">The same scoped rankings, totals, celebrations, and capability link are reused.</p>
            </div>
            <button type="button" aria-label="Close cast controls" onClick={() => setOpen(false)} className="text-lg leading-none text-white/45 hover:text-white">×</button>
          </div>
          {controls}
        </div>
      ) : null}
    </div>
  );
}
