// Minimal static file server + /api proxy for the Plasmic frontend build.
// Replaces `local-web-server`, which was not reliably forwarding
// X-Forwarded-Proto to the backend, breaking secure-cookie/CSRF handling.
const http = require("http");
const httpProxy = require("http-proxy");
const fs = require("fs");
const path = require("path");
const url = require("url");

const PORT = process.env.PORT || 3003;
const BACKEND = process.env.BACKEND_URL || "http://localhost:3004";
const BUILD_DIR = process.env.BUILD_DIR || path.join(__dirname, "build");

const proxy = httpProxy.createProxyServer({ target: BACKEND, ws: true });

proxy.on("proxyReq", (proxyReq) => {
  proxyReq.setHeader("X-Forwarded-Proto", "https");
});

proxy.on("error", (err, req, res) => {
  console.error("Proxy error:", err.message);
  if (!res.headersSent) {
    res.writeHead(502, { "Content-Type": "text/plain" });
  }
  res.end("Bad gateway");
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

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url);

  if (parsed.pathname.startsWith("/api")) {
    proxy.web(req, res);
    return;
  }

  let filePath = path.join(BUILD_DIR, decodeURIComponent(parsed.pathname));
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      filePath = path.join(BUILD_DIR, "index.html");
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.on("upgrade", (req, socket, head) => {
  if (url.parse(req.url).pathname.startsWith("/api")) {
    proxy.ws(req, socket, head);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Serving ${BUILD_DIR} on :${PORT}, proxying /api -> ${BACKEND} (with X-Forwarded-Proto: https)`
  );
});
