"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { mediaUrl } from "@/lib/api";
import type { MediaItem } from "@/lib/types";
import { Icon } from "./ui";
import { cn } from "@/lib/utils";

export function VideoPlayer({ src, alt, className, autoAdvance, fit = "cover" }: { src: string; alt: string; className?: string; autoAdvance?: () => void; fit?: "cover" | "contain" }) {
  const poster = /\/static\/demo\/clip_\d\.mp4$/.test(src) ? mediaUrl(src.replace(/\.mp4$/, ".jpg")) : undefined;
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  // autoplay-on-scroll
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && e.intersectionRatio > 0.6) v.play().catch(() => undefined); else v.pause();
    }, { threshold: [0, 0.6, 1] });
    io.observe(v);
    return () => io.disconnect();
  }, [src]);
  if (failed) {
    return (
      <div className={cn("relative flex h-full min-h-[280px] w-full flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-6 text-center text-white", className)}>
        <Icon name="video" className="mb-2 h-10 w-10 text-violet-400 opacity-80" />
        <p className="text-sm font-semibold">Video preview unavailable</p>
        <p className="mt-1 line-clamp-2 text-xs text-white/60">{alt}</p>
      </div>
    );
  }
  return (
    <div className={cn("relative bg-black", className)}>
      <video ref={ref} src={mediaUrl(src)} poster={poster} muted={muted} loop={!autoAdvance} playsInline preload="metadata" aria-label={alt}
        onError={() => setFailed(true)}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={autoAdvance}
        onClick={() => (ref.current?.paused ? ref.current.play() : ref.current?.pause())} className={cn("h-full w-full", fit === "cover" ? "object-cover" : "object-contain")} />
      {!playing && <span className="pointer-events-none absolute inset-0 flex items-center justify-center"><span className="rounded-full bg-black/50 p-4 text-white"><Icon name="play" filled className="h-6 w-6" /></span></span>}
      <button onClick={(e) => { e.stopPropagation(); setMuted((m) => !m); }} aria-label={muted ? "Unmute video" : "Mute video"} className="absolute bottom-3 right-3 rounded-full bg-black/60 p-2 text-white transition hover:bg-black/80">
        <Icon name={muted ? "mute" : "sound"} className="h-4 w-4" />
      </button>
    </div>
  );
}

function bars(seed: string, n = 48): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const out: number[] = [];
  for (let i = 0; i < n; i++) { h = Math.imul(h ^ (h >>> 13), 1274126177); out.push(0.25 + ((h >>> 0) % 1000) / 1333); }
  return out;
}

export function AudioPlayer({ src, label }: { src: string; label: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const b = useMemo(() => bars(src), [src]);
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const pct = dur ? t / dur : 0;
  return (
    <div className="flex h-full w-full items-center gap-3 bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-4 text-white">
      <audio ref={ref} src={mediaUrl(src)} preload="metadata" onLoadedMetadata={(e) => setDur(e.currentTarget.duration)} onTimeUpdate={(e) => setT(e.currentTarget.currentTime)} onEnded={() => setPlaying(false)} aria-label={label} />
      <button onClick={() => { const a = ref.current; if (!a) return; if (a.paused) { a.play().catch(() => undefined); setPlaying(true); } else { a.pause(); setPlaying(false); } }}
        aria-label={playing ? "Pause audio" : "Play audio"} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-violet-700 transition active:scale-90">
        <Icon name={playing ? "pause" : "play"} filled className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex h-12 cursor-pointer items-center gap-[2px]" role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(t)} tabIndex={0}
          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); if (ref.current && dur) ref.current.currentTime = ((e.clientX - r.left) / r.width) * dur; }}
          onKeyDown={(e) => { if (ref.current && e.key === "ArrowRight") ref.current.currentTime += 5; if (ref.current && e.key === "ArrowLeft") ref.current.currentTime -= 5; }}>
          {b.map((h, i) => <span key={i} style={{ height: `${h * 100}%` }} className={cn("w-full rounded-full transition-colors", i / b.length <= pct ? "bg-white" : "bg-white/40")} />)}
        </div>
        <div className="mt-1 flex justify-between text-xs tabular-nums text-white/80"><span>{fmt(t)}</span><span>{dur ? fmt(dur) : "--:--"}</span></div>
      </div>
    </div>
  );
}

