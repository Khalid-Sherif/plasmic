// Static file server + /api proxy for the Plasmic frontend build.
// Also implements a self-hosted replacement for Plasmic's cloud
// img-optimizer service (img.plasmic.app), since the studio canvas
// hardcodes image rendering through that endpoint regardless of
// where the actual asset is stored.
const http = require("http");
const https = require("https");
const httpProxy = require("http-proxy");
const fs = require("fs");
const path = require("path");
const url = require("url");
const zlib = require("zlib");
const sharp = require("sharp");

const PORT = process.env.PORT || 3003;
const BACKEND = process.env.BACKEND_URL || "http://localhost:3004";
const BUILD_DIR = process.env.BUILD_DIR || path.join(__dirname, "build");
const SITE_ASSETS_BASE_URL = process.env.SITE_ASSETS_BASE_URL || "";

const proxy = httpProxy.createProxyServer({ target: BACKEND, ws: true });

proxy.on("proxyReq", (proxyReq) => {
  proxyReq.setHeader("X-Forwarded-Proto", "https");
});

proxy.on("error", (err, req, res) => {
  console.error("Proxy error:", err.message);
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

// Fetches a URL (http or https) and returns a Buffer.
function fetchBuffer(targetUrl) {
  return new Promise((resolve, reject) => {
    const lib = targetUrl.startsWith("https:") ? https : http;
    lib
      .get(targetUrl, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`Upstream fetch failed: ${res.statusCode}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      })
      .on("error", reject);
  });
}

const FORMAT_TO_MIME = {
  webp: "image/webp",
  png: "image/png",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  avif: "image/avif",
};

async function handleImgOptimizer(req, res, pathname, query) {
  try {
    let sourceUrl;

    if (query.src) {
      // Query mode: fetch an arbitrary src URL, then transform.
      sourceUrl = query.src;
    } else {
      // Path mode: /img-optimizer/v1/img/<filename> -- raw passthrough
      // from our own asset storage.
      const filename = pathname.replace(/^\/img-optimizer\/v1\/img\//, "");
      if (!SITE_ASSETS_BASE_URL) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("SITE_ASSETS_BASE_URL not configured");
        return;
      }
      sourceUrl = SITE_ASSETS_BASE_URL + filename;
    }

    const inputBuffer = await fetchBuffer(sourceUrl);

    // If no transform params given, just pass the bytes through as-is.
    if (!query.q && !query.f && !query.w && !query.h) {
      res.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      });
      res.end(inputBuffer);
      return;
    }

    let pipeline = sharp(inputBuffer);

    const width = query.w ? parseInt(query.w, 10) : undefined;
    const height = query.h ? parseInt(query.h, 10) : undefined;
    if (width || height) {
      pipeline = pipeline.resize(width || null, height || null, {
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    const format = (query.f || "webp").toLowerCase();
    const quality = query.q ? parseInt(query.q, 10) : 75;

    if (format === "webp") {
      pipeline = pipeline.webp({ quality });
    } else if (format === "png") {
      pipeline = pipeline.png({ quality });
    } else if (format === "avif") {
      pipeline = pipeline.avif({ quality });
    } else {
      pipeline = pipeline.jpeg({ quality });
    }

    const outputBuffer = await pipeline.toBuffer();

    res.writeHead(200, {
      "Content-Type": FORMAT_TO_MIME[format] || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    });
    res.end(outputBuffer);
  } catch (err) {
    console.error("img-optimizer error:", err.message);
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end("Image optimization failed");
  }
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);

  if (parsed.pathname.startsWith("/api")) {
    proxy.web(req, res);
    return;
  }

  if (parsed.pathname.startsWith("/img-optimizer/v1/img")) {
    handleImgOptimizer(req, res, parsed.pathname, parsed.query);
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
    `Serving ${BUILD_DIR} on :${PORT}, proxying /api -> ${BACKEND}, img-optimizer enabled`
  );
});
