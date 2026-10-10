import type { PublicGif } from "./types";

/** Server-side base URL of the API. On Vercel this is the same API_ORIGIN the rewrites use. */
export const apiOrigin = () => (process.env.API_ORIGIN ?? "http://localhost:8000").replace(/\/+$/, "");

/** Fetch share-page data. Returns null when the GIF doesn't exist (including deleted ones); throws on other failures. */
export async function fetchPublicGif(name: string): Promise<PublicGif | null> {
  if (!/^[0-9A-Za-z_-]{3,40}$/.test(name)) return null;
  const res = await fetch(`${apiOrigin()}/api/public/gifs/${name}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API responded ${res.status}`);
  return (await res.json()) as PublicGif;
}
