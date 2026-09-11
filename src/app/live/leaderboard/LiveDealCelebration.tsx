"use client";

import styles from "./live-leaderboard.module.css";

type CelebrationEvent = {
  display_name: string;
  submitted_ap_cents: number;
  carrier: string | null;
};

const MONEY_PARTICLES = [
  { left: "5%", delay: "-0.4s", duration: "4.2s", drift: "38px" },
  { left: "13%", delay: "-2.1s", duration: "4.8s", drift: "-26px" },
  { left: "21%", delay: "-1.2s", duration: "4.5s", drift: "46px" },
  { left: "31%", delay: "-3.1s", duration: "5.1s", drift: "-42px" },
  { left: "40%", delay: "-0.8s", duration: "4.4s", drift: "34px" },
  { left: "49%", delay: "-2.7s", duration: "5s", drift: "-24px" },
  { left: "58%", delay: "-1.7s", duration: "4.6s", drift: "43px" },
  { left: "66%", delay: "-3.6s", duration: "5.2s", drift: "-35px" },
  { left: "75%", delay: "-0.2s", duration: "4.3s", drift: "29px" },
  { left: "84%", delay: "-2.4s", duration: "4.9s", drift: "-44px" },
  { left: "93%", delay: "-1.1s", duration: "4.7s", drift: "27px" },
] as const;

export function LiveDealCelebration({
  event,
  amount,
  audioUnlocked,
  onUnlockAudio,
}: {
  event: CelebrationEvent;
  amount: string;
  audioUnlocked: boolean;
  onUnlockAudio: () => void;
}) {
  const longName = event.display_name.length > 34;
  const longCarrier = (event.carrier?.length ?? 0) > 36;

  return (
    <section
      role="status"
      aria-live="assertive"
      aria-label="New deal celebration"
      className="fixed inset-0 z-[200] flex h-dvh items-center justify-center overflow-hidden bg-[#02070d]/76 px-4 py-4 text-center backdrop-blur-[2px] sm:px-8 sm:py-6"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {MONEY_PARTICLES.map((particle, index) => (
          <span
            key={particle.left + particle.delay}
            className={styles.moneyParticle}
            style={{
              left: particle.left,
              animationDelay: particle.delay,
              animationDuration: particle.duration,
              "--live-money-drift": particle.drift,
            } as React.CSSProperties}
          >
            <span className={styles.moneyBill}>$</span>
            {index % 3 === 0 ? <span className={styles.moneyCoin}>$</span> : null}
          </span>
        ))}
      </div>

      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(44,196,255,0.11),transparent_42%),radial-gradient(circle_at_50%_62%,rgba(197,255,74,0.08),transparent_32%)]" />

      <div className={styles.celebrationPanel}>
        <div aria-hidden="true" className={styles.panelGlow} />
        <div className={styles.panelContent}>
          <p className="text-[clamp(0.68rem,1.35vw,1rem)] font-black uppercase tracking-[0.42em] text-cyan-100/80">
            <span aria-hidden="true" className="mr-2">🚨</span>
            Deal Closed
          </p>

          <h2
            className={
              "mx-auto mt-[clamp(0.65rem,2vh,1.4rem)] max-w-[96%] break-words font-black leading-[0.92] tracking-[-0.045em] text-white " +
              (longName ? styles.celebrationNameLong : styles.celebrationName)
            }
          >
            {event.display_name}
          </h2>

          <div className="mx-auto mt-[clamp(0.8rem,2.8vh,1.8rem)] flex max-w-[96%] flex-wrap items-baseline justify-center gap-x-[clamp(0.45rem,1.4vw,1rem)] gap-y-1">
            <span className={styles.celebrationAmount}>{amount}</span>
            {event.carrier ? (
              <>
                <span aria-hidden="true" className="text-[clamp(1.4rem,3.8vw,3.5rem)] font-black text-white/35">·</span>
                <span className={longCarrier ? styles.celebrationCarrierLong : styles.celebrationCarrier}>
                  {event.carrier}
                </span>
              </>
            ) : null}
          </div>

          <p className="mt-[clamp(0.6rem,1.8vh,1rem)] text-[clamp(0.58rem,1vw,0.78rem)] font-semibold uppercase tracking-[0.28em] text-white/35">
            Submitted AP
          </p>
        </div>
      </div>

      {!audioUnlocked ? (
        <button
          type="button"
          onClick={onUnlockAudio}
          className="absolute bottom-4 right-4 z-20 rounded-full border border-white/15 bg-black/65 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/65 backdrop-blur transition hover:border-cyan-300/45 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-300/60 sm:bottom-6 sm:right-6"
        >
          Enable sound · OK / click
        </button>
      ) : null}
    </section>
  );
}
