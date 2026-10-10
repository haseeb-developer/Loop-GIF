export type Quality = "low" | "balanced" | "high";
export type JobStatus = "queued" | "processing" | "done" | "failed";
export type Stage = "queued" | "analyzing" | "encoding" | "finalizing" | "done" | "failed";

/** What to cut and how to encode it. Times are seconds into the source video. */
export interface Settings { start: number; end: number; fps: number; width: number; quality: Quality }

export interface Source {
  id: string; filename: string; size_bytes: number; received: number;
  status: "uploading" | "probing" | "ready" | "failed"; error: string | null;
  duration: number | null; width: number | null; height: number | null; fps: number | null;
  created_at: string; expires_at: string | null;
}
export interface SourceCreated { source: Source; upload_url: string; upload_token: string; chunk_size: number }

export interface SourceBrief {
  id: string; filename: string; duration: number | null; width: number | null; height: number | null;
  fps: number | null; expires_at: string | null;
}

export interface Gif {
  id: string; title: string; slug: string | null;
  status: JobStatus; stage: Stage; progress: number; error: string | null;
  has_file: boolean; revision: number;
  width: number | null; height: number | null; duration_ms: number | null;
  size_bytes: number | null; source_size_bytes: number;
  settings: Partial<Settings> & { duration?: number };
  created_at: string; updated_at: string; completed_at: string | null; expires_at: string | null;
  url: string; permanent_url: string; download_url: string; poster_url: string | null; share_path: string;
  source: SourceBrief | null;
}
export interface GifList { items: Gif[]; total: number; counts: Record<string, number> }

export interface User {
  email: string; display_name: string; created_at: string;
  gif_count: number; storage_bytes: number; source_bytes: number; source_quota_bytes: number;
}

export interface AppConfig {
  public_base_url: string; max_upload_bytes: number; chunk_bytes: number;
  max_input_duration_s: number; max_input_side_px: number;
  min_clip_s: number; max_clip_s: number; max_output_width: number; max_gif_mb: number;
  source_retention_hours: number; slug_min: number; slug_max: number; formats: string[];
}

export interface SlugCheck { slug: string; available: boolean; reason: string | null }

export interface PublicGif {
  id: string; title: string; slug: string | null; width: number | null; height: number | null;
  duration_ms: number | null; size_bytes: number | null; created_at: string;
  url: string; permanent_url: string; poster_url: string | null; download_url: string;
}

export type SortKey = "recent" | "created" | "oldest" | "name" | "size";
export type FilterKey = "all" | "ready" | "processing" | "failed";
