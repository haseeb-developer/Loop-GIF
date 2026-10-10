import type {
  AppConfig, FilterKey, Gif, GifList, Settings, SlugCheck, SortKey, Source, SourceCreated, User,
} from "./types";

/**
 * Browser calls use same-origin `/api/...`: Next.js rewrites them to the API (see next.config.mjs), so the
 * session cookie is first-party and there is no CORS. Only chunk uploads go straight to the API origin.
 */
export class ApiError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

export function messageFrom(body: unknown, status: number): string {
  const d = (body as { detail?: unknown } | null)?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x: { msg?: string }) => x.msg ?? "Invalid value").join(". ");
  if (status === 502 || status === 503 || status === 504) return "The server is unreachable right now. Try again in a moment.";
  return `Request failed (${status})`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init, credentials: "same-origin",
      headers: init.body ? { "Content-Type": "application/json", ...init.headers } : init.headers,
    });
  } catch {
    throw new ApiError(0, "Network error. Check your connection and try again.");
  }
  if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T;
  let body: Record<string, unknown> | null = null;
  try { body = await res.json(); } catch { /* non-JSON error body */ }
  throw new ApiError(res.status, messageFrom(body, res.status), body ?? {});
}

const json = (b: unknown) => JSON.stringify(b);
const post = <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body === undefined ? undefined : json(body) });

export interface ListParams { q?: string; status?: FilterKey; sort?: SortKey; limit?: number; offset?: number }
export interface CreateGif extends Settings { source_id: string; title?: string; slug?: string | null }

export const api = {
  config: () => request<AppConfig>("/api/config"),

  me: () => request<User>("/api/auth/me"),
  signup: (b: { email: string; password: string; display_name: string }) => post<User>("/api/auth/signup", b),
  login: (b: { email: string; password: string }) => post<User>("/api/auth/login", b),
  logout: () => post<void>("/api/auth/logout"),

  createSource: (b: { filename: string; size: number }) => post<SourceCreated>("/api/sources", b),
  completeSource: (id: string) => post<Source>(`/api/sources/${id}/complete`),
  getSource: (id: string) => request<Source>(`/api/sources/${id}`),
  deleteSource: (id: string) => request<void>(`/api/sources/${id}`, { method: "DELETE" }),
  frameUrl: (id: string, t: number, w = 960) => `/api/sources/${id}/frame?t=${t.toFixed(3)}&w=${w}`,

  checkSlug: (slug: string, gifId?: string) =>
    request<SlugCheck>(`/api/slugs/check?slug=${encodeURIComponent(slug)}${gifId ? `&gif_id=${gifId}` : ""}`),

  listGifs: (p: ListParams = {}) => {
    const qs = new URLSearchParams();
    if (p.q) qs.set("q", p.q);
    if (p.status && p.status !== "all") qs.set("status", p.status);
    qs.set("sort", p.sort ?? "recent");
    qs.set("limit", String(p.limit ?? 48));
    qs.set("offset", String(p.offset ?? 0));
    return request<GifList>(`/api/gifs?${qs}`);
  },
  getGif: (id: string) => request<Gif>(`/api/gifs/${id}`),
  createGif: (b: CreateGif) => post<Gif>("/api/gifs", b),
  updateGif: (id: string, b: { title?: string; slug?: string | null }) =>
    request<Gif>(`/api/gifs/${id}`, { method: "PATCH", body: json(b) }),
  regenerate: (id: string, b: Partial<Settings> = {}) => post<Gif>(`/api/gifs/${id}/regenerate`, b),
  cancelGif: (id: string) => post<void>(`/api/gifs/${id}/cancel`),
  deleteGif: (id: string) => request<void>(`/api/gifs/${id}`, { method: "DELETE" }),
};

export const isActive = (g: Pick<Gif, "status">) => g.status === "queued" || g.status === "processing";
