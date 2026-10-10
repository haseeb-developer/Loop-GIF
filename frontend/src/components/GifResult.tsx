"use client";
import Link from "next/link";
import { useState } from "react";
import { buttonClass } from "@/lib/button";
import { bytes, seconds } from "@/lib/format";
import type { Gif } from "@/lib/types";
import { Badge, Button, CopyField, LinkButton } from "./ui";
import { DownloadIcon, EditIcon, LinkIcon, PencilIcon, ShareIcon, TrashIcon } from "./icons";
import { useGifDialogs } from "./GifDialogs";

/** The finished GIF: preview on the left; links and actions on the right. Shared by the studio and the detail page. */
export function GifResult({ gif, heading, onUpdated, onDeleted, footer, children }: {
  gif: Gif; heading?: string; onUpdated: (g: Gif) => void; onDeleted: (g: Gif) => void;
  footer?: React.ReactNode; children?: React.ReactNode;
}) {
  const dialogs = useGifDialogs({ onUpdated, onDeleted });
  const [imgLoaded, setImgLoaded] = useState(false);
  const saved = gif.size_bytes && gif.source_size_bytes ? Math.round((1 - gif.size_bytes / gif.source_size_bytes) * 100) : null;
  const meta = [
    gif.width && gif.height ? `${gif.width}×${gif.height}` : null,
    gif.size_bytes != null ? bytes(gif.size_bytes) : null,
    gif.duration_ms ? seconds(gif.duration_ms / 1000) : null,
  ].filter(Boolean);

  return (
    <div className="grid gap-8 animate-fade-in lg:grid-cols-[minmax(0,1fr)_440px]">
      <div className="relative flex items-center justify-center overflow-hidden rounded-2xl border border-line bg-raised p-3 sm:p-5">
        {!imgLoaded && <div className="skeleton absolute inset-3 rounded-xl" aria-hidden="true" />}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={gif.url} alt={gif.title} width={gif.width ?? undefined} height={gif.height ?? undefined}
          onLoad={() => setImgLoaded(true)}
          className="relative max-h-[72vh] w-auto max-w-full rounded-lg" />
      </div>

      <div className="space-y-6 lg:pt-1">
        <div className="space-y-2.5">
          {heading && <Badge tone="ok">{heading}</Badge>}
          <div className="flex items-start gap-2">
            <h2 className="min-w-0 flex-1 wrap-break-word text-2xl font-semibold tracking-tight">{gif.title}</h2>
            <Button variant="ghost" size="icon" onClick={() => dialogs.open("rename", gif)} aria-label="Rename and change URL" title="Rename and change URL">
              <PencilIcon />
            </Button>
          </div>
          <p className="font-mono text-xs text-dim">
            {meta.join("  ·  ")}{saved && saved > 0 ? `  ·  ${saved}% smaller than the video` : ""}
          </p>
        </div>

        <CopyField label="Direct link" value={gif.url}
          hint="Paste it into Discord, a forum post, or an img tag. It stays up until you delete the GIF." />

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => dialogs.open("share", gif)}><ShareIcon />Share</Button>
          <a href={gif.download_url} download className={buttonClass("secondary")}><DownloadIcon />Download .gif</a>
          <LinkButton href={`/gifs/${gif.id}/edit`}><EditIcon />Edit</LinkButton>
          <Button variant="danger" onClick={() => dialogs.open("delete", gif)}><TrashIcon />Delete</Button>
        </div>

        {gif.slug && (
          <p className="flex items-start gap-2 text-xs text-faint">
            <LinkIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Also reachable by its permanent random link: <span className="break-all font-mono text-dim">{gif.permanent_url}</span></span>
          </p>
        )}
        {children}
        {footer && <div className="flex flex-wrap gap-2 border-t border-line pt-6">{footer}</div>}
      </div>
      {dialogs.element}
    </div>
  );
}

export const BackToLibrary = () => <Link href="/dashboard" className={buttonClass("ghost")}>Open library</Link>;
