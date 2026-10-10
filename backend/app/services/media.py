"""FFmpeg/ffprobe wrappers. Nothing here touches the DB or HTTP.

Safety rules:
- argv lists only, never a shell
- user filenames never reach a command line (inputs are server-named files)
- `-protocol_whitelist file` blocks network/concat/playlist tricks
- hard timeout, stall watchdog, output-size watchdog, cancellation, minimal environment

Memory: GIFs are made with two passes (palette file, then encode) instead of one split filter
graph, because `split` + `palettegen` makes FFmpeg buffer every frame of the clip in RAM.
"""
import json
import logging
import math
import os
import subprocess
import tempfile
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from ..config import settings

log = logging.getLogger("loop.media")

ALLOWED_FORMATS = {"mov", "mp4", "matroska", "webm", "avi"}  # ffprobe format_name tokens
UNSUPPORTED = "Unsupported file. Use MP4, MOV, WebM, MKV or AVI."
QUALITY = {
    "low": {"colors": 64, "dither": "bayer:bayer_scale=5"},
    "balanced": {"colors": 128, "dither": "bayer:bayer_scale=3"},
    "high": {"colors": 256, "dither": "sierra2_4a"},
}
_MOV_BOXES = {b"moov", b"mdat", b"free", b"wide", b"skip", b"pnot"}
_frame_slots = threading.BoundedSemaphore(4)  # concurrent preview-frame extractions


class MediaError(Exception):
    def __init__(self, message: str, status: int = 422) -> None:
        super().__init__(message)
        self.message = message
        self.status = status


class Cancelled(Exception):
    pass


@dataclass
class SourceInfo:
    duration: float  # seconds, exact to the millisecond
    width: int
    height: int
    fps: float | None


def _env() -> dict[str, str]:
    return {"PATH": os.environ.get("PATH", "/usr/bin:/bin")}


def _num(v: object) -> float | None:
    try:
        f = float(v)  # type: ignore[arg-type]
        return f if math.isfinite(f) else None
    except (TypeError, ValueError):
        return None


def _rate(v: str | None) -> float | None:
    if not v or "/" not in v:
        return _num(v)
    a, _, b = v.partition("/")
    na, nb = _num(a), _num(b)
    return na / nb if na is not None and nb else None


def _gif_fps_expr(fps: float) -> str:
    """Choose a constant frame cadence representable by GIF's 10 ms time base.

    Arbitrary rates such as 15 fps alternate 60/70 ms frame delays in GIF, which can look uneven
    across players. Quantizing to a whole centisecond gives each frame the same delay.
    """
    delay_cs = max(1, round(100 / max(0.1, fps)))
    return f"100/{delay_cs}"


def sniff_container(path: Path) -> str | None:
    """Identify container by magic bytes. Extension and client MIME are never consulted."""
    with open(path, "rb") as f:
        head = f.read(16)
    if len(head) >= 12 and (head[4:8] == b"ftyp" or head[4:8] in _MOV_BOXES):
        return "mp4"
    if head[:4] == b"\x1a\x45\xdf\xa3":
        return "matroska"
    if head[:4] == b"RIFF" and head[8:12] == b"AVI ":
        return "avi"
    return None


def _probe(path: Path, timeout: int = 60) -> dict:
    cmd = [settings.ffprobe_bin, "-v", "error", "-protocol_whitelist", "file", "-print_format", "json",
           "-show_format", "-show_streams", str(path)]
    try:
        out = subprocess.run(cmd, capture_output=True, timeout=timeout, env=_env(), cwd=tempfile.gettempdir(),
                             stdin=subprocess.DEVNULL, check=False)
    except subprocess.TimeoutExpired:
        raise MediaError("Reading this video took too long.") from None
    if out.returncode != 0:
        log.warning("ffprobe rejected %s (exit %s): %s", path.name, out.returncode,
                    out.stderr.decode(errors="replace")[-1000:].strip())
        raise MediaError("This file isn't a readable video.", 415)
    try:
        return json.loads(out.stdout)
    except json.JSONDecodeError:
        raise MediaError("This file isn't a readable video.", 415) from None


