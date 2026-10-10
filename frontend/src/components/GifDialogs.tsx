"use client";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { AppConfig, Gif } from "@/lib/types";
import { Button, ConfirmDialog, CopyField, Dialog, Field, Segmented } from "./ui";
import { ExternalIcon, ShareIcon } from "./icons";
import { SlugField } from "./SlugField";
import { useToast } from "./Toast";

export const shareUrlFor = (g: Pick<Gif, "share_path">) => `${window.location.origin}${g.share_path}`;

/* ------------------------------------------------------------------ share */

type Embed = "html" | "markdown" | "bbcode";

function ShareBody({ gif }: { gif: Gif }) {
  const [embed, setEmbed] = useState<Embed>("html");
  const share = shareUrlFor(gif);
  const isLocalLink = /localhost|127\.0\.0\.1/i.test(gif.url);
  const alt = gif.title.replace(/["\]\[]/g, "");
  const snippet: Record<Embed, string> = {
    html: `<img src="${gif.url}" alt="${alt}"${gif.width ? ` width="${gif.width}"` : ""}>`,
    markdown: `![${alt}](${gif.url})`,
    bbcode: `[img]${gif.url}[/img]`,
  };
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  return (
    <div className="space-y-5">
      <CopyField label="Share page" value={share}
        hint="Rich preview card in WhatsApp, Slack, iMessage, X and more." />
      <CopyField label="Direct GIF link" value={gif.url}
        hint="Ends in .gif. Plays inline in Discord, forums and anywhere an image URL works." />
      {isLocalLink && <p className="text-xs text-accent">This link is local to your computer; Discord can't reach localhost. Set PUBLIC_BASE_URL to a publicly accessible HTTPS URL for shared previews.</p>}
      <div className="space-y-3 border-t border-line pt-5">
        <Segmented label="Embed code" value={embed} onChange={setEmbed}
          options={[{ value: "html", label: "HTML" }, { value: "markdown", label: "Markdown" }, { value: "bbcode", label: "BBCode" }]} />
        <CopyField label="Snippet" value={snippet[embed]} />
      </div>
      <div className="flex flex-wrap gap-2 border-t border-line pt-5">
        {canShare && (
          <Button variant="primary" onClick={() => void navigator.share({ title: gif.title, url: gif.url }).catch(() => {})}>
            <ShareIcon />Share GIF link
          </Button>
        )}
        <a href={share} target="_blank" rel="noreferrer"
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-raised px-4 text-sm font-medium transition duration-150 hover:border-line-strong hover:bg-hover">
          <ExternalIcon />Open share page
        </a>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ rename + URL */

function RenameBody({ gif, config, onSaved, onClose }: { gif: Gif; config: AppConfig | null; onSaved: (g: Gif) => void; onClose: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(gif.title);
  const [slug, setSlug] = useState(gif.slug ?? "");
  const [slugOk, setSlugOk] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = title.trim() !== gif.title || slug !== (gif.slug ?? "");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("Give it a name.");
    setBusy(true); setError(null);
    try {
      const patch: { title?: string; slug?: string | null } = {};
      if (title.trim() !== gif.title) patch.title = title.trim();
      if (slug !== (gif.slug ?? "")) patch.slug = slug || null;
      const updated = await api.updateGif(gif.id, patch);
      toast("Saved"); onSaved(updated); onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save."); setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <Field label="Name" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus />
      <SlugField value={slug} onChange={setSlug} onValid={setSlugOk} config={config} gifId={gif.id} />
      {gif.slug && slug !== gif.slug && (
        <p className="rounded-lg border border-accent/30 bg-accent/[0.05] p-3 text-xs text-dim">
          Links that use <span className="font-mono text-fg">{gif.slug}</span> will stop working. Anyone could claim that name afterwards.
          The random link <span className="font-mono text-fg">{gif.id}</span> never changes.
        </p>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button type="submit" variant="primary" loading={busy} disabled={!changed || !slugOk}>Save</Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ hook that owns all three dialogs */

type Kind = "share" | "rename" | "delete";

export function useGifDialogs(h: { onUpdated: (g: Gif) => void; onDeleted: (g: Gif) => void }) {
  const toast = useToast();
  const { refresh } = useAuth();
  const [kind, setKind] = useState<Kind | null>(null);
  const [gif, setGif] = useState<Gif | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (kind === "rename" && !config) api.config().then(setConfig).catch(() => {});
  }, [kind, config]);

  const open = useCallback((k: Kind, g: Gif) => { setGif(g); setKind(k); }, []);
  const close = useCallback(() => setKind(null), []);

  async function remove() {
    if (!gif) return;
    setBusy(true);
    try {
      await api.deleteGif(gif.id);
      toast("GIF deleted. Its links no longer work.");
      h.onDeleted(gif); void refresh(); setKind(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't delete", "error");
    } finally { setBusy(false); }
  }

  const element = (
    <>
      <Dialog open={kind === "share"} onClose={close} title="Share" description={gif?.title} width="520px">
        {gif && <ShareBody gif={gif} />}
      </Dialog>
      <Dialog open={kind === "rename"} onClose={close} title="Rename and custom URL" width="500px">
        {gif && <RenameBody gif={gif} config={config} onClose={close} onSaved={h.onUpdated} />}
      </Dialog>
      <ConfirmDialog open={kind === "delete"} onClose={close} onConfirm={remove} busy={busy}
        title="Delete this GIF?" confirmLabel="Delete GIF"
        description={`“${gif?.title ?? ""}” and all of its links stop working immediately. This can't be undone.`} />
    </>
  );
  return { open, element };
}
