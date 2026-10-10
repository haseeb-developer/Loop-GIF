"use client";
import { useEffect, useId, useRef, useState } from "react";
import { formatTime, parseTime } from "@/lib/format";
import * as R from "@/lib/range";
import { Button, cx } from "./ui";
import { FitIcon, ZoomInIcon } from "./icons";

/* ---------------------------------------------------------------- time input */

function TimeInput({ label, value, onCommit, disabled, action, hint }: {
  label: string; value: number; onCommit: (t: number) => void; disabled?: boolean;
  action?: { label: string; onClick: () => void }; hint?: string;
}) {
  const id = useId();
  const [text, setText] = useState(formatTime(value));
  const [focused, setFocused] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const stepped = useRef(false); // a keyboard nudge should show the (possibly clamped) result straight away

  useEffect(() => {
    if (!focused || stepped.current) { setText(formatTime(value)); setInvalid(false); stepped.current = false; }
  }, [value, focused]);

  function commit(): void {
    const t = parseTime(text);
    if (t === null) { setInvalid(true); return; }
    setInvalid(false);
    onCommit(t);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { commit(); e.currentTarget.blur(); }
    else if (e.key === "Escape") { setText(formatTime(value)); setInvalid(false); e.currentTarget.blur(); }
    else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const step = e.shiftKey ? 1 : e.altKey ? 0.01 : 0.1;
      const cur = parseTime(text) ?? value;
      stepped.current = true;
      const next = R.toMs(Math.max(0, cur + (e.key === "ArrowUp" ? step : -step)));
      setText(formatTime(next));
      onCommit(next);
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm text-dim">{label}</label>
        {action && (
          <button type="button" onClick={action.onClick} disabled={disabled}
            className="rounded px-1 text-xs text-faint transition duration-150 hover:text-accent disabled:pointer-events-none disabled:opacity-40">
            {action.label}
          </button>
        )}
      </div>
      <input id={id} value={text} disabled={disabled} inputMode="decimal" autoComplete="off" spellCheck={false}
        aria-invalid={invalid} aria-describedby={invalid ? `${id}-e` : undefined}
        onChange={(e) => { setText(e.target.value); setInvalid(false); }}
        onFocus={(e) => { setFocused(true); e.currentTarget.select(); }}
        onBlur={() => { setFocused(false); commit(); }}
        onKeyDown={onKeyDown}
        className={cx("h-10 w-full rounded-lg border bg-raised px-3 font-mono text-sm tabular-nums transition duration-150",
          "hover:border-line-strong focus:border-accent focus:outline-none disabled:opacity-50",
          invalid ? "border-danger/70" : "border-line")} />
      {invalid ? <p id={`${id}-e`} className="text-xs text-danger">Use m:ss.mmm or seconds, like 1:23.450 or 83.45</p>
        : hint ? <p className="text-xs text-faint">{hint}</p> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- timeline */

type Drag = { kind: "start" | "end" | "body" | "seek"; lastX: number; acc: number; orig: R.Range };

export interface RangeSelectorProps {
  duration: number;
  range: R.Range;
  minClip: number;
  maxClip: number;
  playhead: number;
  disabled?: boolean;
  onChange: (r: R.Range) => void;
  /** Called while a handle moves, so the preview can show the frame under it. */
  onScrub: (t: number) => void;
  /** Called when the user places the playhead. */
  onSeek: (t: number) => void;
}

export function RangeSelector({ duration, range, minClip, maxClip, playhead, disabled, onChange, onScrub, onSeek }: RangeSelectorProps) {
  const L: R.Limits = { duration, minClip, maxClip };
  const minSpan = Math.min(duration, 1);
  const [view, setView] = useState<R.View>({ v0: 0, v1: duration });
  const [dragging, setDragging] = useState<Drag["kind"] | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const drag = useRef<Drag | null>(null);

  useEffect(() => { setView({ v0: 0, v1: duration }); }, [duration]);

  // Ctrl/⌘ + wheel (and trackpad pinch) zooms around the cursor; horizontal scroll pans.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const rect = el.getBoundingClientRect();
      const v = viewRef.current;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const anchor = v.v0 + R.clamp((e.clientX - rect.left) / rect.width, 0, 1) * (v.v1 - v.v0);
        setView(R.zoomView(v, Math.exp(e.deltaY * 0.0025), anchor, duration, minSpan));
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        setView(R.panView(v, (e.deltaX / rect.width) * (v.v1 - v.v0), duration));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [duration, minSpan]);

  const span = view.v1 - view.v0;
  const timeAt = (clientX: number) => {
    const rect = trackRef.current!.getBoundingClientRect();
    return view.v0 + R.clamp((clientX - rect.left) / rect.width, 0, 1) * span;
  };

  function begin(kind: Drag["kind"], e: React.PointerEvent) {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { kind, lastX: e.clientX, acc: 0, orig: range };
    setDragging(kind);
    if (kind === "seek") onSeek(timeAt(e.clientX));
  }

  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (d.kind === "seek") { onSeek(timeAt(e.clientX)); return; }
    const rect = trackRef.current!.getBoundingClientRect();
    d.acc += ((e.clientX - d.lastX) / rect.width) * span * (e.shiftKey ? 0.1 : 1); // Shift = 10x finer
    d.lastX = e.clientX;
    if (d.kind === "start") { const r = R.setStart(d.orig, d.orig.start + d.acc, L); onChange(r); onScrub(r.start); }
    else if (d.kind === "end") { const r = R.setEnd(d.orig, d.orig.end + d.acc, L); onChange(r); onScrub(r.end); }
    else { const r = R.shiftRange(d.orig, d.acc, L); onChange(r); onScrub(r.start); }
  }

  function finish(e: React.PointerEvent) {
    const d = drag.current;
    drag.current = null;
    setDragging(null);
    if (d?.kind === "body" && Math.abs(d.acc) < 1e-9) onSeek(timeAt(e.clientX)); // a click, not a drag
  }

  function onHandleKey(kind: "start" | "end", e: React.KeyboardEvent) {
    const step = e.shiftKey ? 1 : e.altKey ? 0.01 : 0.1;
    const cur = kind === "start" ? range.start : range.end;
    const dt: Record<string, number> = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step, PageDown: -10, PageUp: 10 };
    let target: number | null = e.key in dt ? cur + dt[e.key] : null;
    if (e.key === "Home") target = kind === "start" ? 0 : range.start + minClip;
    if (e.key === "End") target = kind === "start" ? range.end - minClip : duration;
    if (target === null) return;
    e.preventDefault();
    const r = kind === "start" ? R.setStart(range, target, L) : R.setEnd(range, target, L);
    onChange(r);
    onScrub(kind === "start" ? r.start : r.end);
  }

  function onWrapperKey(e: React.KeyboardEvent) {
    if ((e.target as HTMLElement).tagName === "INPUT" || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "i") { const r = R.setStart(range, playhead, L); onChange(r); onScrub(r.start); }
    if (e.key === "o") { const r = R.setEnd(range, playhead, L); onChange(r); onScrub(r.end); }
  }

  const pct = (t: number) => R.toPct(t, view);
  const inView = (t: number) => t >= view.v0 - 1e-6 && t <= view.v1 + 1e-6;
  const selLeft = R.clamp(pct(range.start), 0, 100);
  const selRight = R.clamp(pct(range.end), 0, 100);
  const zoom = duration / span;
  const tickList = R.ticks(view, 7);
  const fine = span < 20;

  const renderHandle = (kind: "start" | "end") => {
    const t = kind === "start" ? range.start : range.end;
    if (!inView(t)) return null;
    const lo = kind === "start" ? Math.max(0, range.end - maxClip) : range.start + minClip;
    const hi = kind === "start" ? range.end - minClip : Math.min(duration, range.start + maxClip);
    return (
      <div key={kind} role="slider" tabIndex={disabled ? -1 : 0} aria-label={kind === "start" ? "Start of clip" : "End of clip"}
        aria-orientation="horizontal" aria-valuemin={lo} aria-valuemax={hi} aria-valuenow={t} aria-valuetext={formatTime(t)}
        onKeyDown={(e) => onHandleKey(kind, e)} onPointerDown={(e) => begin(kind, e)}
        style={{ left: `${pct(t)}%` }}
        className={cx("group absolute bottom-0 top-3 z-20 flex w-4 -translate-x-1/2 cursor-ew-resize items-center justify-center",
          disabled && "pointer-events-none opacity-50")}>
        <span className={cx("h-full w-[7px] rounded-[3px] bg-accent transition duration-150 group-hover:brightness-110",
          "group-focus-visible:ring-2 group-focus-visible:ring-fg", dragging === kind && "scale-x-125 brightness-110")} />
      </div>
    );
  };

  return (
    <div className="space-y-5" onKeyDown={onWrapperKey}>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-fg">Clip range</p>
          <div className="flex items-center gap-1">
            <span className="mr-1 font-mono text-xs text-faint">{zoom < 1.05 ? "Full video" : `${zoom.toFixed(zoom < 10 ? 1 : 0)}×`}</span>
            <Button variant="ghost" size="sm" onClick={() => setView(R.fitView(range, duration, minSpan))} disabled={disabled}
              title="Zoom to the selection"><ZoomInIcon />Fit</Button>
            <Button variant="ghost" size="sm" onClick={() => setView({ v0: 0, v1: duration })} disabled={disabled || zoom < 1.05}
              title="Show the whole video"><FitIcon />All</Button>
          </div>
        </div>

        <div className={cx("timeline-track overflow-hidden rounded-lg border bg-raised px-[10px] transition duration-150",
          dragging ? "border-line-strong" : "border-line", disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer")}
          onPointerDown={(e) => begin("seek", e)} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}>
          <div ref={trackRef} className="relative h-[76px]">
            {tickList.map((t) => (
              <div key={t} className="pointer-events-none absolute top-0 -translate-x-1/2" style={{ left: `${pct(t)}%` }}>
                <div className="mx-auto h-2 w-px bg-line-strong" />
                <span className="mt-0.5 block whitespace-nowrap font-mono text-[10px] text-faint">{formatTime(t, fine)}</span>
              </div>
            ))}
            {selRight > selLeft && (
              <div onPointerDown={(e) => begin("body", e)}
                className={cx("absolute bottom-0 top-3 z-10 border-y border-accent/70 bg-accent/[0.16] transition-colors duration-150 hover:bg-accent/[0.22]",
                  dragging === "body" ? "cursor-grabbing" : "cursor-grab")}
                style={{ left: `${selLeft}%`, width: `${selRight - selLeft}%` }} />
            )}
            {renderHandle("start")}
            {renderHandle("end")}
            {inView(playhead) && (
              <div className="pointer-events-none absolute bottom-0 top-0 z-30 w-px bg-fg" style={{ left: `${pct(playhead)}%` }}>
                <span className="absolute -left-[4px] top-0 h-0 w-0 border-x-[4.5px] border-t-[6px] border-x-transparent border-t-fg" />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <TimeInput label="Start" value={range.start} disabled={disabled}
          action={{ label: "Use playhead", onClick: () => { const r = R.setStart(range, playhead, L); onChange(r); onScrub(r.start); } }}
          onCommit={(t) => { const r = R.setStart(range, t, L); onChange(r); onScrub(r.start); }} />
        <TimeInput label="End" value={range.end} disabled={disabled}
          action={{ label: "Use playhead", onClick: () => { const r = R.setEnd(range, playhead, L); onChange(r); onScrub(r.end); } }}
          onCommit={(t) => { const r = R.setEnd(range, t, L); onChange(r); onScrub(r.end); }} />
        <div className="col-span-2 sm:col-span-1">
          <TimeInput label="Length" value={range.end - range.start} disabled={disabled} hint={`Max ${maxClip}s`}
            onCommit={(t) => { const r = R.setLength(range, t, L); onChange(r); onScrub(r.end); }} />
        </div>
      </div>
      <p className="text-xs leading-relaxed text-faint">
        Drag the handles or the whole clip. Hold <kbd className="font-mono text-dim">Shift</kbd> for fine control,
        use arrow keys on a focused handle, <kbd className="font-mono text-dim">I</kbd> / <kbd className="font-mono text-dim">O</kbd> to
        set start and end at the playhead, and <kbd className="font-mono text-dim">Ctrl</kbd>/<kbd className="font-mono text-dim">⌘</kbd> + scroll to zoom.
      </p>
    </div>
  );
}
