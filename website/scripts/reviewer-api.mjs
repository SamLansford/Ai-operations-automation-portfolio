import{randomBytes,scrypt as derive,timingSafeEqual}from'node:crypto';import{promisify}from'node:util';import{validateReviewRequest}from'../../01-ai-support-ticket-system/demo/reviewer-workflow.mjs';import{readReviewerConfig,reveal}from'../../01-ai-support-ticket-system/demo/reviewer-private.mjs';
const scrypt=promisify(derive);
export function createReviewerAPI({port,config=readReviewerConfig,upstreamFetch=fetch,decodeKey=reveal,now=Date.now}={}){
 const origin='http://127.0.0.1:'+port,sessions=new Map(),loginTimes=[],decisionTimes=[];let loginActive=0,readActive=0,keyCache=null;
 const send=(r,status,body)=>{r.writeHead(status,{'content-type':'application/json','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'});r.end(JSON.stringify(body));};
 const token=()=>randomBytes(32).toString('hex');const same=(a,b)=>typeof a==='string'&&/^[a-f0-9]{64}$/.test(a)&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
 function cookie(res,value){res.setHeader('Set-Cookie','reviewer_session='+value+'; HttpOnly; SameSite=Strict; Path=/api/reviewer; Max-Age=1800');}
 const issue=(res,c,authenticated=false)=>{const id=token(),s={csrf:token(),authenticated,epoch:c.passwordHash,expires:now()+1800000,reads:[],decisions:[]};sessions.set(id,s);cookie(res,id);return s;};
 async function body(req){if(Number(req.headers['content-length'])>4096){req.resume();throw Error('BODY_TOO_LARGE');}let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>4096)throw Error('BODY_TOO_LARGE');}const b=JSON.parse(raw);if(!b||typeof b!=='object'||Array.isArray(b))throw Error('INVALID_BODY');return b;}
 async function call(c,input){if(readActive>=3)return{httpStatus:429,error:'REVIEW_BUSY'};readActive++;try{if(!keyCache||keyCache.protected!==c.protectedWebhook)keyCache={protected:c.protectedWebhook,key:decodeKey(c.protectedWebhook)};const r=await upstreamFetch('http://localhost:5678/webhook/support-ticket-review-demo',{method:'POST',headers:{'content-type':'application/json','x-demo-review-key':keyCache.key},body:JSON.stringify(input),redirect:'error',signal:AbortSignal.timeout(12000)});const text=await r.text();if(text.length>160000)throw Error();const b=JSON.parse(text);if(![200,400,404,409,429,503].includes(r.status)||b.httpStatus!==r.status)throw Error();if(r.status!==200)return{httpStatus:r.status,error:r.status===409?'REVIEW_CONFLICT':r.status===404?'TICKET_NOT_FOUND':r.status===400?'INVALID_REVIEW_REQUEST':'REVIEW_UNAVAILABLE'};return b;}catch{return{httpStatus:503,error:'REVIEW_UNAVAILABLE'};}finally{readActive--;}}
 async function handle(req,res){
 if(req.headers.host!==new URL(origin).host||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)||req.headers.origin&&req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site')return send(res,403,{error:'REQUEST_NOT_ALLOWED'});
 let c;try{c=config();}catch{return send(res,503,{error:'REVIEWER_NOT_CONFIGURED'});}if(!c.passwordConfigured)return send(res,503,{error:'REVIEWER_PASSWORD_SETUP_REQUIRED'});
 const url=new URL(req.url,origin);for(const[k,s]of sessions)if(s.expires<now()||s.epoch!==c.passwordHash)sessions.delete(k);
 const id=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('reviewer_session='))?.slice(17);let s=sessions.get(id);
 if(req.method==='GET'&&url.pathname==='/api/reviewer/session'&&!url.search){if(!s){if(sessions.size>=200)return send(res,429,{error:'SESSION_LIMIT'});s=issue(res,c);}return send(res,200,{authenticated:s.authenticated,csrf:s.csrf,...(s.authenticated?{reviewerId:c.reviewerId,username:c.username}:{})});}
 if(req.method==='POST'){
  if(req.headers.origin!==origin||!s||!same(req.headers['x-reviewer-csrf'],s.csrf))return send(res,403,{error:'REQUEST_NOT_ALLOWED'});
  if(req.headers['content-type']?.split(';')[0]!=='application/json')return send(res,415,{error:'JSON_REQUIRED'});
 }
 if(req.method==='POST'&&url.pathname==='/api/reviewer/login'&&!url.search){
  const time=now();while(loginTimes.length&&time-loginTimes[0]>600000)loginTimes.shift();if(loginTimes.length>=5||loginActive>=2)return send(res,429,{error:'LOGIN_LIMIT'});loginTimes.push(time);loginActive++;
  try{const b=await body(req);if(Object.keys(b).length!==2||typeof b.username!=='string'||typeof b.password!=='string'||b.username.length>64||b.password.length<12||b.password.length>128)return send(res,403,{error:'LOGIN_FAILED'});const actual=await scrypt(b.password,c.salt,64);const expected=Buffer.from(c.passwordHash,'hex');const valid=expected.length===actual.length&&timingSafeEqual(actual,expected)&&b.username===c.username;actual.fill(0);if(!valid)return send(res,403,{error:'LOGIN_FAILED'});sessions.delete(id);s=issue(res,c,true);return send(res,200,{authenticated:true,csrf:s.csrf,reviewerId:c.reviewerId,username:c.username});}finally{loginActive--;}
 }
 if(!s?.authenticated)return send(res,403,{error:'REVIEWER_AUTH_REQUIRED'});
 if(req.method==='POST'&&url.pathname==='/api/reviewer/logout'&&!url.search){const b=await body(req);if(Object.keys(b).length)return send(res,400,{error:'INVALID_BODY'});sessions.delete(id);res.setHeader('Set-Cookie','reviewer_session=; HttpOnly; SameSite=Strict; Path=/api/reviewer; Max-Age=0');return send(res,200,{authenticated:false});}
 let input;if(req.method==='GET'&&['/api/reviewer/pending','/api/reviewer/history'].includes(url.pathname)&&!url.search)input={action:url.pathname.split('/').at(-1)};
 else if(req.method==='GET'&&url.pathname==='/api/reviewer/ticket'&&[...url.searchParams.keys()].length===1&&url.searchParams.has('ticketId'))input={action:'detail',ticketId:url.searchParams.get('ticketId')};
 else if(req.method==='POST'&&url.pathname==='/api/reviewer/decision'&&!url.search){const b=await body(req);input={...b,action:'decide'};if(Object.keys(b).some(k=>!['ticketId','decisionId','decision','reason'].includes(k)))return send(res,400,{error:'INVALID_REVIEW_REQUEST'});}
 else return send(res,404,{error:'NOT_FOUND'});
 const v=validateReviewRequest(input);if(!v.valid)return send(res,400,{error:v.error});const time=now();s.reads=s.reads.filter(t=>time-t<60000);if(s.reads.length>=60)return send(res,429,{error:'READ_LIMIT'});s.reads.push(time);
 if(input.action==='decide'){s.decisions=s.decisions.filter(t=>time-t<60000);while(decisionTimes.length&&time-decisionTimes[0]>60000)decisionTimes.shift();if(s.decisions.length>=10||decisionTimes.length>=20)return send(res,429,{error:'DECISION_LIMIT'});s.decisions.push(time);decisionTimes.push(time);}
 // Identity is not accepted in input. n8n fixes it from its dedicated authenticated credential.
 const result=await call(c,input);return send(res,result.httpStatus,result);
 }
 return{handle:async(q,r)=>{try{await handle(q,r);}catch{if(!r.headersSent)send(r,400,{error:'INVALID_REVIEW_REQUEST'});else r.end();}},close(){sessions.clear();keyCache=null;}};
}
