import {contentPolicy} from "./security-headers.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { projects } from "../src/projects.mjs";
import { renderer } from "../src/render.mjs";
export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const base = process.env.BASE_PATH || "/";
if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base))
  throw Error("BASE_PATH must be / or a safe slash-terminated subpath");
const r = renderer(base),
  pages = {
    "index.html": r.home(),
    "projects/index.html": r.listing(),
    "evidence/index.html": r.evidence(),
    "reports/index.html": r.reports(),
    "reports/reliability/index.html": r.checks(),
    "404.html": r.notFound(),
  };
for (const p of projects) pages[p.id + "/index.html"] = r.detail(p);
for (const [file, html] of Object.entries(pages)) {
  const dest = path.join(root, "dist", file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, html);
}
fs.mkdirSync(path.join(root, "dist/assets"), { recursive: true });
for (const file of ["style.css", "app.mjs", "mark.svg", "reliability.mjs"])
  fs.copyFileSync(
    path.join(root, "src/assets", file),
    path.join(root, "dist/assets", file),
  );
fs.writeFileSync(
  path.join(root, "dist/metadata.json"),
  JSON.stringify(
    {
      base,
      projects: projects.map(
        ({
          id,
          title,
          technologies,
          status,
          mode,
          demoUrl,
          reportUrl,
          repository,
        }) => ({
          id,
          title,
          technologies,
          status,
          mode,
          demoUrl,
          reportUrl,
          repository,
        }),
      ),
    },
    null,
    2,
  ),
);
const headerRules=['/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer'];
for(const file of Object.keys(pages)) {
 const relative=file==='index.html'?'':file.replace(/index\.html$/,'');
 const paths=new Set([base+relative,base+file]);if(relative.endsWith('/'))paths.add(base+relative.slice(0,-1));
 for(const route of paths)headerRules.push(route+'\n  Content-Security-Policy: '+contentPolicy(false));
}
headerRules.push(base+'demo-frame/*\n  Content-Security-Policy: '+contentPolicy(true));
fs.writeFileSync(path.join(root,'dist/_headers'),headerRules.join('\n\n')+'\n');
console.log(
  "Built " +
    Object.keys(pages).length +
    " static pages for base " +
    base +
    "; no automation services contacted.",
);

// Reuse only the existing public UI assets; never read its backend settings or .env.
const demoSource=path.resolve(root,'src/demo');
const frame=path.join(root,'dist/demo-frame');fs.mkdirSync(frame,{recursive:true});
let demoHtml=fs.readFileSync(path.join(demoSource,'index.html'),'utf8');
const operatorStart=demoHtml.indexOf('<section class="reliability"');if(operatorStart>=0){const end=demoHtml.indexOf('</section>',operatorStart)+10;demoHtml=demoHtml.slice(0,operatorStart)+demoHtml.slice(end);}
const workspace=demoHtml.slice(demoHtml.indexOf('<section class="workspace"'),demoHtml.indexOf('<section class="how"'));
fs.writeFileSync(path.join(frame,'index.html'),'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Interactive fictional ticket form</title><link rel="stylesheet" href="'+base+'demo-frame/style.css"><script type="module" src="'+base+'demo-frame/app.mjs"></script></head><body><main>'+workspace+'</main></body></html>');
fs.writeFileSync(path.join(frame,'style.css'),fs.readFileSync(path.join(demoSource,'style.css'),'utf8')+'\nmain{padding:12px;max-width:none}.workspace{display:grid}');
fs.writeFileSync(path.join(frame,'app.mjs'),fs.readFileSync(path.join(demoSource,'app.mjs'),'utf8').replaceAll("'/api/demo/","'/__local-demo/api/demo/"));
