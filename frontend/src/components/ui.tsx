"use client";
import Link from "next/link";
import { forwardRef, useEffect, useId, useRef, useState } from "react";
import { buttonClass, type ButtonSize, type ButtonVariant } from "@/lib/button";
import { copyText } from "@/lib/format";
import { CheckIcon, CopyIcon, MoreIcon, XIcon } from "./icons";
import { useToast } from "./Toast";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/* ------------------------------------------------------------------ buttons */

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cx("animate-spin", className)} fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity=".25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean }
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, className, children, disabled, type = "button", ...rest }, ref) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading} className={buttonClass(variant, size, className)} {...rest}>
      {loading && <Spinner />}{children}
    </button>
  );
});

export function LinkButton({ href, variant = "secondary", size = "md", className, children, ...rest }:
  { href: string; variant?: ButtonVariant; size?: ButtonSize } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return <Link href={href} className={buttonClass(variant, size, className)} {...rest}>{children}</Link>;
}

/* ------------------------------------------------------------------ inputs */

export function Field({ label, error, hint, className, ...props }:
  React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string | null; hint?: string }) {
  const id = useId();
  return (
    <div className={cx("space-y-1.5", className)}>
      <label htmlFor={id} className="text-sm text-dim">{label}</label>
      <input id={id} {...props} aria-invalid={!!error} aria-describedby={error || hint ? `${id}-d` : undefined}
        className={cx("h-10 w-full rounded-lg border bg-raised px-3 text-sm text-fg placeholder:text-faint transition duration-150",
          "hover:border-line-strong focus:border-accent focus:outline-none disabled:opacity-50",
          error ? "border-danger/70" : "border-line")} />
      {(error || hint) && <p id={`${id}-d`} className={cx("text-xs", error ? "text-danger" : "text-faint")}>{error || hint}</p>}
    </div>
  );
}

