import {handleReliability} from "./reliability-api.mjs";
import {contentPolicy} from "./security-headers.mjs";
import { forwardLocalDemo } from "./local-demo-proxy.mjs";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
if (process.argv.includes("--build")) await import("./build.mjs");
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist",
);
if (!fs.existsSync(path.join(root, "index.html")))
  throw Error("Run npm run build first");
const port = Number(process.env.PORT || 4173);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw Error("Invalid local port");
const worker=process.env.SAFE_VALIDATION_WORKER==='1';
const validation=worker?null:(await import('./safe-validation.mjs')).createSafeValidation({port,enabled:process.env.SAFE_VALIDATION_ENABLED==='1'});
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};
const server = http.createServer((req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  if(worker&&(req.url?.startsWith('/api/')||req.url?.startsWith('/__local-demo/'))){res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({error:'ISOLATED_WORKER'}));return;}
  if(req.url?.startsWith('/api/validation/')){void validation.handle(req,res);return;}
  if(req.url?.startsWith("/api/reliability/")){void handleReliability(req,res,port);return;}
  if (req.url?.startsWith("/__local-demo/")) {
    void forwardLocalDemo(req,res,{port});
    return;
  }
  if (!["GET", "HEAD"].includes(req.method)) {
    res.writeHead(405);
    return res.end();
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://local").pathname);
  } catch {
    res.writeHead(400);
    return res.end();
  }
  // Local preview only: open the existing protected UI, never proxy credentials or APIs.
  if (pathname === "/__local-demo") {
    res.writeHead(302, { Location: "http://127.0.0.1:8787/support-ticket" });
    return res.end();
  }
  res.setHeader("Content-Security-Policy",contentPolicy(pathname.startsWith("/demo-frame/")));
  const file = path.resolve(root, "." + pathname);
  if (file !== root && !file.startsWith(root + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  let dest = file;
  try {
    if (fs.statSync(dest).isDirectory()) dest = path.join(dest, "index.html");
  } catch {}
  if (!fs.existsSync(dest) || !fs.statSync(dest).isFile()) {
    res.writeHead(404, { "content-type": mime[".html"] });
    return res.end(fs.readFileSync(path.join(root, "404.html")));
  }
  res.writeHead(200, {
    "content-type": mime[path.extname(dest)] || "application/octet-stream",
  });
  res.end(req.method === "HEAD" ? undefined : fs.readFileSync(dest));
});
server.requestTimeout = 10000;
server.listen(port, "127.0.0.1", () =>
  console.log("Portfolio local preview: http://127.0.0.1:" + port),
);
for (const sig of ["SIGINT", "SIGTERM"])
  process.on(sig, async () => {await validation?.close();server.close(() => process.exit(0));});
