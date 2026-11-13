import fs from "node:fs";
import { esc, renderer } from "../src/render.mjs";
const read = (p) => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
};
const structure = read(".local-reports/structure.json"),
  browser = read(".local-reports/browser.json");
const records = [];
if (structure)
  for (const r of structure.results)
    records.push({ suite: "Static website", name: r.name, status: r.status });
function visit(s) {
  for (const spec of s.specs || [])
    for (const t of spec.tests || [])
      records.push({
        suite: "Chromium / " + t.projectName,
        name: spec.title,
        status: t.results?.at(-1)?.status || "not-run",
      });
  for (const sub of s.suites || []) visit(sub);
}
for (const s of browser?.suites || []) visit(s);
const passed = records.filter((r) => r.status === "passed").length,
  failed = records.filter((r) =>
    ["failed", "timedOut", "interrupted"].includes(r.status),
  ).length;
const skipped=records.filter(r=>r.status==="skipped").length;
const status = failed
  ? "FAIL"
  : structure && browser && records.length && passed+skipped === records.length
    ? (skipped?"PASS_WITH_SKIPS":"PASS")
    : "INCOMPLETE";
const data = {
  generatedAt: new Date().toISOString(),
  environment:
    process.env.GITHUB_ACTIONS === "true"
      ? "GitHub Actions"
      : "Local website tests",
  status,
  passed,
  skipped,
  failed,
  total: records.length,
  structureRunAt: structure?.generatedAt || null,
  browserRunAt: browser?.stats?.startTime || null,
  scope:
    "Static portfolio only. No existing automation tests, n8n, MySQL or AI providers executed.",
  results: records,
};
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Recorded website test report</title><link rel="stylesheet" href="../../assets/style.css"></head><body><main class="wrap section"><p class="eyebrow">SANITIZED / WEBSITE TEST RESULTS</p><h1>${status} · ${passed} PASS / ${failed} failed or errored / ${skipped} SKIP</h1><p>${esc(data.scope)}</p><p>Environment: ${data.environment}. Generated ${data.generatedAt}.</p><p>Static run: ${esc(data.structureRunAt || "not run")}. Browser run: ${esc(data.browserRunAt || "not run")}.</p><div class="notice"><p>This is a recorded result, not continuous monitoring or a fresh verification after later edits. Rerun tests after source changes. Project integration evidence is separate. No public CI run is claimed by a local report.</p></div><div class="challenge-list">${records.map((r) => `<article><h2>${esc(r.suite)} · ${esc(r.status)}</h2><p>${esc(r.name)}</p></article>`).join("")}</div><p><a href="../../evidence/">Back to evidence</a></p></main></body></html>`;
fs.mkdirSync("dist/reports/website", { recursive: true });
fs.writeFileSync("dist/reports/website/index.html", html);
fs.writeFileSync(
  "dist/reports/website/results.json",
  JSON.stringify(data, null, 2),
);
console.log(
  "Sanitized website report: " +
    status +
    " " +
    passed +
    "/" +
    records.length +
    "; no raw logs, absolute paths, cookies or automation records copied.",
);

const live=read('.local-reports/live-demo-result.json');
if(live&&live.originalUnchanged===true&&live.protectedWorkflowsUnchanged===true&&live.replayEqual===true){
 const out='dist/reports/demo';fs.mkdirSync(out,{recursive:true});
 const fields={checkedAt:live.checkedAt,http:live.http,status:live.status,category:live.category,execution:live.execution,audits:live.audits,events:live.events,replayEqual:live.replayEqual,originalUnchanged:live.originalUnchanged,protectedWorkflowsUnchanged:live.protectedWorkflowsUnchanged};
 fs.writeFileSync(out+'/results.json',JSON.stringify(fields,null,2));
 fs.writeFileSync(out+'/index.html','<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Recorded real demo verification</title><link rel="stylesheet" href="../../assets/style.css"></head><body><main class="wrap section"><h1>Recorded real demo verification</h1><p>This is a previously executed local integration check, not a current service-health indicator or a model-accuracy benchmark. No mocked classifier was used.</p><dl>'+Object.entries(fields).map(([k,v])=>'<dt>'+esc(k)+'</dt><dd>'+esc(Array.isArray(v)?v.join(', '):v)+'</dd>').join('')+'</dl><p>The embedded form submitted a synthetic billing ticket through the existing backend, n8n, Ollama and isolated demo MySQL. The identical retry returned the same result without another audit. DEMO was deactivated and its server stopped after verification.</p></main></body></html>');
 const reportIndex='dist/reports/index.html';
 const meta=read('dist/metadata.json');let listing=fs.readFileSync(reportIndex,'utf8');
 if(!listing.includes('id="recorded-live-evidence"')){listing=listing.replace('</main>','<section class="wrap section" id="recorded-live-evidence"><h2>Real automation verification</h2><p>Separate recorded local check through n8n, Ollama and MySQL, including audit verification and safe replay. Not a current availability check.</p><a class="button secondary" href="'+esc((meta?.base||'/')+'reports/demo/')+'">Open recorded real-demo evidence</a></section></main>');fs.writeFileSync(reportIndex,listing);}
 console.log('Generated separate sanitized recorded live-demo evidence.');
}

const reliability=read('.local-reports/live-reliability-result.json');
if(reliability?.originalUnchanged&&reliability?.protectedWorkflowsUnchanged&&reliability.database?.length===3){
 const out='dist/reports/reliability';fs.mkdirSync(out,{recursive:true});
 const safe={checkedAt:reliability.checkedAt,results:reliability.results.map(x=>({scenario:x.kind,http:x.replies.map(r=>r.http)})),database:reliability.database.map(x=>({status:x.status,execution:x.execution,audits:x.audits,events:x.events})),beforeCounts:reliability.beforeCounts,afterCounts:reliability.afterCounts,originalUnchanged:true,protectedWorkflowsUnchanged:true};
 fs.writeFileSync(out+'/results.json',JSON.stringify(safe,null,2));
 const metaForChecks=read('dist/metadata.json');
 const recorded='<p>Checked '+esc(safe.checkedAt)+'</p><ul>'+safe.results.map(x=>'<li>'+esc(x.scenario)+': HTTP '+esc(x.http.join(', '))+'</li>').join('')+'</ul><p>Independent SQL verification found three new tickets and six audits. Executions: '+esc(safe.database.map(x=>x.execution).join(', '))+'. These are recorded results, not results of a new run. Backend coalescing is not proof of a MySQL lock race.</p>';
 fs.writeFileSync(out+'/index.html',renderer(metaForChecks?.base||'/').checks(recorded));
 const index='dist/reports/index.html';let listing=fs.readFileSync(index,'utf8');const meta=read('dist/metadata.json');
 if(!listing.includes('id="recorded-reliability"')){listing=listing.replace('</main>','<section class="wrap section" id="recorded-reliability"><h2>Concurrency and validation evidence</h2><a class="button secondary" href="'+esc((meta?.base||'/')+'reports/reliability/')+'">Open recorded real reliability checks</a></section></main>');fs.writeFileSync(index,listing);}
 console.log('Generated separate sanitized real reliability evidence.');
}
