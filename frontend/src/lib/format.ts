export function bytes(n: number | null | undefined): string {
  if (n == null) return "–";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(n < 10 * 1024 ** 2 ? 1 : 0)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

/** Human duration: 4.5s, 2m 05s, 1h 12m */
export function seconds(s: number): string {
  if (s < 90) return `${Number(s.toFixed(1))}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, "0")}s`;
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;
}

/** Timecode for editing: 0:05.250, or 1:02:03.250 once past an hour. Milliseconds optional. */
export function formatTime(t: number, ms = true): string {
  const total = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(total / 3_600_000);
  const m = Math.floor((total % 3_600_000) / 60_000);
  const s = Math.floor((total % 60_000) / 1000);
  const frac = String(total % 1000).padStart(3, "0");
  const base = h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
  return ms ? `${base}.${frac}` : base;
}

/** Parses "83.5", "1:23.5", "1:02:03.250", "90s". Returns seconds, or null if it isn't a time. */
export function parseTime(input: string): number | null {
  const text = input.trim().toLowerCase().replace(/s$/, "").trim();
  if (!text) return null;
  const parts = text.split(":");
  if (parts.length > 3) return null;
  let total = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const last = i === parts.length - 1;
    if (!(last ? /^\d+(\.\d*)?$|^\.\d+$/ : /^\d+$/).test(p)) return null;
    total = total * 60 + Number(p);
  }
  return Number.isFinite(total) ? Math.round(total * 1000) / 1000 : null;
}

export function ago(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 45) return "just now";
  if (d < 3600) return `${Math.max(1, Math.floor(d / 60))}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  if (d < 86400 * 30) return `${Math.floor(d / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Bucket for the history timeline. */
export function dayGroup(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "This week";
  if (days < 30) return "This month";
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function eta(secondsLeft: number): string {
  if (!Number.isFinite(secondsLeft) || secondsLeft < 0) return "";
  if (secondsLeft < 5) return "a few seconds";
  if (secondsLeft < 90) return `${Math.round(secondsLeft)}s`;
  if (secondsLeft < 5400) return `${Math.round(secondsLeft / 60)} min`;
  return `${(secondsLeft / 3600).toFixed(1)} h`;
}

export function hoursLeft(iso: string | null): string | null {
  if (!iso) return null;
  const h = (new Date(iso).getTime() - Date.now()) / 3_600_000;
  if (h <= 0) return "expired";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} days`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy"); ta.remove();
    return ok;
  }
}

export function slugify(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, "").slice(0, 40);
}
