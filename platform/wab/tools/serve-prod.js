// Static file server + /api proxy for the Plasmic frontend build.
// Replaces `local-web-server`, which wasn't reliably forwarding
// X-Forwarded-Proto to the backend (breaking secure-cookie/CSRF handling).
// This version adds gzip compression and cache headers, which the
// earlier minimal version was missing -- without them, every project
// load re-downloaded tens of MB of uncompressed, uncached JS.
const http = require("http");
const httpProxy = require("http-proxy");
const fs = require("fs");
const path = require("path");
const url = require("url");
const zlib = require("zlib");

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception in serve-prod.js (continuing):", err);
});

const PORT = process.env.PORT || 3003;
const BACKEND = process.env.BACKEND_URL || "http://localhost:3004";
const BUILD_DIR = process.env.BUILD_DIR || path.join(__dirname, "build");

const proxy = httpProxy.createProxyServer({ target: BACKEND, ws: true });

proxy.on("proxyReq", (proxyReq) => {
  proxyReq.setHeader("X-Forwarded-Proto", "https");
});

proxy.on("error", (err, req, res) => {
  console.error("Proxy error:", err.message);
  // For WebSocket upgrades, `res` is a raw net.Socket (no writeHead/headersSent).
  // For normal HTTP requests, it's a ServerResponse. Handle both without crashing.
  if (res && typeof res.writeHead === "function") {
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "text/plain" });
    }
    res.end("Bad gateway");
  } else if (res && typeof res.destroy === "function") {
    res.destroy();
  }
});

const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".map": "application/json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain",
};

const HASHED_FILENAME = /\.[0-9a-f]{6,10}\.(js|css|map)$/i;
const COMPRESSIBLE = new Set([
  ".js",
  ".css",
  ".html",
  ".json",
  ".svg",
  ".map",
  ".txt",
]);

function serveFile(filePath, req, res) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      filePath = path.join(BUILD_DIR, "index.html");
    }
    const ext = path.extname(filePath);
    const headers = { "Content-Type": MIME[ext] || "application/octet-stream" };

    headers["Cache-Control"] = HASHED_FILENAME.test(filePath)
      ? "public, max-age=31536000, immutable"
      : "no-cache";

    const acceptEncoding = req.headers["accept-encoding"] || "";
    const canGzip = COMPRESSIBLE.has(ext) && acceptEncoding.includes("gzip");

    if (canGzip) {
      headers["Content-Encoding"] = "gzip";
      headers["Vary"] = "Accept-Encoding";
      res.writeHead(200, headers);
      fs.createReadStream(filePath).pipe(zlib.createGzip()).pipe(res);
    } else {
      res.writeHead(200, headers);
      fs.createReadStream(filePath).pipe(res);
    }
  });
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url);

  if (parsed.pathname.startsWith("/api")) {
    proxy.web(req, res);
    return;
  }

  const filePath = path.join(BUILD_DIR, decodeURIComponent(parsed.pathname));
  serveFile(filePath, req, res);
});

server.on("upgrade", (req, socket, head) => {
  if (url.parse(req.url).pathname.startsWith("/api")) {
    proxy.ws(req, socket, head);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Serving ${BUILD_DIR} on :${PORT}, proxying /api -> ${BACKEND} (gzip + cache headers enabled)`
  );
});
