import { ApiError, messageFrom } from "./api";
import type { SourceCreated } from "./types";

export interface UploadProgress { sent: number; total: number; speed: number } // speed in bytes/s (smoothed)

const RETRY_DELAYS = [1000, 2000, 4000, 8000, 15000, 15000];

interface ChunkResult { received: number }

function putChunk(url: string, token: string, offset: number, blob: Blob, signal: AbortSignal,
  onBytes: (loaded: number) => void): Promise<ChunkResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `${url}?offset=${offset}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onBytes(e.loaded); };
    xhr.onload = () => {
      let body: Record<string, unknown> | null = null;
      try { body = JSON.parse(xhr.responseText); } catch { /* ignore */ }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(body as unknown as ChunkResult);
      reject(new ApiError(xhr.status, messageFrom(body, xhr.status), body ?? {}));
    };
    xhr.onerror = () => reject(new ApiError(0, "Connection lost."));
    xhr.ontimeout = () => reject(new ApiError(0, "Connection timed out."));
    xhr.timeout = 5 * 60_000;
    const onAbort = () => { xhr.abort(); reject(new DOMException("Aborted", "AbortError")); };
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
    xhr.send(blob);
  });
}

const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
});

/**
 * Uploads a file in sequential chunks, straight to the API origin. Safe to call again after a failure:
 * it resumes from however many bytes the server already holds, so a dropped connection costs one chunk.
 */
export async function uploadChunks(file: File, created: SourceCreated, startAt: number, signal: AbortSignal,
  onProgress: (p: UploadProgress) => void): Promise<void> {
  const { upload_url: url, upload_token: token, chunk_size: size } = created;
  let offset = startAt;
  let speed = 0;
  let lastT = performance.now();
  let lastSent = offset;
  const report = (sent: number) => {
    const now = performance.now();
    if (now - lastT >= 400) {
      const inst = ((sent - lastSent) / (now - lastT)) * 1000;
      speed = speed ? speed * 0.7 + inst * 0.3 : inst;
      lastT = now; lastSent = sent;
    }
    onProgress({ sent, total: file.size, speed });
  };
  report(offset);

  while (offset < file.size) {
    const blob = file.slice(offset, Math.min(offset + size, file.size));
    let attempt = 0;
    for (;;) {
      try {
        const base = offset;
        const res = await putChunk(url, token, base, blob, signal, (loaded) => report(base + loaded));
        offset = res.received;
        report(offset);
        break;
      } catch (e) {
        if (e instanceof DOMException) throw e;
        const err = e as ApiError;
        if (err.status === 409 && typeof err.extra.received === "number") {
          offset = err.extra.received; // server is ahead (our response was lost) or behind: continue from its count
          report(offset);
          break;
        }
        const transient = err.status === 0 || err.status >= 500 || err.status === 429;
        if (!transient || attempt >= RETRY_DELAYS.length) {
          if (err.status === 401) throw new ApiError(401, "Upload session expired. Start the upload again.");
          throw err;
        }
        await sleep(RETRY_DELAYS[attempt++], signal);
      }
    }
  }
}
