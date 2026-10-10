/** Pure maths for the timeline: kept free of React so it can be tested on its own. */

export interface View { v0: number; v1: number }
export interface Range { start: number; end: number }

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const toMs = (t: number) => Math.round(t * 1000) / 1000;

const STEPS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14400];

/** Tick spacing (seconds) giving roughly `target` ticks across a span. */
export function niceStep(span: number, target = 8): number {
  const ideal = span / target;
  return STEPS.find((s) => s >= ideal) ?? STEPS[STEPS.length - 1];
}

export function ticks(view: View, target = 8): number[] {
  const step = niceStep(view.v1 - view.v0, target);
  const out: number[] = [];
  for (let t = Math.ceil(view.v0 / step) * step; t <= view.v1 + 1e-9; t += step) out.push(toMs(t));
  return out;
}

export function toPct(t: number, view: View): number {
  return ((t - view.v0) / (view.v1 - view.v0)) * 100;
}

/** View that frames the selection with breathing room, never narrower than `minSpan`. */
export function fitView(r: Range, duration: number, minSpan: number): View {
  const len = r.end - r.start;
  const span = Math.min(duration, Math.max(minSpan, len * 2.2));
  const center = (r.start + r.end) / 2;
  return keepInside({ v0: center - span / 2, v1: center + span / 2 }, duration);
}

export function keepInside(v: View, duration: number): View {
  const span = Math.min(v.v1 - v.v0, duration);
  const v0 = clamp(v.v0, 0, Math.max(0, duration - span));
  return { v0, v1: v0 + span };
}

/** Zoom by `factor` (<1 zooms in) keeping the time under `anchor` fixed on screen. */
export function zoomView(v: View, factor: number, anchor: number, duration: number, minSpan: number): View {
  const span = clamp((v.v1 - v.v0) * factor, Math.min(minSpan, duration), duration);
  const ratio = (anchor - v.v0) / (v.v1 - v.v0);
  const v0 = anchor - ratio * span;
  return keepInside({ v0, v1: v0 + span }, duration);
}

export function panView(v: View, dt: number, duration: number): View {
  return keepInside({ v0: v.v0 + dt, v1: v.v1 + dt }, duration);
}

export interface Limits { duration: number; minClip: number; maxClip: number }

/** Move the start edge; the end stays put. The clip is kept within [minClip, maxClip]. */
export function setStart(r: Range, value: number, L: Limits): Range {
  const lo = Math.max(0, r.end - L.maxClip);
  const hi = r.end - L.minClip;
  return { start: toMs(clamp(value, lo, Math.max(lo, hi))), end: r.end };
}

/** Move the end edge; the start stays put. */
export function setEnd(r: Range, value: number, L: Limits): Range {
  const lo = r.start + L.minClip;
  const hi = Math.min(L.duration, r.start + L.maxClip);
  return { start: r.start, end: toMs(clamp(value, Math.min(lo, hi), hi)) };
}

/** Slide the whole clip, keeping its length. */
export function shiftRange(r: Range, dt: number, L: Limits): Range {
  const len = r.end - r.start;
  const start = clamp(r.start + dt, 0, Math.max(0, L.duration - len));
  return { start: toMs(start), end: toMs(start + len) };
}

/** Change the clip's length from the start edge. */
export function setLength(r: Range, length: number, L: Limits): Range {
  return setEnd(r, r.start + length, L);
}

/** A sensible first selection for a video: up to 5s from the start. */
export function defaultRange(duration: number, L: Pick<Limits, "minClip" | "maxClip">): Range {
  return { start: 0, end: toMs(Math.min(duration, 5, L.maxClip)) };
}

/** Bring a range inside a (possibly shorter) real duration, e.g. after the server reports the exact length. */
export function fitRange(r: Range, L: Limits): Range {
  const end = Math.min(r.end, L.duration);
  const start = Math.min(r.start, Math.max(0, end - L.minClip));
  return setEnd({ start: Math.max(0, start), end }, end, L);
}