def scan_duration(path: Path, timeout: int = 900) -> float | None:
    """Exact duration for files whose headers don't state one (some WebM/MKV/AVI).

    Copies packets to a null muxer, which reads the whole file without decoding, and reports the
    last timestamp. Slower than reading headers but still I/O bound, not CPU bound.
    """
    cmd = [settings.ffmpeg_bin, "-hide_banner", "-nostdin", "-loglevel", "error", "-nostats",
           "-protocol_whitelist", "file", "-i", str(path), "-map", "0:v:0", "-c", "copy", "-an", "-sn", "-dn",
           "-progress", "pipe:1", "-f", "null", "-"]
    try:
        out = subprocess.run(cmd, capture_output=True, timeout=timeout, env=_env(), cwd=tempfile.gettempdir(),
                             stdin=subprocess.DEVNULL, text=True, check=False)
    except subprocess.TimeoutExpired:
        return None
    last = None
    for line in out.stdout.splitlines():
        key, _, val = line.strip().partition("=")
        if key in ("out_time_us", "out_time_ms") and val.isdigit():
            last = int(val) / 1_000_000
    return last if last and last > 0 else None


def validate_source(path: Path) -> SourceInfo:
    """Check an uploaded file by content and read its true properties. Raises MediaError."""
    if sniff_container(path) is None:
        raise MediaError(UNSUPPORTED, 415)
    data = _probe(path)
    names = set((data.get("format", {}).get("format_name") or "").split(","))
    if not names & ALLOWED_FORMATS:
        raise MediaError(UNSUPPORTED, 415)
    streams = [s for s in data.get("streams", [])
               if s.get("codec_type") == "video" and not s.get("disposition", {}).get("attached_pic")]
    if not streams:
        raise MediaError("No video track found in this file.", 415)
    v = streams[0]
    w, h = int(v.get("width") or 0), int(v.get("height") or 0)
    if w <= 0 or h <= 0:
        raise MediaError("Couldn't read the video dimensions.", 415)
    if max(w, h) > settings.max_input_side_px:
        raise MediaError(f"Video is {w}×{h}. The longest side can be at most {settings.max_input_side_px}px.")

    fps = _rate(v.get("avg_frame_rate")) or _rate(v.get("r_frame_rate"))
    if fps and fps > settings.max_input_fps:
        raise MediaError(f"Video runs at {fps:.0f} fps. The limit is {settings.max_input_fps} fps.")
    # GIFs are video-only, so the video track's own length wins over the container (which may include longer audio).
    duration = _num(v.get("duration")) or _num(data.get("format", {}).get("duration"))
    if not duration or duration <= 0:
        scanned = scan_duration(path)
        # The scan reports where the last frame starts; add that frame's own length.
        duration = scanned + (1 / fps if fps and fps > 0 else 0) if scanned else None
    if not duration or duration <= 0:
        raise MediaError("Couldn't read the video length.", 415)
    if settings.max_input_duration_s and duration > settings.max_input_duration_s:
        raise MediaError(f"Video is {duration:.0f}s long. The limit is {settings.max_input_duration_s}s.")
    return SourceInfo(duration=round(duration, 3), width=w, height=h, fps=round(fps, 3) if fps else None)