function SafeImg({ src, alt }: { src: string; alt: string }) {
  const [bad, setBad] = useState(false);
  if (bad) return <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-500/80 via-violet-500/80 to-fuchsia-500/80 text-white"><Icon name="image" className="h-10 w-10 opacity-80" /></div>;
  return <img src={src} alt={alt} loading="lazy" draggable={false} onError={() => setBad(true)} className="h-full w-full object-cover" />;
}

export function MediaCarousel({ media, alt, onDoubleLike }: { media: MediaItem[]; alt: string; onDoubleLike?: () => void }) {
  const [idx, setIdx] = useState(0);
  const [heart, setHeart] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const lastTap = useRef(0);

  const audioTrack = useMemo(() => media.find((m) => m.type === "audio"), [media]);
  const visualMedia = useMemo(() => media.filter((m) => m.type !== "audio"), [media]);
  const displayItems = visualMedia.length > 0 ? visualMedia : media;

  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioPlaying, setAudioPlaying] = useState(false);

  function like() { onDoubleLike?.(); setHeart(true); setTimeout(() => setHeart(false), 800); }
  function tap() { const n = Date.now(); if (n - lastTap.current < 300) like(); lastTap.current = n; }
  if (!media.length) return null;

  return (
    <div className="relative overflow-hidden bg-slate-100 dark:bg-slate-800" onDoubleClick={like} onTouchEnd={tap}>
      {visualMedia.length > 0 && audioTrack && (
        <>
          <audio
            ref={audioRef}
            src={mediaUrl(audioTrack.url)}
            preload="metadata"
            loop
            onEnded={() => setAudioPlaying(false)}
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const a = audioRef.current;
              if (!a) return;
              if (a.paused) {
                a.play().catch(() => undefined);
                setAudioPlaying(true);
              } else {
                a.pause();
                setAudioPlaying(false);
              }
            }}
            aria-label={audioPlaying ? "Pause soundtrack" : "Play soundtrack"}
            className="absolute bottom-3 left-3 z-20 flex items-center gap-1.5 rounded-full bg-black/75 px-3 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur-md transition hover:bg-black/90 active:scale-95"
          >
            <span className={cn("text-xs", audioPlaying && "animate-pulse")}>🎵</span>
            <span>{audioPlaying ? "Playing soundtrack" : "Soundtrack"}</span>
            <Icon name={audioPlaying ? "pause" : "play"} filled className="h-3 w-3 ml-0.5" />
          </button>
        </>
      )}
      <div ref={scroller} className="hide-scroll flex snap-x snap-mandatory overflow-x-auto"
        onScroll={(e) => setIdx(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
        {displayItems.map((m, i) => (
          <div key={i} className={cn("w-full shrink-0 snap-center", m.type === "audio" ? "h-32" : "aspect-[4/5] max-h-[640px]")}>
            {m.type === "image" ? <SafeImg src={mediaUrl(m.url)} alt={`${alt} (${i + 1} of ${displayItems.length})`} />
              : m.type === "video" ? <VideoPlayer src={m.url} alt={alt} className="h-full w-full" /> : <AudioPlayer src={m.url} label={alt} />}
          </div>))}
      </div>
      {heart && <span className="pointer-events-none absolute inset-0 flex items-center justify-center"><Icon name="heart" filled className="h-24 w-24 animate-bigheart text-white drop-shadow-lg" /></span>}
      {displayItems.length > 1 && (<>
        <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1" aria-hidden="true">{displayItems.map((_, i) => <span key={i} className={cn("h-1.5 w-1.5 rounded-full", i === idx ? "bg-white" : "bg-white/50")} />)}</div>
        <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white">{idx + 1}/{displayItems.length}</span>
        {idx > 0 && <button aria-label="Previous media" className="absolute left-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white sm:block" onClick={() => scroller.current?.scrollTo({ left: (idx - 1) * scroller.current.clientWidth, behavior: "smooth" })}><Icon name="back" className="h-4 w-4" /></button>}
        {idx < displayItems.length - 1 && <button aria-label="Next media" className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white sm:block" onClick={() => scroller.current?.scrollTo({ left: (idx + 1) * scroller.current.clientWidth, behavior: "smooth" })}><Icon name="chevron" className="h-4 w-4" /></button>}
      </>)}
    </div>
  );
}
