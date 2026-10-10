import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/Header";
import { ShareActions } from "@/components/ShareActions";
import { bytes, seconds } from "@/lib/format";
import { fetchPublicGif } from "@/lib/server";
import type { PublicGif } from "@/lib/types";

// Every view must ask the API, so a deleted GIF disappears immediately.
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = { params: Promise<{ name: string }> };

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { name } = await params;
  let gif: PublicGif | null = null;
  try { gif = await fetchPublicGif(name); } catch { /* fall through to generic metadata */ }
  if (!gif) return { title: "GIF not found", robots: { index: false, follow: false } };
  const pageUrl = `${await origin()}/g/${name}`;
  const image = gif.poster_url ?? gif.url;
  const description = [gif.width && gif.height ? `${gif.width}×${gif.height}` : null, gif.duration_ms ? seconds(gif.duration_ms / 1000) : null,
    gif.size_bytes ? bytes(gif.size_bytes) : null].filter(Boolean).join(" · ") || "A GIF made with Loop";
  return {
    title: gif.title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      type: "website", siteName: "Loop", title: gif.title, description, url: pageUrl,
      images: [{ url: image, width: gif.width ?? undefined, height: gif.height ?? undefined, alt: gif.title }],
    },
    twitter: { card: "summary_large_image", title: gif.title, description, images: [image] },
  };
}

export default async function SharePage({ params }: Props) {
  const { name } = await params;
  const gif = await fetchPublicGif(name);
  if (!gif) notFound();
  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 sm:px-6">
      <header className="flex h-14 items-center justify-between">
        <Logo />
        <Link href="/signup" className="text-sm text-dim hover:text-fg">Make your own</Link>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-6 py-10">
        <div className="max-w-full overflow-hidden rounded-2xl border border-line bg-raised p-3 sm:p-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={gif.url} alt={gif.title} width={gif.width ?? undefined} height={gif.height ?? undefined}
            className="max-h-[70vh] w-auto max-w-full rounded-lg" />
        </div>
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold tracking-tight">{gif.title}</h1>
          <p className="font-mono text-xs text-dim">
            {[gif.width && gif.height ? `${gif.width}×${gif.height}` : null, gif.size_bytes ? bytes(gif.size_bytes) : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        <ShareActions url={gif.url} downloadUrl={gif.download_url} />
      </main>
    </div>
  );
}
