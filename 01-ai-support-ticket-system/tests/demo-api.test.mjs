// Real local backend HTTP tests with an injected upstream fixture. NOT n8n/model tests.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { request,createServer } from 'node:http';
import { createDemoServer,validateBody } from '../demo/server.mjs';

let passed=0;
const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
const body=()=>({requestId:randomUUID(),message:'For a fictional order I was charged twice. Please investigate.',fictional:true});
check('fictional valid payload',()=>assert.equal(validateBody(body()),true));
for(const [name,change]of Object.entries({unacknowledged:{fictional:false},identity:{ticketId:'OLD-TICKET'},email:{message:'Please contact fictional@example.com for this ticket'},url:{message:'Please visit https://example.com for this ticket'},phone:{message:'Please call 555-123-4567 about this ticket'},short:{message:'short'},long:{message:'x'.repeat(1501)},badId:{requestId:'123'},array:null}))check('reject '+name,()=>assert.equal(validateBody(change===null?[]:{...body(),...change}),false));
const origin='http://127.0.0.1:18787';let calls=0,mode='success';const persisted=new Map();
const server=createDemoServer({secret:'unit-only-signing-fixture-000000000000',webhookKey:'unit-only-webhook-fixture-00000000000',origin,limit:100,timeoutMs:50,fetch:async(_,opts)=>{
  calls++;const t=JSON.parse(opts.body);assert.match(t.ticketId,/^DEMO-[a-f0-9]{64}$/);assert.equal(t.customerEmail,'fictional@example.invalid');
  if(mode==='timeout')throw Object.assign(Error(),{name:'TimeoutError'});
  if(mode==='unavailable')return new Response(JSON.stringify({privateError:'do not return this'}),{status:503});
  if(mode==='malformed')return new Response('not json',{status:200});
  if(mode==='pending')return new Response(JSON.stringify({processingStatus:'PENDING_REVIEW'}),{status:202});
  await new Promise(r=>setTimeout(r,15));
  if(persisted.has(t.ticketId)&&persisted.get(t.ticketId)!==t.message)return new Response('{}',{status:409});
  persisted.set(t.ticketId,t.message);
  return new Response(JSON.stringify({processingStatus:'CLASSIFIED',classification:{category:'BILLING',reason:'Synthetic result'},customerEmail:'internal',payloadFingerprint:'private',executionId:'hidden'}),{status:200});
}});
await new Promise((r,j)=>server.once('error',j).listen(18787,'127.0.0.1',r));
async function client(){const r=await fetch(origin+'/api/demo/session');return {cookie:r.headers.get('set-cookie').split(';')[0],csrf:(await r.json()).csrf};}
const c=await client();
async function send(b,headers={}){return fetch(origin+'/api/demo/tickets',{method:'POST',headers:{origin,cookie:c.cookie,'x-demo-csrf':c.csrf,'content-type':'application/json',...headers},body:JSON.stringify(b)});}
try{
  let r=await fetch(origin+'/support-ticket');check('page served with CSP',()=>{assert.equal(r.status,200);assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.ok(!r.headers.get('access-control-allow-origin'));});
  for(const[title,headers]of [['foreign origin',{origin:'https://elsewhere.invalid'}],['no cookie',{cookie:''}],['bad CSRF',{'x-demo-csrf':'bad'}]]){r=await send(body(),headers);check('blocked '+title,()=>assert.equal(r.status,403));}
  const badHost=await new Promise((resolve,reject)=>{const q=request(origin+'/api/demo/tickets',{method:'POST',headers:{Host:'attacker.invalid'}},r=>{r.resume();resolve(r.statusCode)});q.on('error',reject);q.end();});check('DNS rebinding host blocked',()=>assert.equal(badHost,403));
  r=await send(body(),{'content-type':'text/plain'});check('non-JSON rejected',()=>assert.equal(r.status,415));
  r=await send(body(),{'x-demo-csrf':'é'.repeat(64)});check('non-ASCII CSRF rejected without crash',()=>assert.equal(r.status,403));
  r=await send({...body(),message:'x'.repeat(9000)});check('oversized body bounded',()=>assert.equal(r.status,413));
  r=await fetch(origin+'/api/demo/tickets',{method:'POST',headers:{origin,cookie:c.cookie,'x-demo-csrf':c.csrf,'content-type':'application/json'},body:'{broken'});check('malformed JSON rejected',()=>assert.equal(r.status,400));
  const before=calls;r=await send({...body(),customerEmail:'not-allowed'});check('unknown identity blocked before upstream',()=>{assert.equal(r.status,400);assert.equal(calls,before);});
  const ticket=body();r=await send(ticket);let out=await r.json();check('response allowlist',()=>assert.deepEqual(Object.keys(out).sort(),['category','reason','status','ticketRef']));
  r=await send(ticket);check('duplicate returns same saved result',()=>assert.equal(r.status,200));
  r=await send({...ticket,message:'Different fictional message for the same request identifier.'});check('conflicting request ID',()=>assert.equal(r.status,409));
  const other=await client();r=await send(ticket,{cookie:other.cookie,'x-demo-csrf':other.csrf});check('session-separated ticket namespace',()=>{assert.equal(r.status,200);assert.equal(persisted.size,2);});
  const t=body(),n=calls;const pair=await Promise.all([send(t),send(t)]);check('concurrent duplicate coalesced',()=>{assert.equal(calls-n,1);assert.ok(pair.every(x=>x.status===200));});
  mode='pending';r=await send(body());out=await r.json();check('pending review forwarded honestly',()=>{assert.equal(r.status,202);assert.equal(out.status,'PENDING_REVIEW');});
  for(const[m,status,error]of [['timeout',504,'AUTOMATION_TIMEOUT'],['unavailable',503,'AUTOMATION_UNAVAILABLE'],['malformed',503,'AUTOMATION_UNAVAILABLE']]){mode=m;r=await send(body());out=await r.json();check(m+' sanitized',()=>{assert.equal(r.status,status);assert.deepEqual(out,{error});});}
  r=await fetch(origin+'/api/v1/workflows');check('management route unavailable',()=>assert.equal(r.status,404));
  r=await fetch(origin+'/.env');check('private environment file unavailable',()=>assert.equal(r.status,404));
  r=await fetch(origin+'/api/demo/tickets');check('wrong method rejected',()=>assert.equal(r.status,405));
}finally{await new Promise(r=>server.close(r));}
const limitedOrigin='http://127.0.0.1:18788';
const limited=createDemoServer({secret:'test-only-signing-fixture-000000000000',webhookKey:'test-only-webhook-fixture-00000000000',origin:limitedOrigin,limit:1,fetch:async()=>new Response('{}',{status:503})});
await new Promise(r=>limited.listen(18788,'127.0.0.1',r));
try{const sr=await fetch(limitedOrigin+'/api/demo/session');const csrf=(await sr.json()).csrf;const h={origin:limitedOrigin,cookie:sr.headers.get('set-cookie').split(';')[0],'x-demo-csrf':csrf,'content-type':'application/json'};const post=()=>fetch(limitedOrigin+'/api/demo/tickets',{method:'POST',headers:h,body:JSON.stringify(body())});await post();const r=await post();check('IP rate limit enforced',()=>{assert.equal(r.status,429);assert.equal(r.headers.get('retry-after'),'60');});}finally{await new Promise(r=>limited.close(r));}
// A real HTTP transport timeout against a deliberately slow local fixture,
// distinct from the injected TimeoutError mapping above. Still no n8n/model call.
const slow=createServer((_,res)=>setTimeout(()=>res.end('{}'),250));
await new Promise(r=>slow.listen(18791,'127.0.0.1',r));
const timedOrigin='http://127.0.0.1:18792';
const timed=createDemoServer({secret:'test-only-signing-fixture-000000000000',webhookKey:'test-only-webhook-fixture-00000000000',origin:timedOrigin,upstream:'http://127.0.0.1:18791/webhook/support-ticket-intake-demo',timeoutMs:40});
await new Promise(r=>timed.listen(18792,'127.0.0.1',r));
try{const sr=await fetch(timedOrigin+'/api/demo/session');const csrf=(await sr.json()).csrf;const started=Date.now();const r=await fetch(timedOrigin+'/api/demo/tickets',{method:'POST',headers:{origin:timedOrigin,cookie:sr.headers.get('set-cookie').split(';')[0],'x-demo-csrf':csrf,'content-type':'application/json'},body:JSON.stringify(body())});check('actual HTTP upstream deadline aborts promptly',()=>{assert.equal(r.status,504);assert.ok(Date.now()-started<1000);});}finally{await new Promise(r=>timed.close(r));slow.closeAllConnections();await new Promise(r=>slow.close(r));}
console.log(`RESULT ${passed} local backend checks passed; upstream was mocked, no n8n/MySQL access.`);
