"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GifCard, GifRow } from "@/components/GifCard";
import { useGifDialogs } from "@/components/GifDialogs";
import { Button, EmptyState, LinkButton, Menu, Notice, Segmented, Skeleton, cx } from "@/components/ui";
import { ChevronDownIcon, FilmIcon, GridIcon, ListIcon, PlusIcon, SearchIcon, XIcon } from "@/components/icons";
import { api, isActive } from "@/lib/api";
import { dayGroup } from "@/lib/format";
import type { FilterKey, Gif, SortKey } from "@/lib/types";

const PAGE = 36;
const SORTS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "Recently updated" }, { key: "created", label: "Newest first" },
  { key: "oldest", label: "Oldest first" }, { key: "name", label: "Name A–Z" }, { key: "size", label: "Largest first" },
];

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export default function Library() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [items, setItems] = useState<Gif[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dq = useDebounced(q.trim(), 250);
  const seq = useRef(0);

  useEffect(() => { try { const v = localStorage.getItem("loop:view"); if (v === "list" || v === "grid") setView(v); } catch { /* storage unavailable */ } }, []);
  const chooseView = (v: "grid" | "list") => { setView(v); try { localStorage.setItem("loop:view", v); } catch { /* ignore */ } };

  const load = useCallback(async (quiet = false) => {
    const mine = ++seq.current;
    if (!quiet) setLoading(true);
    try {
      const r = await api.listGifs({ q: dq, status: filter, sort, limit: PAGE });
      if (mine !== seq.current) return;
      setItems(r.items); setTotal(r.total); setCounts(r.counts); setError(null);
    } catch (e) {
      if (mine === seq.current && !quiet) setError(e instanceof Error ? e.message : "Couldn't load your library.");
    } finally { if (mine === seq.current) setLoading(false); }
  }, [dq, filter, sort]);
  useEffect(() => { void load(); }, [load]);

  // Keep running jobs fresh without flicker.
  const anyActive = items.some(isActive);
  useEffect(() => {
    if (!anyActive) return;
    const t = setInterval(() => void load(true), 2000);
    return () => clearInterval(t);
  }, [anyActive, load]);

  async function loadMore() {
    setMore(true);
    try {
      const r = await api.listGifs({ q: dq, status: filter, sort, limit: PAGE, offset: items.length });
      setItems((cur) => { const seen = new Set(cur.map((g) => g.id)); return [...cur, ...r.items.filter((g) => !seen.has(g.id))]; });
      setTotal(r.total);
    } catch { /* leave the button for another try */ } finally { setMore(false); }
  }

  const dialogs = useGifDialogs({
    onUpdated: (g) => setItems((cur) => cur.map((x) => (x.id === g.id ? g : x))),
    onDeleted: (g) => { setItems((cur) => cur.filter((x) => x.id !== g.id)); setTotal((t) => Math.max(0, t - 1)); void load(true); },
  });

  const grouped = useMemo(() => {
    if (sort !== "recent" && sort !== "created") return [{ label: "", items }];
    const out: { label: string; items: Gif[] }[] = [];
    for (const g of items) {
      const label = dayGroup(sort === "recent" ? g.updated_at : g.created_at);
      const last = out[out.length - 1];
      if (last?.label === label) last.items.push(g); else out.push({ label, items: [g] });
    }
    return out;
  }, [items, sort]);

  const filtered = filter !== "all" || dq !== "";
  const allCount = counts.all ?? 0;
  const Item = view === "grid" ? GifCard : GifRow;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
          <p className="text-sm text-dim">{loading && !items.length ? "Loading…" : `${allCount} ${allCount === 1 ? "GIF" : "GIFs"}`}</p>
        </div>
        <LinkButton href="/new" variant="primary"><PlusIcon />New GIF</LinkButton>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 flex-1 sm:max-w-sm">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or URL" aria-label="Search GIFs"
            className="h-10 w-full rounded-lg border border-line bg-raised pl-9 pr-9 text-sm placeholder:text-faint transition duration-150 hover:border-line-strong focus:border-accent focus:outline-none" />
          {q && <button type="button" onClick={() => setQ("")} aria-label="Clear search"
            className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-dim hover:text-fg"><XIcon className="h-3.5 w-3.5" /></button>}
        </div>
        <div className="hidden sm:block">
          <FilterTabs value={filter} onChange={setFilter} counts={counts} />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Menu label="Sort" align="right" className="[&>button]:w-auto [&>button]:gap-1.5 [&>button]:px-2.5 [&>button]:text-sm"
            icon={<><span className="text-dim">{SORTS.find((s) => s.key === sort)?.label}</span><ChevronDownIcon className="h-3.5 w-3.5" /></>}
            items={SORTS.map((s) => ({ label: s.label, onClick: () => setSort(s.key) }))} />
          <div className="flex rounded-lg border border-line p-0.5" role="group" aria-label="View">
            {(["grid", "list"] as const).map((v) => (
              <button key={v} type="button" onClick={() => chooseView(v)} aria-pressed={view === v} aria-label={`${v} view`}
                className={cx("grid h-8 w-8 place-items-center rounded-md transition", view === v ? "bg-hover text-fg" : "text-dim hover:text-fg")}>
                {v === "grid" ? <GridIcon /> : <ListIcon />}
              </button>
            ))}
          </div>
        </div>
        <div className="w-full sm:hidden"><FilterTabs value={filter} onChange={setFilter} counts={counts} /></div>
      </div>

      {error && <Notice tone="danger" title="Couldn't load your library" action={<Button size="sm" onClick={() => void load()}>Retry</Button>}>{error}</Notice>}

      {loading && !items.length ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-60" />)}
        </div>
      ) : !items.length && !error ? (
        filtered ? (
          <EmptyState icon={<SearchIcon />} title="Nothing matches"
            action={<Button onClick={() => { setQ(""); setFilter("all"); }}>Clear filters</Button>}>
            No GIFs match {dq ? <>“{dq}”</> : "this filter"}.
          </EmptyState>
        ) : (
          <EmptyState icon={<FilmIcon />} title="No GIFs yet" action={<LinkButton href="/new" variant="primary"><PlusIcon />Create your first GIF</LinkButton>}>
            Upload a video, pick the exact moment and share it anywhere.
          </EmptyState>
        )
      ) : (
        <div className={cx("space-y-8 transition-opacity duration-150", loading && "opacity-60")}>
          {grouped.map((grp) => (
            <section key={grp.label || "all"} className="space-y-3">
              {grp.label && <h2 className="text-xs font-medium uppercase tracking-wider text-faint">{grp.label}</h2>}
              <div className={view === "grid" ? "grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5" : "space-y-1"}>
                {grp.items.map((g) => <Item key={g.id} gif={g} onAction={dialogs.open} />)}
              </div>
            </section>
          ))}
          {items.length < total && (
            <div className="flex justify-center"><Button onClick={loadMore} loading={more}>Load more ({total - items.length})</Button></div>
          )}
        </div>
      )}
      {dialogs.element}
    </div>
  );
}

function FilterTabs({ value, onChange, counts }: { value: FilterKey; onChange: (v: FilterKey) => void; counts: Record<string, number> }) {
  const opts: { value: FilterKey; label: string }[] = [
    { value: "all", label: "All" }, { value: "ready", label: "Ready" }, { value: "processing", label: "Processing" }, { value: "failed", label: "Failed" },
  ];
  return (
    <Segmented label="" value={value} onChange={onChange}
      options={opts.map((o) => ({ ...o, label: counts[o.value] ? `${o.label} ${counts[o.value]}` : o.label }))} />
  );
}
