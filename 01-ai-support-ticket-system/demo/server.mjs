import {createHistoryStore,historyConfig,ERROR_CODES} from './submission-history.mjs';
import {readReviewerConfig,reveal} from './reviewer-private.mjs';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export function localConfig() {
  const s={};
  for(const l of readFileSync(new URL('../../.env',import.meta.url),'utf8').split(/\r?\n/)){
    const m=l.match(/^(DEMO_WEBHOOK_KEY|DEMO_ID_SECRET)=(.*)$/);if(m)s[m[1]]=m[2].trim();
  }
  return {secret:s.DEMO_ID_SECRET,webhookKey:s.DEMO_WEBHOOK_KEY};
}
export function validateBody(body) {
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['requestId','message','fictional'].includes(k)))return false;
  if(body.fictional!==true||typeof body.requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId))return false;
  if(typeof body.message!=='string')return false;
  const text=body.message.trim();
  return Array.from(text).length>=10 && Array.from(text).length<=1500 && Buffer.byteLength(text)<=6000
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)
    && !/\b[^\s@]+@[^\s@]+\.[a-z]{2,}\b|https?:\/\/|www\.|\b(?:\+?\d[\s().-]?){7,}\b/i.test(text);
}
let cachedReviewerKey;
function getReviewerKey() {
  const {protectedWebhook}=readReviewerConfig();
  if (cachedReviewerKey?.encrypted!==protectedWebhook) {
    cachedReviewerKey={encrypted:protectedWebhook,key:reveal(protectedWebhook)};
  }
  return cachedReviewerKey.key;
}
export function createDemoServer(options={}) {
  const {secret,webhookKey}=options;
  if(!secret||secret.length<32||!webhookKey||webhookKey.length<32)throw Error('Private demo settings are missing');
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const origin=options.origin||'http://127.0.0.1:8787';
  const expectedHost=new URL(origin).host;
  const upstream=options.upstream||'http://localhost:5678/webhook/support-ticket-intake-demo';
  const target=new URL(upstream);
  if(!['localhost','127.0.0.1'].includes(target.hostname)||target.pathname!=='/webhook/support-ticket-intake-demo'||target.search||target.username||target.password)throw Error('Only the local DEMO webhook is allowed');
  const timeoutMs=options.timeoutMs??45000,limit=options.limit??12;
  const sign=value=>createHmac('sha256',secret).update(value).digest('hex');
  const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&/^[a-f0-9]{64}$/.test(a)&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
  const rates=new Map(),inflight=new Map();let totalActive=0, activeDecisions=0;
  const assets=new Map([['/support-ticket','index.html'],['/support-ticket/','index.html'],['/support-ticket/app.mjs','app.mjs'],['/support-ticket/style.css','style.css']]);
  const send=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
  const fail=(res,status,error)=>send(res,status,{error});
  function session(req){const raw=req.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith('demo_session='))?.slice(13);if(!raw)return null;const [token,stamp,mac]=raw.split('.');if(!token||!stamp||!equal(mac,sign(token+'.'+stamp))||Date.now()-Number(stamp)>30*60*1000||Number(stamp)>Date.now())return null;return token+'.'+stamp;}
  function rate(ip,kind='write'){ip=kind+':'+ip;const now=Date.now();for(const[k,v]of rates)if(v.until<now)rates.delete(k);let row=rates.get(ip);if(!row){if(rates.size>=500)return false;rates.set(ip,row={count:0,until:now+60000});}return ++row.count<=(kind==='read'?60:limit);}
  async function forward(ticket) {
    totalActive++;
    try{
      const r=await (options.fetch||fetch)(upstream,{method:'POST',headers:{'content-type':'application/json','x-demo-backend-key':webhookKey},body:JSON.stringify(ticket),redirect:'error',signal:AbortSignal.timeout(timeoutMs)});
      const raw=await r.text();if(raw.length>16000)return {status:502,body:{error:'INVALID_AUTOMATION_RESPONSE'}};
      let b;try{b=JSON.parse(raw);}catch{return {status:503,body:{error:'AUTOMATION_UNAVAILABLE'}};}
      if(r.status===409)return {status:409,body:{error:'REQUEST_CONFLICT'}};
      if(![200,202].includes(r.status))return {status:503,body:{error:'AUTOMATION_UNAVAILABLE'}};
      let status=b.processingStatus==='CLASSIFIED'?'AUTO_ROUTED':b.processingStatus;
      if(!['AUTO_ROUTED','PENDING_REVIEW','PROCESSING','APPROVED','REJECTED'].includes(status))return {status:502,body:{error:'INVALID_AUTOMATION_RESPONSE'}};
      const category=b.classification?.category;
      if(status==='AUTO_ROUTED'&&!['SHIPPING','REFUND','BILLING','GENERAL'].includes(category))return {status:502,body:{error:'INVALID_AUTOMATION_RESPONSE'}};
      return {status:r.status,body:{status,ticketRef:ticket.ticketId.slice(-10),...(['APPROVED','REJECTED'].includes(status)?{category:['SHIPPING','REFUND','BILLING','GENERAL'].includes(category)?category:'UNKNOWN',reason:String(b.classification?.reason||'').slice(0,500),requiresReview:false}:status==='AUTO_ROUTED'?{category,reason:String(b.classification.reason||'').slice(0,500)}:status==='PENDING_REVIEW'?{category:['SHIPPING','REFUND','BILLING','GENERAL'].includes(category)?category:'UNKNOWN',reason:String(b.classification?.reason||'').slice(0,500),requiresReview:true,reviewReason:String(b.reviewReason||'Review required').slice(0,500)}:{})}};
    }catch(e){return {status:['TimeoutError','AbortError'].includes(e.name)?504:503,body:{error:['TimeoutError','AbortError'].includes(e.name)?'AUTOMATION_TIMEOUT':'AUTOMATION_UNAVAILABLE'}};}
    finally{totalActive--;}
  }
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.setHeader('Referrer-Policy','no-referrer');
    const requestPath=req.url?.split('?')[0],requestSid=session(req);let submittedBody=null;
    async function complete(status,body){
      if(requestPath!=='/api/demo/tickets'||req.method!=='POST'||!options.historyStore)return send(res,status,body);
      let recorded=null;
      if(requestSid&&req.headers.host===expectedHost&&req.headers.origin===origin&&rate(sign('history:'+requestSid),'history')){
        const requestId=UUID.test(submittedBody?.requestId||'')?submittedBody.requestId:null;
        let outcome=body.status==='AUTO_ROUTED'?'PROCESSED':body.status==='PENDING_REVIEW'?'PENDING_REVIEW':body.status==='PROCESSING'?'PROCESSING':status>=400&&status<500?'REJECTED':'UNCONFIRMED';
        let ticketStatus=['AUTO_ROUTED','PENDING_REVIEW','PROCESSING'].includes(body.status)?body.status:null;
        const ticketId=requestId?'DEMO-'+sign('ticket:'+requestSid+':'+requestId):null;
        if(status>=500&&ticketId){try{
          const r=await (options.fetch||fetch)(target.origin+'/webhook/support-ticket-lookup-demo',{method:'POST',headers:{'content-type':'application/json','x-demo-backend-key':webhookKey},body:JSON.stringify({ticketId}),redirect:'error',signal:AbortSignal.timeout(3000)});
          const raw=await r.text();if(r.status===200&&raw.length<=30000){const data=JSON.parse(raw);if(['FAILED','PROCESSING','PENDING_REVIEW','AUTO_ROUTED'].includes(data.ticket?.status)){ticketStatus=data.ticket.status;outcome=ticketStatus==='FAILED'?'PROCESSING_FAILED':ticketStatus==='PENDING_REVIEW'?'PENDING_REVIEW':ticketStatus==='AUTO_ROUTED'?'PROCESSED':'PROCESSING';}}
        }catch{}}
        const errorCode=ERROR_CODES.includes(body.error)?body.error:null;
        const eventKey=sign('submission:'+requestSid+':'+(requestId||randomUUID())+':'+outcome+':'+status+':'+(errorCode||''));
        try{recorded=await options.historyStore.record({ownerKey:sign('history-owner:'+requestSid),eventKey,outcome,httpStatus:status,errorCode,ticketRef:ticketStatus&&ticketId?ticketId.slice(-10):null,ticketStatus});}catch{}
      }
      return send(res,status,{...body,historyRecorded:!!recorded,...(recorded?{attemptRef:recorded.attemptRef}:{})});
    }
    const fail=(response,status,error)=>complete(status,{error});

    if(req.headers.host!==expectedHost)return fail(res,403,'HOST_NOT_ALLOWED');
    const path=req.url?.split('?')[0];
    if(req.method==='GET'&&assets.has(path)){
      const file=assets.get(path);res.writeHead(200,{'content-type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8'});return res.end(readFileSync(new URL('public/'+file,import.meta.url)));
    }
    if(path==='/') {res.writeHead(302,{location:'/support-ticket'});return res.end();}
    if(path==='/api/demo/session'&&req.method==='GET'){
      const token=session(req)||randomBytes(24).toString('hex')+'.'+Date.now();
      res.setHeader('Set-Cookie',`demo_session=${token}.${sign(token)}; HttpOnly; SameSite=Strict; Path=/api/demo; Max-Age=1800`);
      return send(res,200,{csrf:sign('csrf:'+token),workspaceId:sign('workspace:'+token).slice(0,16)});
    }
    if(!['/api/demo/tickets','/api/demo/ticket-status','/api/demo/ticket-decision','/api/demo/submission-history'].includes(path))return fail(res,404,'NOT_FOUND');
    if(req.method!=='POST'){res.setHeader('Allow','POST');return fail(res,405,'METHOD_NOT_ALLOWED');}
    const sid=session(req);
    if(req.headers.origin!==origin||!sid||!equal(req.headers['x-demo-csrf'],sign('csrf:'+sid)))return fail(res,403,'REQUEST_NOT_ALLOWED');
    if(req.headers['content-type']?.split(';')[0]!=='application/json')return fail(res,415,'JSON_REQUIRED');
    const deciding=path==='/api/demo/ticket-decision';
    if(!rate(req.socket.remoteAddress,deciding?'decision':path!=='/api/demo/tickets'?'read':'write')||(deciding&&!rate(sign('decision:'+sid),'session-decision'))){res.setHeader('Retry-After','60');return fail(res,429,'RATE_LIMITED');}
    if(Number(req.headers['content-length'])>8192){req.resume();return fail(res,413,'REQUEST_TOO_LARGE');}
    let bytes=0,chunks=[];
    try{
      let tooLarge=false;
      for await(const c of req){bytes+=c.length;if(bytes>8192){tooLarge=true;chunks=[];}else if(!tooLarge)chunks.push(c);}
      if(tooLarge)return fail(res,413,'REQUEST_TOO_LARGE');
      let b;try{b=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return fail(res,400,'INVALID_JSON');}
      submittedBody=b;
      if(path==='/api/demo/submission-history'){
        if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).length)return fail(res,400,'INVALID_HISTORY_QUERY');
        if(!options.historyStore)return fail(res,503,'HISTORY_UNAVAILABLE');
        try{return send(res,200,{history:await options.historyStore.list(sign('history-owner:'+sid)),retentionHours:24});}catch{return fail(res,503,'HISTORY_UNAVAILABLE');}
      }
      if (deciding) {
        if (!b || typeof b !== 'object' || Array.isArray(b) || Object.keys(b).length !== 4 ||
            typeof b.reason !== 'string' || b.reason.length > 500 || !b.reason.trim() ||
            /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(b.reason) ||
            typeof b.requestId !== 'string' || !UUID.test(b.requestId) ||
            typeof b.decisionId !== 'string' || !UUID.test(b.decisionId) ||
            !['APPROVE', 'REJECT'].includes(b.decision)) return fail(res,400,'INVALID_DECISION');
        if (activeDecisions >= 2) return fail(res,429,'DEMO_BUSY');
        activeDecisions++;
        try {
          const ticketId='DEMO-'+sign('ticket:'+sid+':'+b.requestId);
          const demoActor='demo-session-'+sign('reviewer:'+sid).slice(0,32);
          const key=(options.getReviewerKey||getReviewerKey)();
          const response=await (options.fetch||fetch)(target.origin+'/webhook/support-ticket-review-demo',{
            method:'POST', headers:{'content-type':'application/json','x-demo-review-key':key},
            body:JSON.stringify({action:'session-decide',ticketId,demoActor,decisionId:b.decisionId,
              decision:b.decision,reason:b.reason.trim()}),
            redirect:'error',signal:AbortSignal.timeout(12000)
          });
          if (response.status===404) return fail(res,404,'TICKET_NOT_FOUND');
          if (response.status===409) return fail(res,409,'REVIEW_CONFLICT');
          if (!response.ok) return fail(res,503,'REVIEW_UNAVAILABLE');
          const data=await response.json();
          const status=b.decision==='APPROVE'?'APPROVED':'REJECTED';
          if(data.decision?.ticketId!==ticketId||data.decision.status!==status)return fail(res,503,'REVIEW_UNAVAILABLE');
          return send(res,200,{status,replayed:data.decision.replayed===true});
        } catch { return fail(res,503,'REVIEW_UNAVAILABLE'); }
        finally { activeDecisions--; }
      }
      if(path==='/api/demo/ticket-status'){
        if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).length!==1||typeof b.requestId!=='string'||!UUID.test(b.requestId))return fail(res,400,'INVALID_LOOKUP');
        try{
          const ticketId='DEMO-'+sign('ticket:'+sid+':'+b.requestId);
          const r=await (options.fetch||fetch)(target.origin+'/webhook/support-ticket-lookup-demo',{method:'POST',headers:{'content-type':'application/json','x-demo-backend-key':webhookKey},body:JSON.stringify({ticketId}),redirect:'error',signal:AbortSignal.timeout(15000)});
          const raw=await r.text();if(raw.length>30000)return fail(res,503,'LOOKUP_UNAVAILABLE');
          let data;try{data=JSON.parse(raw);}catch{return fail(res,503,'LOOKUP_UNAVAILABLE');}
          if(r.status===404)return fail(res,404,'TICKET_NOT_FOUND');
          if(r.status!==200||!data.ticket)return fail(res,503,'LOOKUP_UNAVAILABLE');
          const t=data.ticket;
          const ticket={ticketRef:ticketId.slice(-10),message:String(t.message||'').slice(0,1500),status:String(t.status||''),category:String(t.category||''),reason:String(t.reason||'').slice(0,500),requiresReview:t.requiresReview===true,reviewReason:String(t.reviewReason||'').slice(0,500),policyVersion:String(t.policyVersion||'').slice(0,32),decision:t.decision?{decision:String(t.decision.decision||'').slice(0,10),reason:String(t.decision.reason||'').slice(0,500),reviewerId:String(t.decision.reviewerId||'').slice(0,64),at:String(t.decision.at||'').slice(0,40)}:null,createdAt:String(t.createdAt||''),updatedAt:String(t.updatedAt||''),events:Array.isArray(t.events)?t.events.slice(0,50).map(e=>({type:String(e.type||'').slice(0,80),from:e.from===null?null:String(e.from||'').slice(0,40),to:String(e.to||'').slice(0,40),at:String(e.at||'').slice(0,60)})):[]};
          return send(res,200,{ticket});
        }catch{return fail(res,503,'LOOKUP_UNAVAILABLE');}
      }
      if(!validateBody(b))return fail(res,400,'FICTIONAL_TICKET_REQUIRED');
      const ticketId='DEMO-'+sign('ticket:'+sid+':'+b.requestId);
      const ticket={ticketId,customerEmail:'fictional@example.invalid',message:b.message.trim()};
      const existing=inflight.get(ticketId);
      if(existing){if(existing.message!==ticket.message)return fail(res,409,'REQUEST_CONFLICT');const out=await existing.promise;return complete(out.status,out.body);}
      if(totalActive>=2){res.setHeader('Retry-After','5');return fail(res,429,'DEMO_BUSY');}
      const promise=forward(ticket);inflight.set(ticketId,{message:ticket.message,promise});
      try{const out=await promise;return complete(out.status,out.body);}finally{inflight.delete(ticketId);}
    }catch{if(!res.headersSent)fail(res,400,'INVALID_REQUEST');else res.end();}
  });
  server.requestTimeout=10000;server.headersTimeout=10000;server.maxHeadersCount=40;
  return server;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  try{const historyStore=createHistoryStore(historyConfig());const port=Number(process.env.PORTFOLIO_DEMO_PORT||8787);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid local demo port');const origin='http://127.0.0.1:'+port;const server=createDemoServer({...localConfig(),historyStore,origin});const prune=setInterval(()=>{void historyStore.prune().catch(()=>{});},300000);prune.unref();void historyStore.prune().catch(()=>{});server.on('close',()=>{clearInterval(prune);void historyStore.close();});server.listen(port,'127.0.0.1',()=>console.log('Local demo: '+origin+'/support-ticket'));}
  catch{console.error('Cannot start: private demo settings missing/invalid.');process.exitCode=1;}
}
