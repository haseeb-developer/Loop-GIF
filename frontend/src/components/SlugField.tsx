"use client";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "@/lib/api";
import { slugify } from "@/lib/format";
import type { AppConfig } from "@/lib/types";
import { Spinner, cx } from "./ui";
import { AlertIcon, CheckIcon } from "./icons";

const SHAPE = /^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/;
type State = { kind: "idle" } | { kind: "checking" } | { kind: "ok" } | { kind: "bad"; reason: string };

/**
 * Custom URL name with live availability. `onValid(true)` means the field is empty (no custom URL) or the name is free,
 * so the parent can block saving while it is checking or taken.
 */
export function SlugField({ value, onChange, onValid, config, gifId, autoFocus }: {
  value: string; onChange: (v: string) => void; onValid: (valid: boolean) => void;
  config: AppConfig | null; gifId?: string; autoFocus?: boolean;
}) {
  const id = useId();
  const [state, setState] = useState<State>({ kind: "idle" });
  const ticket = useRef(0);
  const min = config?.slug_min ?? 3, max = config?.slug_max ?? 40;
  const base = (config?.public_base_url ?? "").replace(/^https?:\/\//, "");

  useEffect(() => {
    const mine = ++ticket.current;
    if (!value) { setState({ kind: "idle" }); onValid(true); return; }
    if (value.length < min) { setState({ kind: "bad", reason: `Use at least ${min} characters.` }); onValid(false); return; }
    if (!SHAPE.test(value)) { setState({ kind: "bad", reason: "Start and end with a letter or number." }); onValid(false); return; }
    setState({ kind: "checking" }); onValid(false);
    const t = setTimeout(async () => {
      try {
        const r = await api.checkSlug(value, gifId);
        if (mine !== ticket.current) return;
        if (r.available) { setState({ kind: "ok" }); onValid(true); }
        else { setState({ kind: "bad", reason: r.reason ?? "That URL isn't available." }); onValid(false); }
      } catch {
        if (mine !== ticket.current) return;
        setState({ kind: "bad", reason: "Couldn't check this name. Try again." }); onValid(false);
      }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, min, gifId]);

  const bad = state.kind === "bad";
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm text-dim">Custom URL <span className="text-faint">(optional)</span></label>
      <div className={cx("flex h-10 items-center rounded-lg border bg-raised transition duration-150 focus-within:border-accent hover:border-line-strong",
        bad ? "border-danger/70" : "border-line")}>
        <span className="hidden max-w-[45%] shrink-0 truncate pl-3 font-mono text-[13px] text-faint sm:block" title={`${base}/g/`}>{base}/g/</span>
        <input id={id} value={value} autoFocus={autoFocus} maxLength={max} spellCheck={false} autoCapitalize="none" autoComplete="off"
          placeholder="cat_edit" aria-invalid={bad} aria-describedby={`${id}-d`}
          onChange={(e) => onChange(slugify(e.target.value))}
          className="h-full min-w-0 flex-1 bg-transparent px-3 font-mono text-[13px] placeholder:text-faint focus:outline-none sm:pl-1" />
        <span className="pr-3" aria-hidden="true">
          {state.kind === "checking" && <Spinner className="h-4 w-4 text-dim" />}
          {state.kind === "ok" && <CheckIcon className="h-4 w-4 text-ok" />}
          {bad && <AlertIcon className="h-4 w-4 text-danger" />}
        </span>
      </div>
      <p id={`${id}-d`} role={bad ? "alert" : undefined}
        className={cx("text-xs", bad ? "text-danger" : state.kind === "ok" ? "text-ok" : "text-faint")}>
        {bad ? state.reason : state.kind === "ok" ? "Available." : state.kind === "checking" ? "Checking…"
          : "Letters, numbers, - and _. The random link keeps working either way."}
      </p>
    </div>
  );
}
