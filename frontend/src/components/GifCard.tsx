"use client";
import Link from "next/link";
import { useState } from "react";
import { ago, bytes, copyText, seconds } from "@/lib/format";
import { isActive } from "@/lib/api";
import type { Gif } from "@/lib/types";
import { Badge, Menu, type MenuItem, Progress, cx } from "./ui";
import { AlertIcon, CodeIcon, CopyIcon, DownloadIcon, EditIcon, FilmIcon, LinkIcon, MoreIcon, PencilIcon, ShareIcon, TrashIcon } from "./icons";
import { useToast } from "./Toast";

export type GifAction = "share" | "rename" | "delete";

function useItems(g: Gif, act: (k: GifAction, g: Gif) => void): MenuItem[] {
  const toast = useToast();
  const copy = async (text: string, msg: string) => { const ok = await copyText(text); toast(ok ? msg : "Couldn't copy", ok ? "ok" : "error"); };
  const items: MenuItem[] = [{ label: "Open", icon: <FilmIcon />, href: `/gifs/${g.id}` }];
  if (g.has_file) {
    items.push(
      { label: "Copy link", icon: <LinkIcon />, onClick: () => void copy(g.url, "Link copied") },
      { label: "Copy embed code", icon: <CodeIcon />, onClick: () => void copy(`<img src="${g.url}" alt="${g.title.replace(/"/g, "")}">`, "Embed code copied") },
      { label: "Share…", icon: <ShareIcon />, onClick: () => act("share", g) },
      { label: "Download .gif", icon: <DownloadIcon />, href: g.download_url },
    );
  }
  items.push("separator",
    { label: "Edit & regenerate", icon: <EditIcon />, href: `/gifs/${g.id}/edit`, disabled: isActive(g) },
    { label: "Rename / URL", icon: <PencilIcon />, onClick: () => act("rename", g) },
    "separator",
    { label: "Delete", icon: <TrashIcon />, danger: true, onClick: () => act("delete", g) });
  return items;
}

function Thumb({ g, hover }: { g: Gif; hover: boolean }) {
  const [failed, setFailed] = useState(false);
  const active = isActive(g);
  const src = g.has_file ? (hover ? g.url : g.poster_url ?? g.url) : null;
  return (
    <div className="relative aspect-video overflow-hidden bg-black">
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={g.title} loading="lazy" decoding="async" onError={() => setFailed(true)}
          className="h-full w-full object-contain transition duration-200" />
      ) : (
        <div className="grid h-full place-items-center text-faint">
          {g.status === "failed" && !g.has_file ? <AlertIcon className="h-6 w-6 text-danger" /> : <FilmIcon className="h-6 w-6" />}
        </div>
      )}
      {active && (
        <div className="absolute inset-x-0 bottom-0 space-y-1.5 bg-linear-to-t from-black/80 to-transparent p-3 pt-8">
          <p className="text-xs text-fg">{g.stage === "queued" ? "Waiting…" : g.stage === "encoding" ? `Encoding ${g.progress}%` : "Working…"}</p>
          <Progress value={g.progress / 100} indeterminate={g.stage === "queued" || g.stage === "analyzing"} />
        </div>
      )}
    </div>
  );
}

export function GifCard({ gif: g, onAction }: { gif: Gif; onAction: (k: GifAction, g: Gif) => void }) {
  const [hover, setHover] = useState(false);
  const items = useItems(g, onAction);
  const meta = [g.width && g.height ? `${g.width}×${g.height}` : null, g.size_bytes != null ? bytes(g.size_bytes) : null,
    g.duration_ms ? seconds(g.duration_ms / 1000) : null].filter(Boolean).join(" · ");
  return (
    <article className="group relative rounded-xl border border-line bg-raised transition duration-200 hover:border-line-strong"
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)}>
      <Link href={`/gifs/${g.id}`} className="block overflow-hidden rounded-t-xl" aria-label={`Open ${g.title}`}><Thumb g={g} hover={hover} /></Link>
      <div className="flex items-start gap-2 p-3.5">
        <div className="min-w-0 flex-1 space-y-1">
          <Link href={`/gifs/${g.id}`} className="block truncate text-sm font-medium hover:underline" title={g.title}>{g.title}</Link>
          <p className="truncate font-mono text-xs text-faint" title={g.slug ? `/g/${g.slug}` : undefined}>
            {g.slug ? `/g/${g.slug}` : meta || "—"}
          </p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-dim">
            <span>{ago(g.updated_at)}</span>
            {g.slug && meta && <span className="font-mono text-faint">{meta}</span>}
            {g.status === "failed" && <Badge tone="danger">{g.has_file ? "Update failed" : "Failed"}</Badge>}
            {isActive(g) && g.has_file && <Badge tone="accent">Updating</Badge>}
          </div>
        </div>
        <Menu label={`Actions for ${g.title}`} icon={<MoreIcon />} items={items} className={cx("opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100")} />
      </div>
    </article>
  );
}

export function GifRow({ gif: g, onAction }: { gif: Gif; onAction: (k: GifAction, g: Gif) => void }) {
  const items = useItems(g, onAction);
  const toast = useToast();
  return (
    <div className="group flex items-center gap-4 rounded-xl border border-transparent p-2 transition duration-150 hover:border-line hover:bg-raised">
      <Link href={`/gifs/${g.id}`} className="block w-28 shrink-0 overflow-hidden rounded-lg border border-line sm:w-36" aria-label={`Open ${g.title}`}>
        <Thumb g={g} hover={false} />
      </Link>
      <div className="min-w-0 flex-1 space-y-0.5">
        <Link href={`/gifs/${g.id}`} className="block truncate text-sm font-medium hover:underline">{g.title}</Link>
        <p className="truncate font-mono text-xs text-faint">{g.slug ? `/g/${g.slug}` : `/g/${g.id}`}</p>
        <p className="truncate text-xs text-dim">{ago(g.updated_at)}{g.size_bytes != null ? ` · ${bytes(g.size_bytes)}` : ""}</p>
      </div>
      {g.status === "failed" && <Badge tone="danger">Failed</Badge>}
      {isActive(g) && <Badge tone="accent">{g.progress}%</Badge>}
      {g.has_file && (
        <button type="button" aria-label="Copy link" title="Copy link"
          onClick={async () => { const ok = await copyText(g.url); toast(ok ? "Link copied" : "Couldn't copy", ok ? "ok" : "error"); }}
          className="hidden h-8 w-8 place-items-center rounded-lg text-dim transition hover:bg-hover hover:text-fg sm:grid"><CopyIcon /></button>
      )}
      <Menu label={`Actions for ${g.title}`} icon={<MoreIcon />} items={items} />
    </div>
  );
}
