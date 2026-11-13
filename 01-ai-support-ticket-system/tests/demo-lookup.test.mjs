import{test}from'node:test';import assert from'node:assert/strict';import{randomUUID}from'node:crypto';import{createDemoServer}from'../demo/server.mjs';
test('Session-scoped demo ticket lookup (isolated upstream)',async t=>{
 const origin='http://127.0.0.1:18891',records=new Map();let calls=0,fail=false;
 const server=createDemoServer({secret:'isolated-demo-signing-fixture-000000000',webhookKey:'isolated-demo-webhook-fixture-000000000',origin,fetch:async(url,options)=>{calls++;const b=JSON.parse(options.body);if(fail)throw Error('private fixture error');if(url.endsWith('support-ticket-intake-demo')){records.set(b.ticketId,{ticketRef:b.ticketId.slice(-10),message:b.message,status:'AUTO_ROUTED',category:'BILLING',reason:'Fixture classification',requiresReview:false,createdAt:'2026-11-12',updatedAt:'2026-11-12',internal:'must not leak',events:Array.from({length:60},()=>({type:'TICKET_CREATED',from:null,to:'PROCESSING',at:'2026-11-12',internal:'private'}))});return Response.json({processingStatus:'CLASSIFIED',classification:{category:'BILLING',reason:'Fixture classification'}});}return records.has(b.ticketId)?Response.json({ticket:records.get(b.ticketId)}):Response.json({error:'TICKET_NOT_FOUND'},{status:404});}});
 await new Promise((r,j)=>server.once('error',j).listen(18891,'127.0.0.1',r));
 async function client(){const r=await fetch(origin+'/api/demo/session');const b=await r.json();return{cookie:r.headers.get('set-cookie').split(';')[0],csrf:b.csrf,workspaceId:b.workspaceId};}
 async function post(path,body,c,extra={}){const r=await fetch(origin+path,{method:'POST',headers:{origin,'content-type':'application/json',cookie:c.cookie,'x-demo-csrf':c.csrf,...extra},body:JSON.stringify(body)});return{status:r.status,body:await r.json()};}
 try{const a=await client(),b=await client(),requestId=randomUUID();
 await t.test('distinct sessions receive distinct workspace namespaces',()=>assert.notEqual(a.workspaceId,b.workspaceId));
 await post('/api/demo/tickets',{requestId,message:'My card shows two charges for one reading lamp. Please check.',fictional:true},a);
 await t.test('owner reads saved ticket and bounded sanitized events',async()=>{const r=await post('/api/demo/ticket-status',{requestId},a);assert.equal(r.status,200);assert.equal(r.body.ticket.status,'AUTO_ROUTED');assert.equal(r.body.ticket.events.length,50);assert.equal(r.body.ticket.internal,undefined);assert.equal(r.body.ticket.events[0].internal,undefined);});
 await t.test('another session cannot read the same request identifier',async()=>assert.equal((await post('/api/demo/ticket-status',{requestId},b)).status,404));
 await t.test('arbitrary stored ticket ID rejected before upstream',async()=>{const n=calls;assert.equal((await post('/api/demo/ticket-status',{ticketId:'OTHER-TICKET'},a)).status,400);assert.equal(calls,n);});
 await t.test('malformed request identifier rejected before upstream',async()=>{const n=calls;assert.equal((await post('/api/demo/ticket-status',{requestId:'not-a-uuid'},a)).status,400);assert.equal(calls,n);});
 await t.test('missing session and CSRF denied before lookup',async()=>{const n=calls;assert.equal((await post('/api/demo/ticket-status',{requestId},a,{cookie:''})).status,403);assert.equal((await post('/api/demo/ticket-status',{requestId},a,{'x-demo-csrf':'bad'})).status,403);assert.equal(calls,n);});
 await t.test('unknown owned request returns not found',async()=>assert.equal((await post('/api/demo/ticket-status',{requestId:randomUUID()},a)).status,404));
 await t.test('lookup failure is sanitized',async()=>{fail=true;const r=await post('/api/demo/ticket-status',{requestId},a);assert.deepEqual(r,{status:503,body:{error:'LOOKUP_UNAVAILABLE'}});});
 }finally{await new Promise(r=>server.close(r));}
});
