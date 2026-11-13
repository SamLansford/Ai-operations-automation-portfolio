import{chromium}from'@playwright/test';import fs from'node:fs';import assert from'node:assert/strict';
if(!process.argv.includes('--allow-synthetic-write'))throw Error('Explicit --allow-synthetic-write required; creates up to three demo tickets.');
const browser=await chromium.launch(),results=[];
try{const page=await browser.newPage({viewport:{width:1440,height:1000}});const replies=[];page.on('response',async r=>{if(r.url().endsWith('/__local-demo/api/demo/tickets')){const b=await r.json();replies.push({http:r.status(),status:b.status||null,error:b.error||null,ticketRef:b.ticketRef||null});}});
await page.goto('http://127.0.0.1:4173/support-ticket/#demo');const frame=page.frameLocator('.demo-frame');
for(const kind of ['parallel','conflict','retry','short','contact','identity','csrf']){const before=replies.length;await frame.locator('[data-check="'+kind+'"]').click();await frame.locator('#check-result h4').filter({hasText:'Response check passed'}).waitFor({timeout:55000});const summary=await frame.locator('#check-result').innerText();assert.ok(summary.includes('Response check passed'));results.push({kind,replies:replies.slice(before)});console.log('PASS real control '+kind+' '+JSON.stringify(results.at(-1).replies));}
fs.writeFileSync('.local-reports/live-reliability-result.json',JSON.stringify({checkedAt:new Date().toISOString(),results},null,2));
}finally{await browser.close();}
