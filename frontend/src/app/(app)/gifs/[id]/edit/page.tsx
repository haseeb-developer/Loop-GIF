"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Studio } from "@/components/Studio";
import { Skeleton, Notice, LinkButton } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { Gif } from "@/lib/types";

export default function EditPage() {
  const { id } = useParams<{ id: string }>();
  const [gif, setGif] = useState<Gif | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api.getGif(id).then((g) => live && setGif(g)).catch((e) =>
      live && setError(e instanceof ApiError && e.status === 404 ? "This GIF doesn't exist or was deleted." : "Couldn't load this GIF."));
    return () => { live = false; };
  }, [id]);

  if (error) return <div className="mx-auto max-w-lg space-y-4"><Notice tone="danger" title={error} /><LinkButton href="/dashboard">Back to library</LinkButton></div>;
  if (!gif) return <div className="space-y-6"><Skeleton className="h-8 w-64" /><Skeleton className="h-[420px]" /></div>;
  if (gif.status === "queued" || gif.status === "processing")
    return <div className="mx-auto max-w-lg space-y-4"><Notice tone="info" title="Still converting">Wait for the current conversion to finish before editing.</Notice><LinkButton href={`/gifs/${gif.id}`}>View progress</LinkButton></div>;
  return <Studio edit={gif} />;
}
