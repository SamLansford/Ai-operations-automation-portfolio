// Local preview only. The existing backend retains validation, sessions and workflow credentials.
export async function forwardLocalDemo(req, res, {port, backend = 'http://127.0.0.1:8787'}) {
 const origin = 'http://127.0.0.1:' + port;
 const target = new URL(backend);
 if (target.hostname !== '127.0.0.1' || target.protocol !== 'http:' || target.pathname !== '/') throw Error('Invalid local backend');
 const routes = {'/__local-demo/api/demo/ticket-decision':['POST','/api/demo/ticket-decision'],'/__local-demo/api/demo/submission-history':['POST','/api/demo/submission-history'], '/__local-demo/api/demo/session': ['GET','/api/demo/session'], '/__local-demo/api/demo/tickets':['POST','/api/demo/tickets'], '/__local-demo/api/demo/ticket-status':['POST','/api/demo/ticket-status']};
 const fail = (status,error) => {res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify({error}));};
 if (req.headers.host !== new URL(origin).host) return fail(403,'REQUEST_NOT_ALLOWED');
 const route = routes[req.url];
 if (!route) return fail(404,'NOT_FOUND');
 if (req.method !== route[0]) return fail(405,'METHOD_NOT_ALLOWED');
 if (req.headers.origin && req.headers.origin !== origin) return fail(403,'REQUEST_NOT_ALLOWED');
 if (req.method === 'POST' && req.headers.origin !== origin) return fail(403,'REQUEST_NOT_ALLOWED');
 if (req.method === 'POST' && req.headers['content-type']?.split(';')[0] !== 'application/json') return fail(415,'JSON_REQUIRED');
 let bytes=0; const chunks=[];
 try {
  for await (const c of req) {bytes+=c.length;if(bytes>8192)return fail(413,'REQUEST_TOO_LARGE');chunks.push(c);}
  const headers={origin:target.origin};
  for (const name of ['content-type','x-demo-csrf']) if(req.headers[name])headers[name]=req.headers[name];
  const cookie=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('demo_session='));if(cookie)headers.cookie=cookie;
  const response=await fetch(target.origin+route[1],{method:req.method,headers,body:req.method==='POST'?Buffer.concat(chunks):undefined,redirect:'error',signal:AbortSignal.timeout(50000)});
  const text=await response.text();if(text.length>20000)return fail(502,'INVALID_AUTOMATION_RESPONSE');
  // Never proxy arbitrary headers, diagnostics, redirects or non-JSON content.
  let body;try{body=JSON.parse(text);}catch{return fail(503,'AUTOMATION_UNAVAILABLE');}
  const clean={};for(const key of ['reviewReason','policyVersion','attemptRef','csrf','workspaceId','status','ticketRef','category','reason','error'])if(typeof body[key]==='string')clean[key]=body[key].slice(0,600);
  if(typeof body.replayed==='boolean')clean.replayed=body.replayed;
  if(typeof body.requiresReview==='boolean')clean.requiresReview=body.requiresReview;
  if(typeof body.historyRecorded==='boolean')clean.historyRecorded=body.historyRecorded;
  if(route[1]==='/api/demo/submission-history'&&Array.isArray(body.history))clean.history=body.history.slice(0,50).map(e=>({attemptRef:String(e.attemptRef||'').slice(0,12),outcome:String(e.outcome||'').slice(0,32),httpStatus:Number(e.httpStatus),errorCode:e.errorCode===null?null:String(e.errorCode||'').slice(0,64),ticketRef:e.ticketRef===null?null:String(e.ticketRef||'').slice(0,10),ticketStatus:e.ticketStatus===null?null:String(e.ticketStatus||'').slice(0,32),createdAt:String(e.createdAt||'').slice(0,40)}));
  if(route[1]==='/api/demo/ticket-status'&&body.ticket&&typeof body.ticket==='object'){
   const t=body.ticket;clean.ticket={};for(const k of ['ticketRef','message','status','category','reason','reviewReason','policyVersion','createdAt','updatedAt'])if(typeof t[k]==='string')clean.ticket[k]=t[k].slice(0,k==='message'?1500:600);
   if(t.decision)clean.ticket.decision={decision:String(t.decision.decision||'').slice(0,10),reason:String(t.decision.reason||'').slice(0,500),reviewerId:String(t.decision.reviewerId||'').slice(0,64),at:String(t.decision.at||'').slice(0,40)};clean.ticket.requiresReview=t.requiresReview===true;clean.ticket.events=Array.isArray(t.events)?t.events.slice(0,50).map(e=>({type:String(e.type||'').slice(0,80),from:e.from===null?null:String(e.from||'').slice(0,40),to:String(e.to||'').slice(0,40),at:String(e.at||'').slice(0,60)})):[];
  }
  if(route[0]==='GET' && response.ok){const value=response.headers.get('set-cookie');if(value&&/^demo_session=[a-f0-9]+\.[0-9]+\.[a-f0-9]+;/.test(value))res.setHeader('Set-Cookie',value.replace('Path=/api/demo','Path=/__local-demo/api/demo'));}
  if(response.headers.get('retry-after'))res.setHeader('Retry-After',response.headers.get('retry-after'));
  res.writeHead(response.status,{'content-type':'application/json'});res.end(JSON.stringify(clean));
 } catch(e) {return fail(e.name==='TimeoutError'?504:503,e.name==='TimeoutError'?'AUTOMATION_TIMEOUT':'AUTOMATION_UNAVAILABLE');}
}
