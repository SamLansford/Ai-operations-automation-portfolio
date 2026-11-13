import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const dist = path.resolve("dist"),
  out = path.resolve("artifacts/site");
assert.ok(fs.existsSync(path.join(dist, "index.html")), "Build missing");
function files(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? files(path.join(dir, e.name))
        : [path.join(dir, e.name)],
    );
}
const source = files(dist);
for (const f of source) {
  const rel = path.relative(dist, f);
  assert.ok(!/(^|[\\/])(\.env|node_modules|\.git|\.local)([.\\/]|$)/.test(rel));
  assert.ok(/\.(html|css|mjs|json|svg|png)$/.test(rel) || rel === "_headers");
  const text = fs.readFileSync(f, "utf8");
  assert.ok(
    !/(N8N_API_KEY|MYSQL_PASSWORD|DEMO_WEBHOOK_KEY)\s*[:=]|C:[\\/]|http:\/\/(localhost|127\.0\.0\.1):/.test(
      text,
    ),
    "Private/local data in static artifact",
  );
  const target = path.join(out, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(f, target);
}
console.log(
  "Prepared " +
    source.length +
    " allowlisted static/report files in artifacts/site; no publication performed.",
);
