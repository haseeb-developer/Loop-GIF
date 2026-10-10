# Loop

Video to GIF. Upload a video of any length, pick an exact range, name it, and share a link that previews properly in Discord, WhatsApp, Slack and more.

- Resumable chunked uploads, so 10+ minute videos and multi-GB files work, and survive flaky connections
- Exact source duration (stream, then container, then a packet scan as fallback)
- A custom timeline: millisecond inputs, drag handles, zoom, nudge keys, loop preview
- Custom names and URLs (`/g/cat_edit.gif`) plus a permanent random link that never changes
- Library with search, filters, sorting, grid/list, rename, regenerate, edit, delete
- Delete is immediate: the GIF's links stop serving at once
- Two-pass palette encoding, with progress, cancel, timeouts and restart recovery

## Architecture

```
Browser ──► Vercel (Next.js)  ── /api/*, /g/*.gif|jpg ──rewrite──► API (FastAPI + FFmpeg + Postgres, Docker host)
   │                                                                     ▲
   └──────────── video chunks (PUT, Bearer token, CORS) ────────────────┘
```

Vercel hosts only the web app. FFmpeg, Postgres and file storage can't run there, so the API runs on any Docker host (Fly.io, Railway, a VPS). The web app proxies `/api` so the session cookie is first-party. Video chunks go straight to the API because Vercel limits request body sizes.

## Run locally

```bash
cp .env.example .env      # set POSTGRES_PASSWORD and SECRET_KEY
docker compose up --build
```

Open http://localhost:3000. GIFs are served from `http://localhost:8000/g/<name>.gif`.

Without Docker for the web app: `cd frontend && npm install && npm run dev` (set `API_ORIGIN=http://localhost:8000`). The API needs Postgres and FFmpeg: `cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload`.

For a small local-only setup without Docker or PostgreSQL, the API also supports SQLite. In PowerShell, run from the repository root:

```powershell
Set-Location backend
python -m pip install -r requirements.txt
$env:DATABASE_URL = "sqlite:///./loop-dev.db"
$secretBytes = [byte[]]::new(48)
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($secretBytes)
$env:SECRET_KEY = [Convert]::ToBase64String($secretBytes)
$rng.Dispose()
$env:STORAGE_DIR = "./data/media"
$env:SOURCE_DIR = "./data/sources"
$env:TMP_DIR = "./data/tmp"
python -m uvicorn app.main:app --reload
```

Keep the frontend dev server running in another terminal at http://localhost:3000. SQLite creates a new local database, so create an account at `/signup` before signing in. This is intended for local development; use PostgreSQL for deployment.

## Deploy: GitHub → Vercel (web) + Railway (API)

Vercel deploys the Next.js frontend only. The FastAPI backend cannot run as a Vercel deployment: it needs FFmpeg, a persistent filesystem, Postgres, and a long-running worker for conversions. Deploy the API separately to Railway; the committed [backend/Railway configuration](backend/railway.toml) builds its Dockerfile, honors Railway's `PORT`, and health-checks `/healthz`.

### 1. API (Railway)

