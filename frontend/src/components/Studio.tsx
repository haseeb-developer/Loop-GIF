"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { bytes, eta, formatTime, hoursLeft, seconds } from "@/lib/format";
import * as R from "@/lib/range";
import type { AppConfig, Gif, Quality, Source, SourceCreated } from "@/lib/types";
import { uploadChunks } from "@/lib/upload";
import { BackToLibrary, GifResult } from "./GifResult";
import { Dropzone, validateVideoFile } from "./Dropzone";
import { Monitor, type Seek } from "./Monitor";
import { RangeSelector } from "./RangeSelector";
import { SlugField } from "./SlugField";
import { useToast } from "./Toast";
import { Button, Field, Notice, Progress, Segmented, Slider, Spinner, cx } from "./ui";
import { AlertIcon, CheckIcon, ChevronLeftIcon, RefreshIcon } from "./icons";

type Phase = "upload" | "edit" | "converting" | "done";
type Up = { state: "idle" | "uploading" | "processing" | "ready" | "error"; sent: number; total: number; speed: number; error?: string };

const STEPS = ["Upload", "Configure", "Convert", "Preview", "Share"];
const WIDTHS = [320, 480, 640, 800, 1024, 1280];
const QUALITY: { value: Quality; label: string; title: string }[] = [
  { value: "low", label: "Small", title: "64 colors, smallest file" },
  { value: "balanced", label: "Balanced", title: "128 colors" },
  { value: "high", label: "Sharp", title: "256 colors, best detail" },
];
const STAGE_LABEL: Record<string, string> = {
  queued: "Waiting for a converter", analyzing: "Analyzing colors", encoding: "Encoding frames", finalizing: "Saving your GIF",
};

