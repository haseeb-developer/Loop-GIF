"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { Badge, Button, Spinner, cx } from "./ui";
import { FilmIcon, PauseIcon, PlayIcon, SkipEndIcon, SkipStartIcon } from "./icons";

export interface Seek { t: number } // a new object means "show this time now"

export interface MonitorProps {
  /** Object URL of the file on this device. Plays instantly, no server round trip. */
  localUrl: string | null;
  /** A ready source on the server. Used for frame previews when the browser can't play the file. */
  sourceId: string | null;
  start: number;
  end: number;
  duration: number | null;
  seek: Seek;
  onPlayhead: (t: number) => void;
  onSeek: (t: number) => void;
  onMeta: (m: { duration: number; width: number; height: number }) => void;
}

export function Monitor({ localUrl, sourceId, start, end, duration, seek, onPlayhead, onSeek, onMeta }: MonitorProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const playheadCb = useRef(onPlayhead);
  playheadCb.current = onPlayhead;

  const mode: "video" | "frames" | "pending" = localUrl && !failed ? "video" : sourceId ? "frames" : "pending";
  useEffect(() => { setFailed(false); setPlaying(false); }, [localUrl]);

  // Show the requested time: pause and jump (video), or fetch that frame (server).
  useEffect(() => {
    setTime(seek.t);
    const v = video.current;
    if (mode === "video" && v) { v.pause(); try { v.currentTime = seek.t; } catch { /* not seekable yet */ } }
  }, [seek, mode]);

  // Loop the selection while playing.
  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = 0;
    const tick = (ts: number) => {
      const v = video.current;
      if (v) {
        if (v.currentTime >= end || v.currentTime < start - 0.05) v.currentTime = start;
        if (ts - last > 40) { last = ts; setTime(v.currentTime); playheadCb.current(v.currentTime); }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, start, end]);

  function toggle() {
    const v = video.current;
    if (!v) return;
    if (v.paused) {
      if (v.currentTime < start || v.currentTime >= end) v.currentTime = start;
      void v.play().catch(() => setFailed(true));
    } else v.pause();
  }

  // Frame mode: debounce so dragging a handle doesn't queue a request per pixel.
  const [frameT, setFrameT] = useState(seek.t);
  useEffect(() => { const id = setTimeout(() => setFrameT(seek.t), 120); return () => clearTimeout(id); }, [seek]);
  const frameSrc = mode === "frames" && sourceId ? api.frameUrl(sourceId, frameT) : null;
  const [shown, setShown] = useState<string | null>(null);
  const [frameError, setFrameError] = useState(false);
  useEffect(() => { setFrameError(false); }, [frameSrc]);

  return (
    <div className="space-y-2.5">
      <div className="relative flex min-h-[220px] items-center justify-center overflow-hidden rounded-xl border border-line bg-black">
        {mode === "video" && (
          <video ref={video} src={localUrl ?? undefined} muted loop playsInline preload="auto" onClick={toggle}
            className="max-h-[62vh] w-full cursor-pointer object-contain"
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (!v.videoWidth) return setFailed(true); // audio-only or a codec this browser can't draw
              onMeta({ duration: v.duration, width: v.videoWidth, height: v.videoHeight });
              v.currentTime = start;
            }}
            onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setFailed(true)} />
        )}
        {mode === "frames" && frameSrc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={frameSrc} alt={`Frame at ${formatTime(frameT)}`} className="max-h-[62vh] w-full object-contain"
            onLoad={() => setShown(frameSrc)} onError={() => setFrameError(true)} />
        )}
        {mode === "frames" && shown !== frameSrc && !frameError && (
          <div className="absolute inset-0 grid place-items-center bg-black/40"><Spinner className="h-5 w-5 text-dim" /></div>
        )}
        {mode === "frames" && frameError && <p className="absolute text-sm text-dim">Couldn&apos;t load this frame.</p>}
        {mode === "pending" && (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-dim">
            <FilmIcon className="h-6 w-6" />
            <p>Your browser can&apos;t play this format.</p>
            <p className="text-xs text-faint">Frame previews appear once the upload finishes.</p>
          </div>
        )}
        {mode === "video" && !playing && (
          <button type="button" onClick={toggle} aria-label="Play selection"
            className="absolute grid h-14 w-14 place-items-center rounded-full border border-fg/30 bg-black/50 text-fg backdrop-blur-sm transition duration-150 hover:scale-105 hover:bg-black/70">
            <PlayIcon className="h-6 w-6" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        {mode === "video" && (
          <Button variant="secondary" size="icon" onClick={toggle} aria-label={playing ? "Pause" : "Play selection"}>
            {playing ? <PauseIcon /> : <PlayIcon />}
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={() => onSeek(start)} aria-label="Jump to start of clip" title="Jump to start"><SkipStartIcon /></Button>
        <Button variant="ghost" size="icon" onClick={() => onSeek(Math.max(start, end - 0.04))} aria-label="Jump to end of clip" title="Jump to end"><SkipEndIcon /></Button>
        <span className={cx("ml-2 font-mono text-xs tabular-nums", playing ? "text-fg" : "text-dim")}>
          {formatTime(time)}{duration ? ` / ${formatTime(duration)}` : ""}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {mode === "frames" && <Badge>Frame preview</Badge>}
          {mode === "video" && <Badge tone="accent">Loops your selection</Badge>}
        </span>
      </div>
    </div>
  );
}