1. Create a Railway project from this GitHub repository and add a PostgreSQL service.
2. Add a service from the same repository with **Root Directory** `backend`; Railway uses `backend/railway.toml` and `backend/Dockerfile`.
3. Attach a persistent Railway volume mounted at `/data`. GIFs and source videos are stored there; an ephemeral filesystem loses them on redeploy.
4. Set these API service variables (Railway's generated `postgres://`/`postgresql://` database URL is normalized to psycopg3 automatically):

| Variable            | Value                                                                 |
| ------------------- | --------------------------------------------------------------------- |
| `DATABASE_URL`      | `${{Postgres.DATABASE_URL}}` (Railway variable reference)              |
| `SECRET_KEY`        | At least 32 random characters                                         |
| `COOKIE_SECURE`     | `true`                                                                |
| `TRUST_PROXY`       | `true` when Railway's trusted proxy supplies client IPs               |
| `CORS_ORIGINS`      | Exact Vercel production origin and custom web domain, comma separated |
| `CORS_ORIGIN_REGEX` | Optional: `https://.*\.vercel\.app` for preview deployments          |
| `PUBLIC_BASE_URL`   | Public API origin, e.g. `https://loop-api-production.up.railway.app`  |
| `UPLOAD_BASE_URL`   | The same public API origin; video chunks upload directly here         |
| `WEB_BASE_URL`      | Vercel production origin, e.g. `https://loop-gif.vercel.app`          |

Generate a Railway public domain for the API. Keep `PUBLIC_BASE_URL` and `UPLOAD_BASE_URL` set to that API domain so Discord can fetch direct GIFs and large video chunks bypass Vercel. Do not use `localhost` in production.

### 2. Web (Vercel)

1. Push the repo to GitHub and import it in Vercel.
2. Set **Root Directory** to `frontend`. The framework is detected as Next.js; no build overrides are needed.
3. Add `API_ORIGIN=https://<your-public-railway-api-domain>` (no trailing slash) for Production and Preview. Also allow those web origins in the Railway API's `CORS_ORIGINS`.
4. Deploy. `API_ORIGIN` is read at build time for the rewrites, and at runtime by the share page, so **changing it needs a redeploy**.

There are no native or Vercel-specific dependencies: only `next`, `react` and `react-dom`. `output: "standalone"` is only enabled for the Docker image (`DOCKER_BUILD`), never on Vercel.

### 3. Verify both services

- Railway API: open `https://<api-domain>/healthz`; it must return `{"ok":true}`.
- Vercel web: open `/api/config`; it must return API configuration (not a 404/502). Verify its `public_base_url` is the public API domain.
- Sign up, upload, convert, then open the direct `.gif` URL. It must return HTTP 200 and `Content-Type: image/gif`.
- Railway must keep its Postgres service and `/data` volume attached. Vercel does not deploy or host these backend services.

### 4. Check it

- Sign up on the Vercel URL, upload a video, convert.
- Open the direct link: `Content-Type: image/gif`.
- Paste the share page (`/g/<name>`) into Slack/WhatsApp for the card, and the `.gif` link into Discord for inline playback.
- Delete the GIF and reload both links: they 404.

## Sharing and previews

- `/g/<name>.gif` is the direct file (Discord plays it inline; forums and `<img>` tags work).
- Share the direct `.gif` URL in Discord (not the `/g/<name>` HTML share page). `PUBLIC_BASE_URL` must be a publicly reachable HTTPS origin; `localhost` links only work on your own computer and cannot be fetched by Discord.
- `/g/<name>` is a share page with Open Graph and Twitter card metadata (`og:image` is a JPEG poster of the first frame), which WhatsApp, Slack, iMessage and X use for the card. It is `noindex`.
- `Cache-Control: public, no-cache` with an `ETag`: caches must revalidate every time, so a deleted GIF can't be served from a browser or CDN cache. Unchanged GIFs cost a 304. Third-party platforms that already copied an image (Discord's CDN, a WhatsApp preview) may keep their own copy; no server can recall that.

## Limits (all configurable)

|                    | Default                            |
| ------------------ | ---------------------------------- |
| Upload size        | 2 GB                               |
| Source duration    | unlimited                          |
| Clip length        | 0.2 s to 60 s                      |
| Output width       | up to 1280 px                      |
| GIF size           | 20 MB                              |
| Playback speed     | 0.25× to 3×                        |
| Source videos kept | 72 h after last use, 8 GB per user |

## Security notes

- Uploads are checked by magic bytes, then `ffprobe`. Extension and MIME type are ignored. Size is enforced while chunks stream in.
- FFmpeg runs via argv (no shell), `-protocol_whitelist file`, a hard timeout, a stall watchdog and an output-size cap. Filenames never reach a command line.
- Storage keys are server-generated and validated.
- Auth: argon2id, httpOnly `SameSite=Lax` session cookie, Origin check on state-changing requests. Upload tokens are a separate, short-lived token type, valid for one source. Every owner query filters on `user_id`.
- Rate limits on login, signup, source creation, chunks, conversions and frame previews.

## Scaling notes and known limitations

- The rate limiter and job queue are in-process: **run one API process**. For more, move them to Redis and a worker behind `jobs.submit`.
- Storage is a local volume behind `storage.base.Storage`; implement it for S3/R2 and CDN.
- A freed custom URL can be claimed by anyone else.
- A GIF whose source video has expired can still be renamed and re-linked, but re-editing needs the video uploaded again, as a new GIF.
- Schema changes are applied by idempotent statements in `backend/app/migrate.py` at startup; adopt Alembic before larger changes.
- Restarting the API re-queues interrupted conversions whose source video is still stored.