const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
});
const stem = (name: string) => name.replace(/\.[^.]+$/, "").slice(0, 200);
const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2 overflow-x-auto text-sm hide-scrollbar" aria-label="Progress">
      {STEPS.map((s, i) => (
        <li key={s} aria-current={i === current ? "step" : undefined} className="flex shrink-0 items-center gap-2">
          <span className={cx("grid h-5 w-5 place-items-center rounded-full border text-[11px] transition duration-200",
            i < current ? "border-accent bg-accent text-accent-fg" : i === current ? "border-accent text-accent" : "border-line-strong text-faint")}>
            {i < current ? <CheckIcon className="h-3 w-3" /> : i + 1}
          </span>
          <span className={cx(i === current ? "text-fg" : "text-dim", i !== current && "hidden md:inline")}>{s}</span>
          {i < STEPS.length - 1 && <span className="mx-1 h-px w-4 bg-line-strong sm:w-8" />}
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------ upload status */

function UploadStatus({ file, source, up, brief, onRetry, onChoose }: {
  file: File | null; source: Source | null; up: Up;
  brief: { filename: string; expires_at: string | null } | null; onRetry: () => void; onChoose: () => void;
}) {
  const pct = up.total ? up.sent / up.total : 0;
  if (brief && !file) {
    const left = hoursLeft(brief.expires_at);
    return (
      <div className="flex items-start gap-3 rounded-lg border border-line p-3.5 text-sm">
        <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
        <div className="min-w-0"><p className="truncate font-medium" title={brief.filename}>{brief.filename}</p>
          <p className="text-xs text-dim">Using the stored video{left ? `, kept for ${left} more` : ""}.</p></div>
      </div>
    );
  }
  return (
    <div className={cx("space-y-3 rounded-lg border p-3.5 text-sm", up.state === "error" ? "border-danger/40" : "border-line")} aria-live="polite">
      <div className="flex items-start gap-3">
        {up.state === "ready" ? <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
          : up.state === "error" ? <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          : <Spinner className="mt-0.5 h-4 w-4 shrink-0 text-accent" />}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium" title={file?.name}>{file?.name}</p>
          <p className="text-xs text-dim">
            {up.state === "uploading" && <>Uploading {Math.round(pct * 100)}%, {bytes(up.sent)} of {bytes(up.total)}
              {up.speed > 0 && <> · {bytes(up.speed)}/s · {eta((up.total - up.sent) / up.speed)} left</>}</>}
            {up.state === "processing" && "Reading the video and finding its exact length…"}
            {up.state === "ready" && source && <>Ready · {source.duration ? formatTime(source.duration) : "?"} · {source.width}×{source.height}
              {source.fps ? ` · ${Number(source.fps.toFixed(2))} fps` : ""}</>}
            {up.state === "error" && up.error}
          </p>
        </div>
      </div>
      {up.state === "uploading" && <Progress value={pct} />}
      {up.state === "processing" && <Progress value={1} indeterminate />}
      {up.state === "error" && (
        <div className="flex gap-2">
          <Button size="sm" onClick={onRetry}><RefreshIcon />Retry</Button>
          <Button size="sm" variant="ghost" onClick={onChoose}>Choose another video</Button>
        </div>
      )}
      {(up.state === "uploading" || up.state === "processing") &&
        <p className="text-xs text-faint">You can keep editing while this uploads. Closing the tab will stop it.</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ studio */

export function Studio({ edit }: { edit?: Gif }) {
  const router = useRouter();
  const toast = useToast();
  const { refresh } = useAuth();

  const brief = edit?.source ?? null;
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [phase, setPhase] = useState<Phase>(edit && brief ? "edit" : "upload");
  const [file, setFile] = useState<File | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [meta, setMeta] = useState<{ duration: number; width: number; height: number } | null>(null);
  const [up, setUp] = useState<Up>({ state: "idle", sent: 0, total: 0, speed: 0 });

  const es = edit?.settings;
  const [range, setRange] = useState<R.Range>({ start: es?.start ?? 0, end: es?.end ?? ((es?.start ?? 0) + (es?.duration ?? 5)) });
  const [fps, setFps] = useState(es?.fps ?? 15);
  const [width, setWidth] = useState(es?.width ?? 480);
  const [quality, setQuality] = useState<Quality>((es?.quality as Quality) ?? "balanced");
  const [title, setTitle] = useState(edit?.title ?? "");
  const [slug, setSlug] = useState(edit?.slug ?? "");
  const [slugOk, setSlugOk] = useState(true);

  const [seek, setSeek] = useState<Seek>({ t: es?.start ?? 0 });
  const [playhead, setPlayhead] = useState(es?.start ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<Gif | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [doneMode, setDoneMode] = useState<"create" | "replace">("create");

  const abort = useRef<AbortController | null>(null);
  const created = useRef<SourceCreated | null>(null);
  const baseRevision = useRef(0);
  const initialized = useRef(!!edit);

  useEffect(() => { api.config().then(setConfig).catch(() => {}); }, []);
  useEffect(() => () => { abort.current?.abort(); }, []);
  useEffect(() => () => { if (localUrl) URL.revokeObjectURL(localUrl); }, [localUrl]);

  // Warn before closing the tab mid-upload.
  const uploading = up.state === "uploading" || up.state === "processing";
  useEffect(() => {
    if (!uploading) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [uploading]);

  /* -------- limits and derived values */
  const duration = source?.duration ?? brief?.duration ?? meta?.duration ?? null;
  const minClip = config?.min_clip_s ?? 0.2;
  const maxClip = config?.max_clip_s ?? 60;
  const srcW = source?.width ?? brief?.width ?? meta?.width ?? null;
  const srcH = source?.height ?? brief?.height ?? meta?.height ?? null;
  const L: R.Limits | null = duration ? { duration, minClip, maxClip } : null;

  // First time the length is known: choose a starting range and width. When the server reports the exact length, keep the range inside it.
  useEffect(() => {
    if (!duration || !L) return;
    if (!initialized.current) {
      initialized.current = true;
      const r = R.defaultRange(duration, L);
      setRange(r); setSeek({ t: r.start }); setPlayhead(r.start);
      const w = [...WIDTHS].reverse().find((x) => x <= Math.min(640, srcW ?? 640)) ?? WIDTHS[0];
      setWidth(w);
    } else {
      setRange((r) => (r.end > duration + 1e-6 ? R.fitRange(r, L) : r));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration]);

  const maxW = config?.max_output_width ?? 1280;
  const widthOptions = WIDTHS.filter((w) => w <= maxW && (!srcW || w <= srcW || w === WIDTHS[0]))
    .map((w) => ({ value: w, label: String(w) }));
  const effW = srcW ? Math.min(width, srcW) : width;
  const effH = srcW && srcH ? Math.round((effW * srcH) / srcW / 2) * 2 : null;
  const clipLen = range.end - range.start;
  const frames = Math.round(fps * clipLen);

  /* -------- upload */
  const startUpload = useCallback(async (f: File) => {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setUp({ state: "uploading", sent: 0, total: f.size, speed: 0 });
    try {
      if (!created.current) created.current = await api.createSource({ filename: f.name, size: f.size });
      const c = created.current;
      const have = await api.getSource(c.source.id); // resume from whatever the server already holds
      await uploadChunks(f, c, have.received, ctrl.signal, (p) => setUp({ state: "uploading", ...p }));
      setUp((u) => ({ ...u, state: "processing", sent: f.size }));
      let s = await api.completeSource(c.source.id);
      while (s.status === "uploading" || s.status === "probing") {
        await sleep(700, ctrl.signal);
        s = await api.getSource(c.source.id);
      }
      if (s.status === "failed") { created.current = null; throw new ApiError(422, s.error ?? "This video can't be used."); }
      setSource(s);
      setUp((u) => ({ ...u, state: "ready" }));
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (e instanceof ApiError && (e.status === 401 || e.status === 404)) created.current = null;
      setUp((u) => ({ ...u, state: "error", error: errMsg(e, "Upload failed.") }));
    }
  }, []);

  function pick(f: File) {
    const problem = validateVideoFile(f, config);
    if (problem) { toast(problem, "error"); return; }
    created.current = null;
    setFile(f); setSource(null); setMeta(null); setError(null);
    setLocalUrl(URL.createObjectURL(f));
    setTitle((t) => t || stem(f.name));
    setPhase("edit");
    void startUpload(f);
  }

  function chooseAnother() {
    abort.current?.abort();
    const id = created.current?.source.id;
    if (id && !job) void api.deleteSource(id).catch(() => {});
    created.current = null; initialized.current = false;
    setFile(null); setLocalUrl(null); setSource(null); setMeta(null); setUp({ state: "idle", sent: 0, total: 0, speed: 0 });
    setPhase("upload");
  }

  /* -------- conversion */
  function startJob(g: Gif, base: number, mode: "create" | "replace") {
    baseRevision.current = base; setDoneMode(mode); setJob(g); setPhase("converting");
  }

  async function convert(mode: "create" | "replace") {
    const sourceId = source?.id ?? brief?.id;
    if (!sourceId || !L) return;
    setError(null); setSubmitting(true);
    const settings = { start: range.start, end: range.end, fps, width: effW, quality };
    try {
      if (mode === "replace" && edit) {
        const patch: { title?: string; slug?: string | null } = {};
        if (title.trim() && title.trim() !== edit.title) patch.title = title.trim();
        if (slug !== (edit.slug ?? "")) patch.slug = slug || null;
        if (Object.keys(patch).length) await api.updateGif(edit.id, patch);
        startJob(await api.regenerate(edit.id, settings), edit.revision, "replace");
      } else {
        startJob(await api.createGif({ source_id: sourceId, ...settings, title: title.trim() || undefined, slug: slug || null }), 0, "create");
      }
    } catch (e) {
      setError(errMsg(e, "Couldn't start the conversion."));
    } finally { setSubmitting(false); }
  }

  // Poll the job until it settles.
  const jobId = job?.id;
  useEffect(() => {
    if (phase !== "converting" || !jobId) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const g = await api.getGif(jobId);
        if (stop) return;
        setJob(g);
        if (g.status === "done") {
          if (g.revision > baseRevision.current) { setPhase("done"); void refresh(); }
          else setPhase("edit"); // a cancelled regeneration falls back to the live version
          return;
        }
        if (g.status === "failed") { setError(g.error ?? "Conversion failed."); setPhase("edit"); return; }
      } catch (e) {
        if (stop) return;
        if (e instanceof ApiError && e.status === 404) { setJob(null); setPhase("edit"); return; } // cancelled before it finished
      }
      timer = setTimeout(tick, 600);
    };
    timer = setTimeout(tick, 300);
    return () => { stop = true; clearTimeout(timer); };
  }, [phase, jobId, refresh]);

  async function cancelJob() {
    if (!job) return;
    try { await api.cancelGif(job.id); } catch { /* the poll will settle it */ }
    toast("Cancelled");
    if (doneMode === "create") setJob(null);
    setPhase("edit");
  }

  /* -------- rendering */
  const step = phase === "upload" ? 0 : phase === "edit" ? 1 : phase === "converting" ? 2 : 4;
  const ready = !!(source || (brief && !file));
  const canConvert = ready && !!L && !submitting && slugOk && clipLen >= minClip - 1e-6;
  const sourceId = source?.id ?? (brief && !file ? brief.id : null);

  const onScrub = useCallback((t: number) => { setSeek({ t }); setPlayhead(t); }, []);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {edit && (
            <Button variant="ghost" size="icon" onClick={() => router.push(`/gifs/${edit.id}`)} aria-label="Back to GIF"><ChevronLeftIcon /></Button>
          )}
          <h1 className="text-xl font-semibold tracking-tight">{edit ? `Edit “${edit.title}”` : "Create a GIF"}</h1>
        </div>
        <Stepper current={step} />
      </div>

      {phase === "upload" && (
        <div className="mx-auto max-w-3xl space-y-4">
          {edit && !brief && (
            <Notice tone="warn" title="The original video isn't stored any more">
              Source videos are kept for {config?.source_retention_hours ?? 72} hours after you last used them. Upload the video again to make a new version as a new GIF.
              You can still rename this GIF and change its URL from the library.
            </Notice>
          )}
          <Dropzone config={config} onFile={pick} />
        </div>
      )}

      {phase === "edit" && L && duration && (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="min-w-0 space-y-6">
            <Monitor localUrl={localUrl} sourceId={sourceId} start={range.start} end={range.end} duration={duration}
              seek={seek} onPlayhead={setPlayhead} onSeek={onScrub} onMeta={setMeta} />
            <RangeSelector duration={duration} range={range} minClip={minClip} maxClip={maxClip} playhead={playhead}
              onChange={setRange} onScrub={onScrub} onSeek={onScrub} />
          </div>

          <aside className="min-w-0 space-y-6 xl:sticky xl:top-20 xl:self-start">
            <UploadStatus file={file} source={source} up={up} brief={brief} onRetry={() => file && void startUpload(file)} onChoose={chooseAnother} />
            {error && <Notice tone="danger" title="Couldn't convert">{error}</Notice>}
            {edit?.status === "failed" && edit.has_file && !error && (
              <Notice tone="warn" title="The last update failed">{edit.error} Your previous version is still live.</Notice>
            )}

            <section className="space-y-4" aria-label="Name and link">
              <Field label="Name" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Untitled" />
              <SlugField value={slug} onChange={setSlug} onValid={setSlugOk} config={config} gifId={edit?.id} />
            </section>

            <section className="space-y-5 border-t border-line pt-6" aria-label="Output settings">
              <Slider label="Frame rate" value={fps} min={5} max={30} step={1} format={(v) => `${v} fps`} onChange={setFps} />
              <Segmented label="Width (px)" value={width} options={widthOptions} onChange={setWidth} />
              <Segmented label="Quality" value={quality} options={QUALITY} onChange={setQuality} />
              <p className="font-mono text-xs text-dim">
                {seconds(clipLen)} · {frames} frames{effH ? ` · ${effW}×${effH}` : ""}
              </p>
              {frames > 900 && (
                <p className="text-xs text-accent">That&apos;s a lot of frames. Lower the frame rate or width to keep the GIF under {config?.max_gif_mb ?? 20} MB.</p>
              )}
            </section>

            <div className="space-y-2 border-t border-line pt-6">
              {edit ? (
                <>
                  <Button variant="primary" size="lg" className="w-full" onClick={() => convert("replace")} loading={submitting} disabled={!canConvert}>
                    {ready ? "Update this GIF" : `Uploading ${Math.round((up.sent / Math.max(1, up.total)) * 100)}%…`}
                  </Button>
                  <Button size="lg" className="w-full" onClick={() => convert("create")} disabled={!canConvert}>Save as a new GIF</Button>
                  <p className="text-xs text-faint">Updating keeps the same links. The current version stays live until the new one is ready.</p>
                </>
              ) : (
                <Button variant="primary" size="lg" className="w-full" onClick={() => convert("create")} loading={submitting} disabled={!canConvert}>
                  {ready ? "Convert to GIF" : up.state === "error" ? "Upload failed" : `Uploading ${Math.round((up.sent / Math.max(1, up.total)) * 100)}%…`}
                </Button>
              )}
              {!edit && <Button variant="ghost" size="sm" onClick={chooseAnother}>Choose a different video</Button>}
            </div>
          </aside>
        </div>
      )}

      {phase === "edit" && !duration && (
        <div className="mx-auto w-full max-w-xl space-y-4 py-16">
          <UploadStatus file={file} source={source} up={up} brief={brief} onRetry={() => file && void startUpload(file)} onChoose={chooseAnother} />
          {up.state !== "error" && (
            <p className="text-center text-sm text-dim">
              {up.state === "uploading" || up.state === "processing"
                ? "Configure will be ready when the video finishes uploading and is checked."
                : "Loading video details…"}
            </p>
          )}
        </div>
      )}

      {phase === "converting" && (
        <div className="mx-auto max-w-xl space-y-6 py-12 animate-fade-in">
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-medium">{STAGE_LABEL[job?.stage ?? "queued"] ?? "Converting"}</h2>
              <span className="font-mono text-sm text-dim">{job?.stage === "encoding" || job?.stage === "finalizing" ? `${job.progress}%` : ""}</span>
            </div>
            <p className="text-sm text-dim">
              Cutting {formatTime(range.start)} to {formatTime(range.end)} at {fps} fps, {effW}px wide.
            </p>
          </div>
          <Progress value={(job?.progress ?? 0) / 100} indeterminate={!job || job.stage === "queued" || job.stage === "analyzing"} />
          <div className="flex items-center justify-between gap-3 text-sm text-dim">
            <span>This keeps running on the server, so you can leave the page. It will appear in your library.</span>
            <Button variant="ghost" size="sm" onClick={cancelJob}>Cancel</Button>
          </div>
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard")}>Go to library</Button>
        </div>
      )}

      {phase === "done" && job && (
        <GifResult gif={job} heading={doneMode === "replace" ? "GIF updated" : "GIF ready"}
          onUpdated={setJob} onDeleted={() => router.push("/dashboard")}
          footer={<>
            {edit ? <Button onClick={() => setPhase("edit")}>Keep editing</Button> : <Button onClick={chooseAnother}>Convert another</Button>}
            <BackToLibrary />
          </>} />
      )}
    </div>
  );
}

