"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadHeadshot } from "@/lib/actions/headshot";
import { Avatar } from "@/components/Avatar";

const FRAME = 320; // on-screen crop frame, px
const OUT = 512; // exported square, px

const DO_LIST = [
  "Clear view of your face",
  "Well lit, looking at the camera",
  "Plain, uncluttered background",
  "Dressed like it is a business card",
];
const DONT_LIST = [
  "No sunglasses, hats, or logos",
  "No group shots or pets",
  "No filters or joke photos",
  "Nothing you would not show a client",
];

type Loaded = { src: string; naturalW: number; naturalH: number; baseScale: number };

export function HeadshotUpload({
  currentName,
  currentPhotoUrl,
}: {
  currentName: string;
  currentPhotoUrl: string | null;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgElRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [zoom, setZoom] = useState(1); // multiplier on baseScale
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // image top-left within frame
  const [understood, setUnderstood] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scale = loaded ? loaded.baseScale * zoom : 1;

  // Keep the image covering the frame no matter the zoom/drag.
  const clamp = useCallback(
    (x: number, y: number, s: number, l: Loaded) => {
      const w = l.naturalW * s;
      const h = l.naturalH * s;
      const minX = FRAME - w;
      const minY = FRAME - h;
      return {
        x: Math.min(0, Math.max(minX, x)),
        y: Math.min(0, Math.max(minY, y)),
      };
    },
    [],
  );

  const onPickFile = useCallback((f: File | null) => {
    setError(null);
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Please choose an image file (JPG, PNG, or WebP).");
      return;
    }
    const src = URL.createObjectURL(f);
    const img = new window.Image();
    img.onload = () => {
      const baseScale = Math.max(FRAME / img.naturalWidth, FRAME / img.naturalHeight);
      imgElRef.current = img;
      const l: Loaded = { src, naturalW: img.naturalWidth, naturalH: img.naturalHeight, baseScale };
      setLoaded(l);
      setZoom(1);
      const w = img.naturalWidth * baseScale;
      const h = img.naturalHeight * baseScale;
      setOffset({ x: (FRAME - w) / 2, y: (FRAME - h) / 2 });
    };
    img.src = src;
  }, []);

  const onZoom = useCallback(
    (z: number) => {
      setZoom(z);
      if (!loaded) return;
      const s = loaded.baseScale * z;
      // Re-center around the frame middle as zoom changes, then clamp.
      setOffset((prev) => clamp(prev.x, prev.y, s, loaded));
    },
    [loaded, clamp],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (!loaded) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !loaded) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    setOffset(clamp(dragRef.current.ox + dx, dragRef.current.oy + dy, scale, loaded));
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  const buildBlob = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const img = imgElRef.current;
      if (!img || !loaded) return resolve(null);
      const canvas = document.createElement("canvas");
      canvas.width = OUT;
      canvas.height = OUT;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      const ratio = OUT / FRAME;
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, OUT, OUT);
      ctx.drawImage(
        img,
        offset.x * ratio,
        offset.y * ratio,
        loaded.naturalW * scale * ratio,
        loaded.naturalH * scale * ratio,
      );
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9);
    });
  }, [loaded, offset, scale]);

  const onSubmit = useCallback(async () => {
    if (!loaded || !understood || submitting) return;
    setSubmitting(true);
    setError(null);
    const blob = await buildBlob();
    if (!blob) {
      setError("We could not prepare that image. Please try another photo.");
      setSubmitting(false);
      return;
    }
    const fd = new FormData();
    fd.append("photo", new File([blob], "headshot.jpg", { type: "image/jpeg" }));
    const res = await uploadHeadshot(fd);
    if (!res.ok) {
      setError(res.error);
      setSubmitting(false);
      return;
    }
    router.refresh();
  }, [loaded, understood, submitting, buildBlob, router]);

  return (
    <div className="grid gap-8 md:grid-cols-[320px_1fr]">
      {/* Left: crop box + current photo */}
      <div>
        <div
          className="relative overflow-hidden rounded-2xl border border-hairline bg-card-hi"
          style={{ width: FRAME, height: FRAME, maxWidth: "100%" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {loaded ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={loaded.src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute select-none"
              style={{
                left: offset.x,
                top: offset.y,
                width: loaded.naturalW * scale,
                height: loaded.naturalH * scale,
                maxWidth: "none",
              }}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-center">
              <Avatar name={currentName} photoUrl={currentPhotoUrl} className="h-20 w-20 text-2xl ring-1 ring-hairline" />
              <p className="px-6 text-sm text-mute">Choose a photo to crop it into a clean square.</p>
            </div>
          )}
          {loaded ? (
            <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-ink/10" />
          ) : null}
        </div>

        {loaded ? (
          <div className="mt-4">
            <label className="mb-1 block text-xs text-mute">Drag to reposition. Zoom:</label>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => onZoom(Number(e.target.value))}
              className="w-full"
            />
          </div>
        ) : null}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="mt-4 w-full rounded-xl border border-hairline bg-card px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-card-hi"
        >
          {loaded ? "Choose a different photo" : "Choose a photo"}
        </button>
      </div>

      {/* Right: guidance, sample, rule, submit */}
      <div className="min-w-0">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-hairline bg-card p-4">
            <p className="text-sm font-semibold text-ink">Do</p>
            <ul className="mt-2 space-y-1.5 text-sm text-mute">
              {DO_LIST.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-hairline bg-card p-4">
            <p className="text-sm font-semibold text-ink">Don&apos;t</p>
            <ul className="mt-2 space-y-1.5 text-sm text-mute">
              {DONT_LIST.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-hairline bg-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/headshot-sample.png"
            alt="Good headshot versus bad headshot: a clear business portrait next to one with a hat and sunglasses"
            className="h-auto w-full"
          />
        </div>

        <div className="mt-4 rounded-2xl border border-hairline bg-card p-4">
          <p className="text-sm font-semibold text-ink">No professional headshot?</p>
          <p className="mt-1 text-sm text-mute">
            Just use AI to make one. Don&apos;t overthink this.
          </p>
        </div>

        <label className="mt-5 flex items-start gap-3 rounded-2xl border border-hairline bg-card p-4">
          <input
            type="checkbox"
            checked={understood}
            onChange={(e) => setUnderstood(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <span className="text-sm text-ink">
            I understand that joke, fake, or inappropriate photos will be removed, and can get my
            account suspended or deleted.
          </span>
        </label>

        {error ? <p className="mt-3 text-sm text-warn">{error}</p> : null}

        <button
          type="button"
          disabled={!loaded || !understood || submitting}
          onClick={onSubmit}
          className="mt-4 w-full max-w-[320px] rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-black transition enabled:hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Saving..." : "Submit photo for review"}
        </button>
        <p className="mt-2 text-xs text-mute">
          Your photo goes live right away and is reviewed shortly after. Until it is approved, your
          circle shows your initials.
        </p>
      </div>
    </div>
  );
}
