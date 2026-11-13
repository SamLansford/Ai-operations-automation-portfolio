import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {forwardLocalDemo} from '../scripts/local-demo-proxy.mjs';
test('Local bridge enforces boundaries and preserves the backend session', async()=>{
 let count=0,captured;
 const backend=http.createServer((req,res)=>{count++;captured=req.headers;res.setHeader('content-type','application/json');if(req.method==='GET'){res.setHeader('Set-Cookie','demo_session=abcd.123.abcd; HttpOnly; SameSite=Strict; Path=/api/demo; Max-Age=1800');res.end(JSON.stringify({csrf:'fixture',privateField:'must not leak'}));}else if(req.url==='/api/demo/submission-history')res.end(JSON.stringify({history:[{attemptRef:'fixture12345',outcome:'REJECTED',httpStatus:400,errorCode:'INVALID_JSON',ticketRef:null,ticketStatus:null,createdAt:'2026-11-12',internal:'private'}],internal:'private'}));else if(req.url==='/api/demo/ticket-status')res.end(JSON.stringify({ticket:{ticketRef:'fixture',message:'Saved fixture',status:'AUTO_ROUTED',category:'BILLING',internal:'private',events:Array.from({length:60},()=>({type:'TICKET_CREATED',from:null,to:'PROCESSING',at:'2026-11-12',internal:'private'}))}}));else res.end(JSON.stringify({status:'AUTO_ROUTED',category:'BILLING',reason:'Fixture',ticketRef:'fixture',internal:'must not leak'}));});
 await new Promise(r=>backend.listen(0,'127.0.0.1',r));
 const target='http://127.0.0.1:'+backend.address().port;
 const proxy=http.createServer((req,res)=>{void forwardLocalDemo(req,res,{port:proxy.address().port,backend:target});});await new Promise(r=>proxy.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+proxy.address().port;
 try{
 let r=await fetch(origin+'/__local-demo/api/demo/session');assert.equal(r.status,200);assert.deepEqual(await r.json(),{csrf:'fixture'});assert.match(r.headers.get('set-cookie'),/Path=\/__local-demo\/api\/demo/);
 r=await fetch(origin+'/__local-demo/api/demo/tickets',{method:'POST',headers:{origin,'content-type':'application/json',cookie:'other=private; demo_session=abcd.123.abcd','x-demo-csrf':'fixture',authorization:'must-not-forward'},body:'{}'});assert.equal(r.status,200);assert.equal((await r.json()).internal,undefined);assert.equal(captured.origin,target);assert.equal(captured.cookie,'demo_session=abcd.123.abcd');assert.equal(captured.authorization,undefined);
 r=await fetch(origin+'/__local-demo/api/demo/ticket-status',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'});assert.equal(r.status,200);const saved=await r.json();assert.equal(saved.ticket.internal,undefined);assert.equal(saved.ticket.events.length,50);assert.equal(saved.ticket.events[0].internal,undefined);
 r=await fetch(origin+'/__local-demo/api/demo/submission-history',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'});assert.equal(r.status,200);const history=await r.json();assert.equal(history.history.length,1);assert.equal(history.history[0].outcome,'REJECTED');assert.equal(history.history[0].internal,undefined);assert.equal(history.internal,undefined);
 const before=count;
 for(const [url,options,status] of [
 ['/__local-demo/api/v1/workflows',{},404],
 ['/__local-demo/api/demo/session?target=other',{},404],
 ['/__local-demo/api/demo/tickets',{},405],
 ['/__local-demo/api/demo/tickets',{method:'POST',headers:{origin:'https://foreign.invalid','content-type':'application/json'},body:'{}'},403],
 ['/__local-demo/api/demo/tickets',{method:'POST',headers:{origin,'content-type':'text/plain'},body:'x'},415],
 ['/__local-demo/api/demo/tickets',{method:'POST',headers:{origin,'content-type':'application/json'},body:'x'.repeat(8193)},413]
 ]){r=await fetch(origin+url,options);assert.equal(r.status,status,url);}
 const wrongHost=await new Promise((resolve,reject)=>{const q=http.get(origin+'/__local-demo/api/demo/session',{headers:{host:'foreign.invalid'}},r=>{r.resume();resolve(r.statusCode);});q.on('error',reject);});assert.equal(wrongHost,403);
 assert.equal(count,before,'Denied requests never reach backend');
 }finally{await Promise.all([new Promise(r=>proxy.close(r)),new Promise(r=>backend.close(r))]);}
});
