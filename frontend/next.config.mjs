/**
 * API_ORIGIN is the public https:// origin of the FastAPI service (no trailing slash).
 * Rewrites are resolved at BUILD time on Vercel, so changing it requires a redeploy.
 * The browser only ever talks to this site for /api and /g, which keeps the session cookie first-party.
 * (Video chunks are the exception: they go straight to the API, see UPLOAD_BASE_URL in the README.)
 */
const api = (process.env.API_ORIGIN || "").replace(/\/+$/, "");
if (!api && (process.env.VERCEL || process.env.NODE_ENV === "production")) {
  console.warn("[loop] API_ORIGIN is not set. /api requests will fail until you set it and redeploy.");
}
const target = api || "http://localhost:8000";

/** @type {import('next').NextConfig} */
const config = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Vercel builds its own output; "standalone" is only for the Docker image.
  ...(process.env.DOCKER_BUILD ? { output: "standalone" } : {}),
  async rewrites() {
    return {
      // Run before filesystem routes so /g/name.gif is never mistaken for the /g/[name] page.
      beforeFiles: [
        { source: "/g/:file([0-9A-Za-z_-]{3,40}\\.(?:gif|jpg))", destination: `${target}/g/:file` },
      ],
      afterFiles: [{ source: "/api/:path*", destination: `${target}/api/:path*` }],
      fallback: [],
    };
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ],
    }];
  },
};
export default config;
