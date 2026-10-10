"use client";
import { useRef, useState } from "react";
import type { AppConfig } from "@/lib/types";
import { bytes } from "@/lib/format";
import { cx } from "./ui";
import { FilmIcon, UploadIcon } from "./icons";

export function validateVideoFile(f: File, config: AppConfig | null): string | null {
  if (config && f.size > config.max_upload_bytes) return `That file is ${bytes(f.size)}. The limit is ${bytes(config.max_upload_bytes)}.`;
  if (f.size === 0) return "That file is empty.";
  if (!f.type.startsWith("video/") && !/\.(mp4|m4v|mov|webm|mkv|avi)$/i.test(f.name)) return "That doesn't look like a video file. Use MP4, MOV, WebM, MKV or AVI.";
  return null;
}

export function Dropzone({ config, onFile }: { config: AppConfig | null; onFile: (f: File) => void }) {
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  function accept(f: File | undefined) {
    if (!f) return;
    const problem = validateVideoFile(f, config);
    if (problem) return setError(problem);
    setError(null); onFile(f);
  }

  const limits = config && [
    config.formats.join(", "),
    `up to ${bytes(config.max_upload_bytes)}`,
    config.max_input_duration_s ? `up to ${Math.round(config.max_input_duration_s / 60)} min long` : "any length",
  ];

  return (
    <div>
      <div role="button" tabIndex={0} aria-label="Choose a video to upload"
        onClick={() => input.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } }}
        onDragEnter={(e) => { e.preventDefault(); setOver(true); }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); }}
        onDrop={(e) => { e.preventDefault(); setOver(false); accept(e.dataTransfer.files[0]); }}
        className={cx(
          "group flex min-h-[340px] cursor-pointer flex-col items-center justify-center gap-5 rounded-2xl border px-6 text-center transition duration-200",
          over ? "border-solid border-accent bg-accent/[0.06]" : "border-dashed border-line-strong hover:border-dim hover:bg-raised")}>
        <span className={cx("grid h-14 w-14 place-items-center rounded-full border transition duration-200",
          over ? "-translate-y-1 border-accent text-accent" : "border-line-strong text-dim group-hover:text-fg")}>
          {over ? <FilmIcon className="h-6 w-6" /> : <UploadIcon className="h-6 w-6" />}
        </span>
        <div className="space-y-1.5">
          <p className="text-xl font-medium tracking-tight">{over ? "Release to upload" : "Drop a video here"}</p>
          <p className="text-sm text-dim">or <span className="text-fg underline underline-offset-4">choose a file</span> from your device</p>
        </div>
        {limits && (
          <ul className="flex flex-wrap justify-center gap-x-2 gap-y-1 text-xs text-faint">
            {limits.map((l, i) => <li key={l} className="flex items-center gap-2">{i > 0 && <span aria-hidden="true">·</span>}{l}</li>)}
          </ul>
        )}
        <input ref={input} type="file" accept="video/*,.mkv,.avi,.mov,.m4v" className="hidden"
          onChange={(e) => { accept(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    </div>
  );
}