def _run_ffmpeg(cmd: list[str], *, cancel: threading.Event, timeout: int, cwd: Path,
                on_frac: Callable[[float], None] | None = None, total_us: float = 0.0,
                stall: int = 0, size_path: Path | None = None) -> tuple[int, str | None, str]:
    """Run FFmpeg under a watchdog. Returns (returncode, kill_reason, stderr_tail)."""
    state: dict = {"reason": None, "last_us": -1, "last_change": time.monotonic()}
    done = threading.Event()
    started = time.monotonic()
    with tempfile.TemporaryFile() as errf:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=errf, stdin=subprocess.DEVNULL, text=True,
                                env=_env(), cwd=cwd)

        def watchdog() -> None:
            while not done.wait(0.5):
                now = time.monotonic()
                reason = None
                if cancel.is_set():
                    reason = "cancel"
                elif now - started > timeout:
                    reason = "timeout"
                elif stall and now - state["last_change"] > stall:
                    reason = "stall"
                elif size_path is not None:
                    try:
                        if size_path.stat().st_size > settings.max_gif_bytes:
                            reason = "size"
                    except FileNotFoundError:
                        pass
                if reason:
                    state["reason"] = reason
                    proc.kill()
                    return

        wd = threading.Thread(target=watchdog, daemon=True)
        wd.start()
        try:
            assert proc.stdout is not None
            for line in proc.stdout:
                key, _, val = line.strip().partition("=")
                if key in ("out_time_us", "out_time_ms") and val.isdigit():
                    us = int(val)
                    if us != state["last_us"]:
                        state["last_us"], state["last_change"] = us, time.monotonic()
                        if on_frac and total_us:
                            on_frac(min(0.99, us / total_us))
            proc.wait()
        finally:
            done.set()
            wd.join(2)
            if proc.poll() is None:
                proc.kill()
                proc.wait()
        errf.seek(0)
        tail = errf.read()[-600:].decode("utf-8", "replace")
    return proc.returncode, state["reason"], tail


@dataclass
class GifResult:
    width: int
    height: int
    duration_ms: int
    size_bytes: int


