"use client";

import { useEffect, useRef } from "react";

/**
 * Background video that reliably autoplays on mobile.
 *
 * iOS only autoplays a video that is muted + inline at the moment it tries to
 * play. React has a long-standing quirk where the `muted` attribute is set as a
 * property but NOT serialized into the SSR HTML, so on first paint iOS sees a
 * non-muted video, blocks autoplay, and shows a tap-to-play button. We fix that
 * by forcing `muted` imperatively and calling play() once the media can play.
 */
export function HeroVideo({
  src,
  className,
}: {
  src: string;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    video.muted = true;
    video.defaultMuted = true;

    const tryPlay = () => {
      const p = video.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    };

    tryPlay();
    video.addEventListener("canplay", tryPlay, { once: true });
    return () => video.removeEventListener("canplay", tryPlay);
  }, []);

  return (
    <video
      ref={ref}
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      disablePictureInPicture
      className={className}
    >
      <source src={src} type="video/mp4" />
    </video>
  );
}
