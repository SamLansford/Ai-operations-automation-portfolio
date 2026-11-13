// Actual local backend -> authenticated DEMO n8n -> isolated MySQL/Ollama.
// Temporarily changes ONLY DEMO for explicitly labeled AI-output fault fixtures.
import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
import {writeFileSync,readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {createDemoServer,localConfig} from '../demo/server.mjs';
import {api,settings,definition,portable,rootSql,mysql,exportCredential,originalDataHash,setActive} from '../demo/manage.mjs';
const s=settings(),id=s.DEMO_WORKFLOW_ID;
const protectedIds=['0G0j4x3GtVpRCAPa','u0tVpaiOEqBLShlS','2fC4kymKXdm0o3sz','IqMpoRI8EZcSuqrc'];
const before=await Promise.all(protectedIds.map(id=>api('/workflows/'+id))),originalHash=originalDataHash();
const protectedFiles=['ticket-intake.json','ticket-intake-dev.json','human-review-dev.json','ticket-intake-before-promotion.json','ticket-intake-dev-before-claim-20261104-223946.json','ticket-intake-dev-before-review.json'];
const contents=protectedFiles.map(f=>readFileSync(new URL('../workflows/'+f,import.meta.url)));
const baseline=await api('/workflows/'+id);assert.equal(baseline.active,false);assert.equal(baseline.name,'Portfolio 1 - AI Support Ticket Intake - DEMO');
const credential=exportCredential(s.DEMO_MYSQL_CREDENTIAL_ID);
for(const table of ['tickets','ticket_audit'])assert.equal(mysql('SELECT ticket_id FROM ai_support_portfolio.'+table+' LIMIT 0;',credential.data).denied,true);
let checks=0;const pass=(name,extra={})=>{checks++;console.log('PASS '+name+' '+JSON.stringify(extra));};
pass('demo account cannot access either original table');
assert.equal(mysql('DELETE FROM ai_support_portfolio_demo.tickets WHERE 1=0;',credential.data).denied,true);
pass('demo account denied DELETE (zero-row permission probe)');
const origin='http://127.0.0.1:18789',server=createDemoServer({...localConfig(),origin,limit:100,timeoutMs:60000});
await new Promise(r=>server.listen(18789,'127.0.0.1',r));
async function session(){const r=await fetch(origin+'/api/demo/session');return{cookie:r.headers.get('set-cookie').split(';')[0],csrf:(await r.json()).csrf};}
const client=await session();
const ticket=()=>({requestId:randomUUID(),message:'For a fictional order I was charged twice for one purchase. Please investigate the duplicate billing charge.',fictional:true});
async function post(b,c=client){const r=await fetch(origin+'/api/demo/tickets',{method:'POST',headers:{origin,cookie:c.cookie,'x-demo-csrf':c.csrf,'content-type':'application/json'},body:JSON.stringify(b),signal:AbortSignal.timeout(65000)});const body=await r.json();assert.ok(!JSON.stringify(body).includes(s.DEMO_WEBHOOK_KEY));return{status:r.status,body};}
function row(ref){assert.match(ref,/^[a-f0-9]{10}$/);return JSON.parse(rootSql(`SELECT JSON_OBJECT('status',t.processing_status,'category',t.classification_category,'email',t.customer_email,'messageHex',HEX(t.customer_message),'auditCount',(SELECT COUNT(*) FROM ai_support_portfolio_demo.ticket_audit a WHERE a.ticket_id=t.ticket_id),'events',(SELECT GROUP_CONCAT(event_type ORDER BY audit_id) FROM ai_support_portfolio_demo.ticket_audit a WHERE a.ticket_id=t.ticket_id),'execution',t.execution_id) FROM ai_support_portfolio_demo.tickets t WHERE t.ticket_id LIKE 'DEMO-%${ref}';`));}
async function installModel(value){await setActive(false);const w=structuredClone(baseline);const n=w.nodes.find(n=>n.name==='Classify Ticket');n.type='n8n-nodes-base.code';n.typeVersion=2;n.parameters={mode:'runOnceForEachItem',jsCode:`return {json:${JSON.stringify(value)}};`};delete n.credentials;await api('/workflows/'+id+'?publishIfActive=false','PUT',definition(w));await setActive(true);await delay(400);}
async function restore(){await setActive(false);await api('/workflows/'+id+'?publishIfActive=false','PUT',definition(baseline));}
try{
  if(!process.argv.includes('--faults-only')){
  await setActive(true);await delay(400);
  let r=await fetch('http://localhost:5678/webhook/support-ticket-intake-demo',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ticketId:'SHOULD-NOT-CLAIM'})});assert.equal(r.status,403);pass('direct demo webhook requires private authentication',{http:403});
  const countBefore=rootSql('SELECT COUNT(*) FROM ai_support_portfolio_demo.tickets;');
  r=await post({...ticket(),ticketId:'EXISTING-ID'});assert.equal(r.status,400);assert.equal(rootSql('SELECT COUNT(*) FROM ai_support_portfolio_demo.tickets;'),countBefore);pass('caller ticket IDs rejected with no database write',{http:400});
  const b=ticket(),first=await post(b);assert.equal(first.status,200);assert.equal(first.body.status,'AUTO_ROUTED');assert.equal(first.body.category,'BILLING');
  const saved=row(first.body.ticketRef);assert.equal(saved.status,'AUTO_ROUTED');assert.equal(saved.email,'fictional@example.invalid');assert.equal(saved.messageHex,Buffer.from(b.message).toString('hex').toUpperCase());assert.equal(saved.auditCount,2);assert.equal(saved.events,'TICKET_CREATED,AI_CLASSIFICATION_ACCEPTED');
  pass('real Ollama classification plus durable isolated ticket and two audits',{http:200,execution:saved.execution,category:saved.category});
  r=await post(b);assert.deepEqual(r,first);assert.deepEqual(row(first.body.ticketRef),saved);pass('duplicate request replays without additional audit',{http:200});
  r=await post({...b,message:'Different fictional support message for the same request ID.'});assert.equal(r.status,409);assert.deepEqual(row(first.body.ticketRef),saved);pass('changed payload conflicts and preserves stored content',{http:409});
  const parallel=ticket(),pairs=await Promise.all([post(parallel),post(parallel)]);assert.ok(pairs.every(x=>x.status===200));assert.deepEqual(pairs[0],pairs[1]);assert.equal(row(pairs[0].body.ticketRef).auditCount,2);pass('concurrent duplicates commit a single ticket outcome',{http:[200,200]});
  const second=await post(b,await session());assert.equal(second.status,200);assert.notEqual(second.body.ticketRef,first.body.ticketRef);pass('another browser session cannot select the first session ticket',{http:200});
  }
  await installModel({content:'{"category":"UNKNOWN","reason":"Controlled synthetic model output"}'});
  const pending=await post(ticket());assert.equal(pending.status,202);assert.equal(pending.body.status,'PENDING_REVIEW');const pendingRow=row(pending.body.ticketRef);assert.equal(pendingRow.status,'PENDING_REVIEW');assert.equal(pendingRow.events,'TICKET_CREATED,HUMAN_REVIEW_REQUESTED');pass('controlled UNKNOWN AI output persists review request',{http:202,execution:pendingRow.execution,model:'substituted DEV-only fixture'});
  await installModel({error:'Controlled synthetic AI unavailable'});
  const failedTicket=ticket();const failed=await post(failedTicket);assert.equal(failed.status,503);assert.deepEqual(failed.body,{error:'AUTOMATION_UNAVAILABLE'});
  const sid=client.cookie.slice('demo_session='.length).split('.').slice(0,2).join('.');
  const failedId='DEMO-'+createHmac('sha256',s.DEMO_ID_SECRET).update('ticket:'+sid+':'+failedTicket.requestId).digest('hex');
  const failedRows=rootSql(`SELECT processing_status,(SELECT GROUP_CONCAT(event_type ORDER BY audit_id) FROM ai_support_portfolio_demo.ticket_audit a WHERE a.ticket_id=t.ticket_id),execution_id FROM ai_support_portfolio_demo.tickets t WHERE ticket_id='${failedId}';`);
  assert.match(failedRows,/^FAILED\tTICKET_CREATED,MODEL_UNAVAILABLE\t/);pass('controlled AI failure persisted FAILED and sanitized503',{http:503,execution:failedRows.split('\t')[2],model:'substituted error fixture, not service outage'});
  await restore();await setActive(true);await delay(300);
  const replayFailed=await post(failedTicket);assert.equal(replayFailed.status,503);pass('FAILED ticket replay does not retry the AI',{http:503});
  assert.equal(rootSql(`SELECT processing_status,(SELECT GROUP_CONCAT(event_type ORDER BY audit_id) FROM ai_support_portfolio_demo.ticket_audit a WHERE a.ticket_id=t.ticket_id),execution_id FROM ai_support_portfolio_demo.tickets t WHERE ticket_id='${failedId}';`),failedRows);
  const history=await api('/executions?workflowId='+id+'&limit=100');assert.equal(history.data.length,0);pass('no demo authentication headers retained in saved executions');
}finally{
  await restore();const final=await api('/workflows/'+id);assert.equal(final.active,false);assert.deepEqual(definition(final),definition(baseline));
  writeFileSync(new URL('../workflows/ticket-intake-demo.json',import.meta.url),JSON.stringify(portable(final),null,2)+'\n');
  await new Promise(r=>server.close(r));assert.deepEqual(await Promise.all(protectedIds.map(id=>api('/workflows/'+id))),before);assert.equal(originalDataHash(),originalHash);
  protectedFiles.forEach((f,i)=>assert.ok(readFileSync(new URL('../workflows/'+f,import.meta.url)).equals(contents[i])));
  pass('DEMO restored inactive; existing workflows, original records and backups unchanged');
}
console.log(`RESULT ${checks} actual infrastructure integration checks passed; synthetic demo records retained.`);
