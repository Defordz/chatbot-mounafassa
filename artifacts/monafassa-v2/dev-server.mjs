import http from "http";
import { readFile, stat } from "fs/promises";
import { join, extname } from "path";
import { fileURLToPath } from "url";
import { createReadStream } from "fs";

const PORT = Number(process.env.PORT || 3000);
const API_HOST = "localhost";
const API_PORT = 8080;

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const staticDir = join(__dirname, "dist", "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function proxyToApi(req, res) {
  const options = {
    hostname: API_HOST,
    port: API_PORT,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `${API_HOST}:${API_PORT}` },
  };
  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(502);
      res.end("Upstream error");
    }
  });
  req.pipe(proxyReq);
}

const server = http.createServer(async (req, res) => {
  const url = (req.url || "/").split("?")[0];

  if (url === "/" || url === "") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }

  if (url.startsWith("/api/")) {
    proxyToApi(req, res);
    return;
  }

  if (url.startsWith("/monafassa-v2/")) {
    const relative = url.slice("/monafassa-v2/".length) || "index.html";
    const filePath = join(staticDir, relative);

    try {
      const s = await stat(filePath);
      if (s.isFile()) {
        const mime = MIME[extname(filePath)] || "application/octet-stream";
        res.writeHead(200, { "Content-Type": mime });
        createReadStream(filePath).pipe(res);
        return;
      }
    } catch {}

    try {
      const html = await readFile(join(staticDir, "index.html"), "utf-8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
    return;
  }

  proxyToApi(req, res);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`✓ Monafassa v2 dev server listening on port ${PORT}`);
  console.log(`  → http://localhost:${PORT}/monafassa-v2/`);
});
