// Opt-in real browser smoke test. Requires the isolated local DEMO/backend already running.
import {chromium} from '@playwright/test';import assert from 'node:assert/strict';import fs from 'node:fs';
if(!process.argv.includes('--allow-synthetic-write'))throw Error('Explicit --allow-synthetic-write required; writes one synthetic demo ticket.');
fs.mkdirSync('.local-reports',{recursive:true});const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.goto('http://127.0.0.1:4173/support-ticket/#demo');const frame=page.frameLocator('.demo-frame');
 await frame.locator('#submit').waitFor({state:'visible'});
 await page.waitForFunction(()=>{const f=document.querySelector('.demo-frame');return f.contentDocument.querySelector('#submit')?.disabled===false;},undefined,{timeout:10000});
 await frame.locator('#message').fill('I ordered one reading lamp, but my card statement shows two completed charges for that single purchase. Please investigate the duplicate charge.');
 const response=page.waitForResponse(r=>r.url().endsWith('/__local-demo/api/demo/tickets')&&r.request().method()==='POST',{timeout:55000});await frame.locator('#submit').click();const r=await response;const first=await r.json();assert.equal(r.status(),200);assert.equal(first.status,'AUTO_ROUTED');assert.equal(first.category,'BILLING');
 await frame.locator('#submit').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('.demo-frame').contentDocument.querySelector('#submit').disabled);
 const retry=page.waitForResponse(r=>r.url().endsWith('/__local-demo/api/demo/tickets')&&r.request().method()==='POST',{timeout:55000});await frame.locator('#submit').click();const rr=await retry;assert.equal(rr.status(),200);assert.deepEqual(await rr.json(),first);
 assert.match(await frame.locator('#result').innerText(),/BILLING/);
 await page.screenshot({path:'.local-reports/desktop-live-demo.png'});
 const result={checkedAt:new Date().toISOString(),http:[r.status(),rr.status()],status:first.status,category:first.category,ticketRef:first.ticketRef,replayEqual:true};fs.writeFileSync('.local-reports/live-demo-result.json',JSON.stringify(result));console.log('PASS real embedded submit and identical replay: '+JSON.stringify(result));
}finally{await browser.close();}