def convert_to_gif(src: Path, dst: Path, cfg: dict, on_progress: Callable[[str, float], None],
                   cancel: threading.Event) -> GifResult:
    """cfg: start, end (seconds into the source), fps, width, quality. Two passes: palette, then encode."""
    q = QUALITY[cfg["quality"]]
    start, length = float(cfg["start"]), float(cfg["end"]) - float(cfg["start"])
    speed = float(cfg.get("speed", 1.0))
    fps, width = int(cfg["fps"]), int(cfg["width"])
    workdir = dst.parent
    palette = workdir / "palette.png"
    head = [settings.ffmpeg_bin, "-hide_banner", "-nostdin", "-loglevel", "error", "-nostats",
            "-protocol_whitelist", "file", "-threads", str(settings.ffmpeg_threads)]
    seek = ["-ss", f"{start:.3f}", "-t", f"{length:.3f}", "-i", str(src)]

    def check(code: int, reason: str | None, tail: str, what: str) -> None:
        if reason == "cancel":
            raise Cancelled()
        if reason == "timeout":
            raise MediaError("Conversion took too long. Try a shorter clip or a smaller width.", 500)
        if reason == "stall":
            raise MediaError("Conversion stopped making progress. Try again, or use a shorter clip.", 500)
        if reason == "size":
            raise MediaError(f"The GIF passed the {settings.effective_max_gif_mb} MB limit.", 500)
        if code != 0:
            log.error("ffmpeg %s failed (%s): %s", what, code, tail)
            raise MediaError("Conversion failed. Try different settings.", 500)

    # Keep the best-fitting encode while searching upward for the largest dimensions that fit.
    # If even the minimum width is too large, progressively reduce FPS, then palette colors.
    limit = settings.max_gif_bytes
    min_width, min_fps, min_colors = 64, 1, 2
    encoded_width = max(min_width, width - width % 2)
    encoded_fps, encoded_colors, dither = fps, q["colors"], q["dither"]
    fit_width: int | None = None
    failed_width: int | None = None
    best_path: Path | None = None
    best_size = 0
    best_width, best_fps, best_colors = encoded_width, encoded_fps, encoded_colors
    attempt = 0

    while True:
        attempt += 1
        palette = workdir / f"palette-{attempt}.png"
        candidate = dst.with_name(f"{dst.stem}.attempt-{attempt}.gif")

        on_progress("analyzing", 0.0)
        palette_fps = _gif_fps_expr(min(encoded_fps, 12))
        output_fps = _gif_fps_expr(encoded_fps)
        palette_filter = (f"setpts=PTS/{speed:.4f},fps={palette_fps},"
                  f"scale={min(encoded_width, 480)}:-2:flags=lanczos,"
                          f"palettegen=max_colors={encoded_colors}:stats_mode=diff")
        code, reason, tail = _run_ffmpeg(
            head + seek + ["-an", "-sn", "-dn", "-vf", palette_filter, "-frames:v", "1", "-update", "1",
                           "-f", "image2", "-y", str(palette)],
            cancel=cancel, timeout=settings.ffmpeg_timeout_s, cwd=workdir)
        check(code, reason, tail, "palette")
        if not palette.exists():
            raise MediaError("Conversion failed. Try different settings.", 500)

        on_progress("encoding", 0.0)
        graph = (f"[0:v]setpts=PTS/{speed:.4f},fps={output_fps},"
             f"scale={encoded_width}:-2:flags=lanczos[x];"
                 f"[x][1:v]paletteuse=dither={dither}:diff_mode=rectangle")
        code, reason, tail = _run_ffmpeg(
            head + seek + ["-i", str(palette), "-an", "-sn", "-dn", "-map_metadata", "-1", "-lavfi", graph,
                           "-loop", "0", "-progress", "pipe:1", "-f", "gif", "-y", str(candidate)],
            cancel=cancel, timeout=settings.ffmpeg_timeout_s, cwd=workdir,
            on_frac=lambda f: on_progress("encoding", f), total_us=length * 1_000_000,
            stall=settings.ffmpeg_stall_s, size_path=candidate)
        size = candidate.stat().st_size if candidate.is_file() else 0
        too_large = reason == "size" or size > limit
        palette.unlink(missing_ok=True)

        if too_large:
            candidate.unlink(missing_ok=True)
            if encoded_width > min_width:
                failed_width = encoded_width
                if fit_width is None:
                    ratio = min(0.92, (limit / max(size, limit + 1)) ** 0.5 * 0.92)
                    next_width = max(min_width, int(encoded_width * ratio) // 2 * 2)
                    if next_width >= encoded_width:
                        next_width = encoded_width - 2
                elif failed_width - fit_width > 16:
                    next_width = ((fit_width + failed_width) // 4) * 2
                else:
                    break  # best_path is already the highest tested width within the cap
                encoded_width = max(min_width, next_width)
                log.info("GIF exceeded %s MB; retrying at %s px", settings.effective_max_gif_mb, encoded_width)
                continue

            if encoded_fps > min_fps:
                ratio = max(0.35, min(0.8, limit / max(size, limit + 1) * 0.9))
                encoded_fps = max(min_fps, min(encoded_fps - 1, int(encoded_fps * ratio)))
                encoded_width, fit_width, failed_width = max(min_width, width - width % 2), None, None
                log.info("GIF still exceeds %s MB; retrying at %s fps", settings.effective_max_gif_mb, encoded_fps)
                continue

            if encoded_colors > min_colors:
                encoded_colors = max(min_colors, encoded_colors // 2)
                encoded_fps = min(fps, max(min_fps, encoded_fps))
                encoded_width, fit_width, failed_width = max(min_width, width - width % 2), None, None
                dither = "bayer:bayer_scale=5"
                log.info("GIF still exceeds %s MB; retrying with %s colors", settings.effective_max_gif_mb, encoded_colors)
                continue

            raise MediaError(f"Couldn't fit this clip under {settings.effective_max_gif_mb} MB, even at the minimum dimensions, FPS and colors.", 500)

        check(code, reason, tail, "encode")
        if size <= 0:
            raise MediaError("Conversion failed. Try different settings.", 500)
        if best_path is not None:
            best_path.unlink(missing_ok=True)
        best_path, best_size = candidate, size
        best_width, best_fps, best_colors = encoded_width, encoded_fps, encoded_colors
        fit_width = encoded_width

        if failed_width is not None and failed_width - fit_width > 16:
            encoded_width = ((fit_width + failed_width) // 4) * 2
            continue
        break

    if best_path is None or best_size > limit:
        raise MediaError(f"Couldn't produce a GIF under {settings.effective_max_gif_mb} MB.", 500)
    os.replace(best_path, dst)
    cfg["width"], cfg["fps"] = best_width, best_fps
    cfg["quality"] = "low" if best_colors <= 64 else "balanced" if best_colors <= 128 else "high"
    size = dst.stat().st_size
    if size > limit:
        dst.unlink(missing_ok=True)
        raise MediaError("Final GIF exceeded the 20 MB safety limit.", 500)
    info = _probe(dst, timeout=30)
    vs = next((s for s in info.get("streams", []) if s.get("codec_type") == "video"), {})
    real = _num(info.get("format", {}).get("duration")) or length
    return GifResult(width=int(vs.get("width") or encoded_width), height=int(vs.get("height") or 0),
                     duration_ms=int(real * 1000), size_bytes=size)


def make_poster(gif: Path, dst: Path, at: float = 0.0, max_width: int = 800) -> None:
    """Static JPEG of the GIF: grid thumbnails and the Open Graph image (small enough for WhatsApp)."""
    probe = _probe(gif, timeout=30)
    w = next((int(s.get("width") or 0) for s in probe.get("streams", []) if s.get("codec_type") == "video"), 0)
    scale = f"scale={min(max_width, w) if w else max_width}:-2"
    cmd = [settings.ffmpeg_bin, "-hide_banner", "-nostdin", "-loglevel", "error", "-protocol_whitelist", "file",
           "-ss", f"{max(0.0, at):.3f}", "-i", str(gif), "-frames:v", "1", "-vf", scale, "-q:v", "5", "-f", "image2",
           "-y", str(dst)]
    r = subprocess.run(cmd, capture_output=True, timeout=30, env=_env(), cwd=dst.parent,
                       stdin=subprocess.DEVNULL, check=False)
    if r.returncode != 0 or not dst.exists():  # seeking past a very short GIF: fall back to the first frame
        cmd[cmd.index("-ss") + 1] = "0"
        r = subprocess.run(cmd, capture_output=True, timeout=30, env=_env(), cwd=dst.parent,
                   stdin=subprocess.DEVNULL, check=False)
        if r.returncode != 0 or not dst.exists():
            raise MediaError("Couldn't create the preview image.", 500)


def frame_jpeg(src: Path, t: float, width: int) -> bytes:
    """One JPEG frame at time t, for scrubbing videos the browser can't play (MKV, AVI, HEVC...)."""
    cmd = [settings.ffmpeg_bin, "-hide_banner", "-nostdin", "-loglevel", "error", "-protocol_whitelist", "file",
           "-ss", f"{max(0.0, t):.3f}", "-i", str(src), "-frames:v", "1", "-an", "-vf", f"scale={width}:-2",
           "-q:v", "5", "-f", "mjpeg", "pipe:1"]
    if not _frame_slots.acquire(timeout=10):
        raise MediaError("Preview is busy. Try again.", 503)
    try:
        r = subprocess.run(cmd, capture_output=True, timeout=30, env=_env(), cwd=tempfile.gettempdir(),
                           stdin=subprocess.DEVNULL, check=False)
    except subprocess.TimeoutExpired:
        raise MediaError("Preview took too long.", 504) from None
    finally:
        _frame_slots.release()
    if r.returncode != 0 or not r.stdout:
        raise MediaError("Couldn't read a frame at that time.", 422)
    return r.stdout
