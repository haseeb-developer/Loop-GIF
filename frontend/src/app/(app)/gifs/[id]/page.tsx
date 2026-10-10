"use client";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { GifResult, BackToLibrary } from "@/components/GifResult";
import { useGifDialogs } from "@/components/GifDialogs";
import { Button, LinkButton, Notice, Progress, Skeleton } from "@/components/ui";
import { ChevronLeftIcon, EditIcon, TrashIcon } from "@/components/icons";
import { useToast } from "@/components/Toast";
import { api, ApiError, isActive } from "@/lib/api";
import { ago } from "@/lib/format";
import type { Gif } from "@/lib/types";

const STAGE: Record<string, string> = {
  queued: "Waiting for a converter", analyzing: "Analyzing colors", encoding: "Encoding frames", finalizing: "Saving your GIF",
};

export default function GifPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [gif, setGif] = useState<Gif | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setGif(await api.getGif(id)); setError(null); }
    catch (e) {
      if (e instanceof ApiError && e.status === 404) setMissing(true);
      else setError(e instanceof Error ? e.message : "Couldn't load this GIF.");
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const active = gif ? isActive(gif) : false;
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => void load(), 1000);
    return () => clearInterval(t);
  }, [active, load]);

  const dialogs = useGifDialogs({ onUpdated: setGif, onDeleted: () => router.replace("/dashboard") });

  async function cancel() {
    if (!gif) return;
    try { await api.cancelGif(gif.id); toast("Cancelled"); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't cancel", "error"); }
    void load();
  }

  if (missing) return (
    <div className="mx-auto max-w-lg space-y-4 py-12 text-center">
      <h1 className="text-xl font-semibold">GIF not found</h1>
      <p className="text-sm text-dim">It may have been deleted. Deleted GIFs and their links stop working immediately.</p>
      <BackToLibrary />
    </div>
  );
  if (error && !gif) return <div className="mx-auto max-w-lg space-y-4"><Notice tone="danger" title="Couldn't load this GIF">{error}</Notice><Button onClick={() => void load()}>Retry</Button></div>;
  if (!gif) return <div className="grid gap-8 lg:grid-cols-[1fr_440px]"><Skeleton className="h-[420px]" /><div className="space-y-4"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-24" /></div></div>;

  const back = (
    <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard")} className="-ml-2"><ChevronLeftIcon />Library</Button>
  );

  const progress = active && (
    <div className="space-y-3 rounded-xl border border-line bg-raised p-5">
      <div className="flex items-baseline justify-between">
        <p className="font-medium">{gif.has_file ? "Updating: " : ""}{STAGE[gif.stage] ?? "Working"}</p>
        <span className="font-mono text-sm text-dim">{gif.stage === "encoding" ? `${gif.progress}%` : ""}</span>
      </div>
      <Progress value={gif.progress / 100} indeterminate={gif.stage === "queued" || gif.stage === "analyzing"} />
      <div className="flex items-center justify-between text-xs text-dim">
        <span>{gif.has_file ? "The current version stays live until this finishes." : "This keeps running if you leave the page."}</span>
        <Button size="sm" variant="ghost" onClick={cancel}>Cancel</Button>
      </div>
    </div>
  );

  if (!gif.has_file) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        {back}
        <h1 className="text-2xl font-semibold tracking-tight">{gif.title}</h1>
        {progress}
        {gif.status === "failed" && (
          <Notice tone="danger" title="This GIF couldn't be made" action={undefined}>
            {gif.error ?? "Conversion failed."}
          </Notice>
        )}
        {!active && (
          <div className="flex flex-wrap gap-2">
            {gif.source && <LinkButton href={`/gifs/${gif.id}/edit`} variant="primary"><EditIcon />Change settings and retry</LinkButton>}
            <Button variant="danger" onClick={() => dialogs.open("delete", gif)}><TrashIcon />Delete</Button>
          </div>
        )}
        <p className="text-xs text-faint">Started {ago(gif.created_at)}</p>
        {dialogs.element}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {back}
      {progress}
      {gif.status === "failed" && !active && (
        <Notice tone="warn" title="The last update didn't finish">{gif.error} Your previous version is still live.</Notice>
      )}
      <GifResult gif={gif} onUpdated={setGif} onDeleted={() => router.replace("/dashboard")}>
        <p className="text-xs text-faint">Updated {ago(gif.updated_at)}</p>
      </GifResult>
      {dialogs.element}
    </div>
  );
}