export function Slider({ label, value, min, max, step, onChange, format, disabled }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format: (v: number) => string; disabled?: boolean;
}) {
  const id = useId();
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm text-fg">{label}</label>
        <span className="font-mono text-xs text-dim">{format(value)}</span>
      </div>
      <input id={id} type="range" className="slider" min={min} max={Math.max(max, min)} step={step} value={value}
        disabled={disabled || max <= min} style={{ "--pct": `${pct}%` } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

export function Segmented<T extends string | number>({ label, value, options, onChange, disabled }: {
  label: string; value: T; options: { value: T; label: string; disabled?: boolean; title?: string }[];
  onChange: (v: T) => void; disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="space-y-2.5">
      {label && <div className="text-sm text-fg" id={id}>{label}</div>}
      <div role="radiogroup" aria-labelledby={label ? id : undefined} aria-label={label ? undefined : "Filter"} className="flex flex-wrap gap-1 rounded-lg border border-line bg-raised p-1">
        {options.map((o) => (
          <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === value} title={o.title}
            disabled={disabled || o.disabled} onClick={() => onChange(o.value)}
            className={cx("h-8 min-w-12 flex-1 rounded-md px-2 text-sm transition duration-150 disabled:pointer-events-none disabled:opacity-35",
              o.value === value ? "bg-hover text-fg shadow-[inset_0_0_0_1px_var(--color-line-strong)]" : "text-dim hover:text-fg")}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ feedback */

export function Progress({ value, indeterminate }: { value: number; indeterminate?: boolean }) {
  return (
    <div className="sprocket relative h-3 w-full overflow-hidden bg-line" role="progressbar"
      aria-valuenow={indeterminate ? undefined : Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      {indeterminate
        ? <div className="skeleton absolute inset-0 opacity-60" />
        : <div className="h-full bg-accent transition-[width] duration-200 ease-out" style={{ width: `${Math.min(100, value * 100)}%` }} />}
    </div>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "ok" | "warn" | "danger" | "accent"; children: React.ReactNode }) {
  const tones = {
    neutral: "border-line-strong text-dim", ok: "border-ok/40 text-ok", warn: "border-accent/40 text-accent",
    danger: "border-danger/40 text-danger", accent: "border-accent/50 bg-accent/10 text-accent",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4", tones[tone])}>{children}</span>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton rounded-lg", className)} aria-hidden="true" />;
}

export function Notice({ tone = "info", title, children, action }: {
  tone?: "info" | "warn" | "danger"; title?: string; children?: React.ReactNode; action?: React.ReactNode;
}) {
  const tones = { info: "border-line-strong", warn: "border-accent/40 bg-accent/[0.04]", danger: "border-danger/40 bg-danger/[0.04]" };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx("flex items-start gap-3 rounded-lg border p-3.5 text-sm", tones[tone])}>
      <div className="min-w-0 flex-1 space-y-0.5">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="text-dim">{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: {
  icon?: React.ReactNode; title: string; children?: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong px-6 py-20 text-center animate-fade-in">
      {icon && <span className="grid h-11 w-11 place-items-center rounded-full border border-line-strong text-dim">{icon}</span>}
      <p className="font-medium">{title}</p>
      {children && <p className="max-w-sm text-sm text-dim">{children}</p>}
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ dialog */

/** Built on the native <dialog>: focus trapping, Esc to close and inert background come from the browser. */
export function Dialog({ open, onClose, title, description, width = "480px", children }: {
  open: boolean; onClose: () => void; title: string; description?: string; width?: string; children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" aria-labelledby={id} style={{ "--modal-w": width } as React.CSSProperties}
      onClose={onClose} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {open && (
        <div className="flex max-h-[inherit] flex-col">
          <div className="flex items-start gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0 flex-1">
              <h2 id={id} className="text-base font-semibold tracking-tight">{title}</h2>
              {description && <p className="mt-0.5 text-sm text-dim">{description}</p>}
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><XIcon /></Button>
          </div>
          <div className="overflow-y-auto px-5 py-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = "Delete", busy }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: string; description: string; confirmLabel?: string; busy?: boolean;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title} width="420px">
      <p className="text-sm text-dim">{description}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="danger" onClick={onConfirm} loading={busy} autoFocus>{confirmLabel}</Button>
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ menu */

export type MenuItem = { label: string; icon?: React.ReactNode; onClick?: () => void; href?: string; danger?: boolean; disabled?: boolean } | "separator";

export function Menu({ label, items, icon, className, align = "right", header }: {
  label: string; items: MenuItem[]; icon?: React.ReactNode; className?: string; align?: "left" | "right"; header?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    list.current?.querySelector<HTMLElement>("[role=menuitem]:not([disabled])")?.focus();
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") { setOpen(false); root.current?.querySelector("button")?.focus(); return; }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const els = Array.from(list.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not([disabled])") ?? []);
    const i = els.indexOf(document.activeElement as HTMLElement);
    els[(i + (e.key === "ArrowDown" ? 1 : -1) + els.length) % els.length]?.focus();
  }

  const itemClass = (danger?: boolean) => cx(
    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition duration-150 disabled:pointer-events-none disabled:opacity-40",
    danger ? "text-danger hover:bg-danger/10" : "text-fg hover:bg-hover");

  return (
    <div ref={root} className={cx("relative", className)} onKeyDown={onKey}>
      <Button variant="ghost" size="icon" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {icon ?? <MoreIcon />}
      </Button>
      {open && (
        <div ref={list} role="menu" aria-label={label}
          className={cx("absolute top-full z-30 mt-1 min-w-52 rounded-lg border border-line-strong bg-raised p-1 shadow-2xl animate-pop",
            align === "right" ? "right-0" : "left-0")}>
          {header}
          {items.map((it, i) => it === "separator"
            ? <div key={i} className="my-1 h-px bg-line" role="separator" />
            : it.href
              ? <Link key={i} href={it.href} role="menuitem" className={itemClass(it.danger)} onClick={() => setOpen(false)}>{it.icon}{it.label}</Link>
              : <button key={i} type="button" role="menuitem" disabled={it.disabled} className={itemClass(it.danger)}
                  onClick={() => { setOpen(false); it.onClick?.(); }}>{it.icon}{it.label}</button>)}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ copy */

export function CopyField({ label, value, hint, mono = true }: { label: string; value: string; hint?: string; mono?: boolean }) {
  const id = useId();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (await copyText(value)) { setCopied(true); toast("Copied"); setTimeout(() => setCopied(false), 1600); }
    else toast("Couldn't copy. Select the text and copy it manually.", "error");
  }
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm text-dim">{label}</label>
      <div className="flex gap-2">
        <input id={id} readOnly value={value} onFocus={(e) => e.currentTarget.select()}
          className={cx("h-10 min-w-0 flex-1 rounded-lg border border-line-strong bg-bg px-3 text-sm transition duration-150 focus:border-accent focus:outline-none",
            mono && "font-mono text-[13px]")} />
        <Button variant={copied ? "secondary" : "primary"} className="min-w-22" onClick={copy}>
          {copied ? <><CheckIcon />Copied</> : <><CopyIcon />Copy</>}
        </Button>
      </div>
      {hint && <p className="text-xs text-faint">{hint}</p>}
    </div>
  );
}
