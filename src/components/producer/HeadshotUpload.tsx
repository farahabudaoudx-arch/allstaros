"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadHeadshot } from "@/lib/actions/headshot";
import { initialsFor } from "@/lib/headshots/initials";

const FRAME = 320; // on-screen crop frame, px
const OUT = 512; // exported square, px

const DO_LIST = [
  "Clear view of your face",
  "Well lit, looking at the camera",
  "Plain, uncluttered background",
  "Dressed like you run a business",
];
const DONT_LIST = [
  "No sunglasses, hats, or logos",
  "No group shots or pets",
  "No filters or joke photos",
  "Nothing you wouldn't show a client",
];

type Loaded = { src: string; naturalW: number; naturalH: number; baseScale: number };

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0 text-green-600" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.3 3.3 6.8-6.8a1 1 0 0 1 1.4 0Z" clipRule="evenodd" />
    </svg>
  );
}
function XIcon() {
  return (
    <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0 text-red-500" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M6.2 6.2a1 1 0 0 1 1.4 0L10 8.6l2.4-2.4a1 1 0 1 1 1.4 1.4L11.4 10l2.4 2.4a1 1 0 0 1-1.4 1.4L10 11.4l-2.4 2.4a1 1 0 0 1-1.4-1.4L8.6 10 6.2 7.6a1 1 0 0 1 0-1.4Z" clipRule="evenodd" />
    </svg>
  );
}

export function HeadshotUpload({
  currentName,
  currentPhotoUrl,
  heading = "Add your headshot to continue",
  rejectionReason = null,
}: {
  currentName: string;
  currentPhotoUrl: string | null;
  heading?: string;
  rejectionReason?: string | null;
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
      ctx.fillStyle = "#fff";
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
    <div className="mx-auto w-full max-w-2xl rounded-3xl bg-white p-6 text-neutral-900 md:p-8">
      <h2 className="text-2xl font-bold tracking-[-0.02em] md:text-[28px]">{heading}</h2>
      <p className="mt-3 text-[15px] leading-relaxed text-neutral-600">
        On the OS, every builder and producer uses a real, professional headshot, so our
        leaderboards, future newsletters, and team pages show real faces. Upload yours below and
        we&apos;ll review it.
      </p>

      {/* AI note, kept near the top */}
      <div className="mt-5 rounded-2xl bg-neutral-100 p-4">
        <p className="text-sm font-semibold">Don&apos;t have a professional headshot?</p>
        <p className="mt-1 text-sm text-neutral-600">Just use AI to make one. Don&apos;t overthink this.</p>
      </div>

      {rejectionReason ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-700">Your last photo wasn&apos;t approved</p>
          <p className="mt-1 text-sm text-neutral-700">Reason: {rejectionReason}</p>
          <p className="mt-1 text-sm text-neutral-500">Please upload a new one that follows the guidance below.</p>
        </div>
      ) : null}

      {/* Do / Don't */}
      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <p className="text-sm font-bold">Do</p>
          <ul className="mt-3 space-y-2.5">
            {DO_LIST.map((d) => (
              <li key={d} className="flex items-start gap-2 text-sm text-neutral-700">
                <CheckIcon />
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-sm font-bold">Don&apos;t</p>
          <ul className="mt-3 space-y-2.5">
            {DONT_LIST.map((d) => (
              <li key={d} className="flex items-start gap-2 text-sm text-neutral-700">
                <XIcon />
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Sample image */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-neutral-200">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/headshot-sample.png"
          alt="Good headshot versus bad headshot: a clear business portrait next to one with a hat and sunglasses"
          className="h-auto w-full"
        />
      </div>

      {/* Upload */}
      <div className="mt-8">
        <p className="text-sm font-bold">Upload your photo here</p>
        <div className="mt-4 flex flex-col items-center">
          <div
            className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100"
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
                {currentPhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={currentPhotoUrl} alt="" className="h-20 w-20 rounded-full object-cover" />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-neutral-200 text-2xl font-semibold text-neutral-500">
                    {initialsFor(currentName)}
                  </div>
                )}
                <p className="px-6 text-sm text-neutral-500">Choose a photo to crop it into a clean square.</p>
              </div>
            )}
          </div>

          {loaded ? (
            <div className="mt-4 w-full max-w-[320px]">
              <label className="mb-1 block text-xs text-neutral-500">Drag to reposition. Zoom:</label>
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
            className="mt-4 w-full max-w-[320px] rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
          >
            {loaded ? "Choose a different photo" : "Choose a photo"}
          </button>
        </div>
      </div>

      {/* Rule checkbox */}
      <label className="mt-6 flex items-start gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
        <input
          type="checkbox"
          checked={understood}
          onChange={(e) => setUnderstood(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-neutral-900"
        />
        <span className="text-sm text-neutral-800">
          I understand that joke, fake, or inappropriate photos will be removed, and can get my
          account suspended or deleted.
        </span>
      </label>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      <button
        type="button"
        disabled={!loaded || !understood || submitting}
        onClick={onSubmit}
        className="mt-4 w-full rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white transition enabled:hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting ? "Saving..." : "Submit photo for review"}
      </button>
    </div>
  );
}
