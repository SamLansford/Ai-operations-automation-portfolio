import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { parse } from "yaml";
import { projects, profile } from "../src/projects.mjs";
import { renderer } from "../src/render.mjs";
const results = [];
function check(name, fn) {
  try {
    fn();
    results.push({ name, status: "passed" });
    console.log("PASS " + name);
  } catch {
    results.push({ name, status: "failed" });
    console.error("FAIL " + name);
    process.exitCode = 1;
  }
}
const routes = [
  "",
  "projects/",
  "support-ticket/",
  "evidence/",
  "reports/",
];
const read = (r) => fs.readFileSync("dist/" + r + "index.html", "utf8");
const pages = routes.map((r) => ({ route: r, html: read(r) }));
check("Project identifiers and required metadata", () => {
  assert.equal(new Set(projects.map((p) => p.id)).size, projects.length);
  for (const p of projects) {
    assert.match(p.id, /^[a-z-]+$/);
    for (const k of ["title", "summary", "mode", "sources", "sourceDate"])
      assert.ok(p[k]);
    assert.ok(
      p.flow.length >= 3 &&
        p.capabilities.length >= 4 &&
        p.challenges.length >= 2,
    );
  }
});
check("Support project required technologies and verified counts", () => {
  const p = projects.find((p) => p.id === "support-ticket");
  assert.deepEqual(p.technologies, [
    "n8n",
    "JavaScript",
    "MySQL",
    "Docker",
    "Ollama",
  ]);
  assert.equal(
    p.evidence.find((e) => e.label === "Demo integration checks").count,
    14,
  );
});
check("Only the selected project is published", () => {
  assert.deepEqual(projects.map(p => p.id), ["support-ticket"]);
  assert.equal(fs.existsSync("dist/business-chatbot/index.html"), false);
});
check("No placeholder URLs impersonate deployed demos/reports/resume", () => {
  for (const p of projects) {
    assert.equal(p.demoUrl, null);
    assert.equal(p.reportUrl, null);
    if (p.repository) assert.match(p.repository, /^https:\/\/github\.com\//);
  }
  assert.equal(profile.resume, null);
  assert.equal(profile.email, null);
});
check("Every page has a unique useful title and description", () => {
  const titles = [];
  for (const { html } of pages) {
    const t = html.match(/<title>([^<]+)<\/title>/)?.[1];
    assert.ok(t && t.length > 10);
    titles.push(t);
    assert.match(html, /<meta name="description" content="[^"]{25,}"/);
  }
  assert.equal(new Set(titles).size, pages.length);
});
check("Language, viewport, one main heading and landmarks", () => {
  for (const { html } of pages) {
    assert.match(html, /<html lang="en">/);
    assert.match(html, /name="viewport"/);
    assert.equal((html.match(/<h1[ >]/g) || []).length, 1);
    assert.equal((html.match(/<main[ >]/g) || []).length, 1);
    assert.match(html, /aria-label="Primary navigation"/);
    assert.match(html, /class="skip" href="#main"/);
  }
});
check("No duplicate element IDs", () => {
  for (const { html } of pages) {
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(new Set(ids).size, ids.length);
  }
});
check("Internal links and fragment targets resolve", () => {
  for (const { route, html } of pages)
    for (const m of html.matchAll(/href="([^"]+)"/g)) {
      if (/^https:/.test(m[1])) continue;
      const u = new URL(m[1], "https://portfolio.invalid/" + route);
      let f = "dist" + decodeURIComponent(u.pathname);
      if (f.endsWith("/")) f += "index.html";
      assert.ok(fs.existsSync(f), "missing target");
      if (u.hash) {
        const target = fs.readFileSync(f, "utf8");
        assert.ok(target.includes('id="' + u.hash.slice(1) + '"'));
      }
    }
});
check("Local stylesheet, module and favicon exist", () => {
  for (const { html } of pages)
    for (const m of html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g))
      assert.ok(fs.existsSync("dist" + m[1]));
});
check("External links use HTTPS and safe new-tab rel", () => {
  for (const { html } of pages)
    for (const m of html.matchAll(/<a[^>]+href="(https:[^"]+)"[^>]*>/g)) {
      assert.ok(m[0].includes('rel="noopener noreferrer"'));
      assert.ok(!/localhost|127\.0\.0\.1/.test(m[1]));
      if (new URL(m[1]).hostname === "github.com")
        assert.equal(m[1], "https://github.com/SamLansford/Ai-operations-automation-portfolio");
    }
});
check(
  "No private endpoints, absolute local paths or credential configuration in build",
  () => {
    for (const { html } of pages)
      assert.ok(
        !/localhost|127\.0\.0\.1|[A-Z]:[\\/]|N8N_API_KEY|MYSQL_PASSWORD|api\/v1|webhook\//.test(
          html,
        ),
      );
    assert.ok(!fs.readFileSync("dist/assets/app.mjs", "utf8").includes("5678"));
  },
);
check("Unavailable demo/repository/report controls are explicit", () => {
  for (const p of projects) {
    const html = read(p.id + "/");
    assert.match(html, /title="Interactive support ticket demo"/);
    assert.match(html, /Public integration report not published/);
  }
});
check("Historical test scopes stay separate from website checks", () => {
  for (const { html } of pages.filter(
    (p) => p.route.includes("ticket"),
  ))
    assert.match(
      html,
      /Previously recorded project results, not tests rerun by this website/,
    );
  assert.match(
    read("evidence/"),
    /CI does not keep n8n, MySQL or AI services running/,
  );
});
check("GitHub Pages subpath rendering keeps local links scoped", () => {
  const r = renderer("/portfolio/");
  for (const html of [
    r.home(),
    r.listing(),
    ...projects.map((p) => r.detail(p)),
  ])
    for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g))
      if (m[1].startsWith("/")) assert.ok(m[1].startsWith("/portfolio/"));
});
check("GitHub Actions YAML syntax and non-deployment boundaries", () => {
  const w = parse(
    fs.readFileSync(new URL("../../.github/workflows/website-tests.yml", import.meta.url), "utf8"),
  );
  assert.ok(
    ["push", "pull_request", "workflow_dispatch"].every((k) =>
      Object.hasOwn(w.on, k),
    ),
  );
  assert.equal(w.permissions.contents, "read");
  assert.equal(w.defaults.run["working-directory"], "website");
  assert.equal(w.jobs.website.steps.find(s=>s.uses?.startsWith("actions/setup-node")).with["cache-dependency-path"], "website/package-lock.json");
  const text = JSON.stringify(w);
  assert.ok(text.includes("npm ci"));
  assert.ok(text.includes("npm run test:browser"));
  assert.ok(text.includes("upload-artifact"));
  assert.ok(!/deploy-pages|wrangler|secrets\.|N8N|MYSQL/.test(text));
});
fs.mkdirSync(".local-reports", { recursive: true });
fs.writeFileSync(
  ".local-reports/structure.json",
  JSON.stringify(
    {
      suite: "Static website checks",
      generatedAt: new Date().toISOString(),
      scope: "Static portfolio only; no automation/provider calls",
      results,
    },
    null,
    2,
  ),
);
console.log(
  "RESULT " +
    results.filter((r) => r.status === "passed").length +
    "/" +
    results.length +
    " static website checks passed.",
);
