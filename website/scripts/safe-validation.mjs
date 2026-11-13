import fs from'node:fs';import path from'node:path';import {randomBytes,randomUUID,timingSafeEqual} from'node:crypto';
import {spawnSync} from'node:child_process';
import {recordRun} from'./result-recording.mjs';import {connection,currentFingerprint,normalizeRun,insertRun,digest} from'./test-results-store.mjs';
import {SAFE_CHECKS,prepareWorkspace,executeCheck,websiteRoot,runCommand} from'./safe-validation-runner.mjs';
const count=results=>Object.fromEntries(['PASS','FAIL','SKIP','ERROR'].map(k=>[k,results.filter(r=>r.outcome===k).length]));
const outcome=c=>c.ERROR?'ERROR':c.FAIL?'FAIL':c.PASS?'PASS':'SKIP';
export async function validationReadiness(){
 if(!fs.existsSync(path.join(websiteRoot,'node_modules/@playwright/test/cli.js')))return false;
 const {chromium}=await import('@playwright/test');if(!fs.existsSync(chromium.executablePath()))return false;
 let db;try{db=await connection('writer');await db.execute({sql:'SELECT 1',timeout:3000});return true;}catch{return false;}finally{await db?.end().catch(()=>{});}
}
async function persistValidation(run){return recordRun(run,{deliver:async input=>{let db;let timer;try{db=await connection('writer');timer=setTimeout(()=>db.destroy(),7000);return await insertRun(input,db);}finally{clearTimeout(timer);await db?.end().catch(()=>{});}}});}
export function createSafeValidation({port,enabled=false,ready=validationReadiness,execute=executeCheck,prepare=prepareWorkspace,persist=persistValidation,build=async(workspace,signal)=>runCommand(['scripts/build.mjs'],{cwd:workspace.work,env:workspace.env,timeout:15000,signal}),lockFile=path.join(websiteRoot,'.local-reports/safe-validation.lock'),now=Date.now,windowMs=600000,maxStarts=2,globalMax=6,deadlineMs=110000}={}){
 const origin='http://127.0.0.1:'+port,sessions=new Map(),jobs=new Map(),starts=[];let active=null,cache={at:0,ok:false},closed=false;
 const snapshot=j=>({jobId:j.id,state:j.state,outcome:j.outcome,startedAt:j.startedAt,completedAt:j.completedAt,durationMs:Math.max(0,(j.completedAt?Date.parse(j.completedAt):now())-Date.parse(j.startedAt)),counts:j.counts,steps:j.steps.map(s=>({...s}))});
 async function available(){if(!enabled||closed)return false;if(now()-cache.at>5000||!cache.at){cache={at:now(),ok:await ready().catch(()=>false)};}return cache.ok;}
 function takeLock(){fs.mkdirSync(path.dirname(lockFile),{recursive:true});try{if(fs.existsSync(lockFile)){let old;try{old=JSON.parse(fs.readFileSync(lockFile,'utf8'));if(Number.isSafeInteger(old.pid)){try{process.kill(old.pid,0);return false;}catch(e){if(e.code!=='ESRCH')return false;}}else return false;}catch{return false;}fs.unlinkSync(lockFile);}fs.writeFileSync(lockFile,JSON.stringify({pid:process.pid}),{flag:'wx'});return true;}catch{return false;}}
 const releaseLock=()=>{try{if(JSON.parse(fs.readFileSync(lockFile)).pid===process.pid)fs.unlinkSync(lockFile);}catch{}};
 async function recordFailure(job,code,label){
  const completedAt=new Date(now()).toISOString();const input={runId:randomUUID(),suite:'Safe Validation - '+label,environment:'LOCAL',dependencyMode:'ISOLATED',provenance:'CAPTURED',startedAt:job.startedAt,completedAt,observedAt:completedAt,durationMs:now()-Date.parse(job.startedAt),fingerprint:job.fingerprint||null,revision:job.revision||null,dirty:job.dirty??null,artifactDigest:digest({jobId:job.id,code,label}),results:[{name:label,outcome:'ERROR',errorCode:code,categories:['Error handling and timeouts']}]};
  const run=normalizeRun(input);try{const receipt=await persist(run);job.steps.push({id:'error',label,state:'COMPLETED',outcome:'ERROR',runId:run.runId,persistence:receipt.persistence});}catch{job.steps.push({id:'error',label,state:'COMPLETED',outcome:'ERROR',persistence:'UNCONFIRMED'});}job.counts.ERROR++;
 }
 async function launch(job){let workspace;const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),deadlineMs);job.abort=abort;
 try{job.fingerprint=currentFingerprint();const revision=spawnSync('git',['rev-parse','HEAD'],{cwd:websiteRoot,encoding:'utf8',windowsHide:true,timeout:3000});job.revision=revision.status===0?revision.stdout.trim():null;const status=spawnSync('git',['status','--porcelain'],{cwd:websiteRoot,encoding:'utf8',windowsHide:true,timeout:3000});job.dirty=status.status===0?!!status.stdout.trim():null;workspace=prepare();const built=await build(workspace,abort.signal);if(built.code!==0||built.reason){const error=Error('RUNNER_ERROR');error.code=built.reason;throw error;}
 for(let i=0;i<SAFE_CHECKS.length;i++){
  const step=job.steps[i];if(abort.signal.aborted){step.state='SKIPPED';continue;}step.state='RUNNING';
  const input=await execute(SAFE_CHECKS[i],workspace,abort.signal);input.fingerprint=job.fingerprint;input.revision=job.revision;input.dirty=job.dirty;
  const run=normalizeRun(input);const receipt=await persist(run);step.state='COMPLETED';step.outcome=run.outcome;step.durationMs=run.durationMs;step.runId=run.runId;step.persistence=receipt.persistence;step.counts=count(run.results);
  for(const k of Object.keys(job.counts))job.counts[k]+=step.counts[k];if(receipt.persistence!=='MYSQL')cache.ok=false;
 }
 }catch(error){await recordFailure(job,abort.signal.aborted||error.code==='TIMEOUT'?'TIMEOUT':'RUNNER_ERROR','Suite execution error');
 }finally{clearTimeout(timer);try{workspace?.close();}catch{await recordFailure(job,'RUNNER_ERROR','Worker cleanup error');}for(const step of job.steps)if(step.state==='WAITING'||step.state==='RUNNING')step.state='SKIPPED';job.completedAt=new Date(now()).toISOString();job.state='COMPLETED';job.outcome=outcome(job.counts);releaseLock();active=null;}
 }
 async function handle(req,res){
  const send=(status,body)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'});res.end(JSON.stringify(body));};
  if(req.headers.host!==new URL(origin).host||!['127.0.0.1','::ffff:127.0.0.1','::1'].includes(req.socket.remoteAddress)||req.headers.origin&&req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site')return send(403,{error:'REQUEST_NOT_ALLOWED'});
  let url;try{url=new URL(req.url,origin);}catch{return send(400,{error:'INVALID_REQUEST'});}if(url.search)return send(400,{error:'INVALID_REQUEST'});
  if(!['GET','POST'].includes(req.method))return send(405,{error:'METHOD_NOT_ALLOWED'});
  if(!enabled||closed)return send(503,{error:'VALIDATION_UNAVAILABLE',available:false});
  const time=now();for(const[k,s]of sessions)if(s.expires<time)sessions.delete(k);for(const[k,j]of jobs)if(j.completedAt&&time-Date.parse(j.completedAt)>3600000)jobs.delete(k);
  let token=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('validation_session='))?.slice(19),session=sessions.get(token);
  if(url.pathname==='/api/validation/session'&&req.method==='GET'){
   if(!await available())return send(503,{available:false,error:'VALIDATION_UNAVAILABLE'});
   if(!session){if(sessions.size>=1000)return send(429,{error:'SESSION_LIMIT'});token=randomBytes(32).toString('hex');session={csrf:randomBytes(32).toString('hex'),expires:time+1800000,starts:[],reads:[]};sessions.set(token,session);}
   res.setHeader('Set-Cookie','validation_session='+token+'; HttpOnly; SameSite=Strict; Path=/api/validation; Max-Age=1800');return send(200,{available:true,csrf:session.csrf,busy:!!active,checks:SAFE_CHECKS.map(c=>c.label),scope:'ISOLATED_AND_MOCKED'});
  }
  if(!session)return send(403,{error:'REQUEST_NOT_ALLOWED'});session.reads=session.reads.filter(t=>time-t<60000);if(session.reads.length>=90)return send(429,{error:'READ_LIMIT'});session.reads.push(time);
  if(req.method==='GET'&&/^\/api\/validation\/jobs\/[a-f0-9-]{36}$/.test(url.pathname)){const job=jobs.get(url.pathname.split('/').at(-1));return job&&job.owner===token?send(200,snapshot(job)):send(404,{error:'JOB_NOT_FOUND'});}
  if(req.method!=='POST'||url.pathname!=='/api/validation/jobs')return send(404,{error:'NOT_FOUND'});
  const csrf=req.headers['x-validation-csrf'];if(req.headers.origin!==origin||typeof csrf!=='string'||!/^[a-f0-9]{64}$/.test(csrf)||csrf.length!==session.csrf.length||!timingSafeEqual(Buffer.from(csrf),Buffer.from(session.csrf)))return send(403,{error:'REQUEST_NOT_ALLOWED'});
  if(req.headers['content-type']?.split(';')[0]!=='application/json')return send(415,{error:'JSON_REQUIRED'});
  if(Number(req.headers['content-length'])>64){req.resume();return send(413,{error:'REQUEST_TOO_LARGE'});}let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>64)return send(413,{error:'REQUEST_TOO_LARGE'});}try{const body=JSON.parse(text);if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).length)throw Error();}catch{return send(400,{error:'EMPTY_OBJECT_REQUIRED'});}
  const requestId=req.headers['x-validation-request'];if(typeof requestId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(requestId))return send(400,{error:'INVALID_REQUEST_ID'});
  for(const job of jobs.values())if(job.owner===token&&job.requestId===requestId)return send(202,snapshot(job));
  if(active)return send(409,{error:'VALIDATION_BUSY'});if(!await available())return send(503,{error:'VALIDATION_UNAVAILABLE'});
  // Readiness is asynchronous: recheck the single-worker slot before taking it.
  if(active)return send(409,{error:'VALIDATION_BUSY'});session.starts=session.starts.filter(t=>time-t<windowMs);while(starts.length&&time-starts[0]>=3600000)starts.shift();if(session.starts.length>=maxStarts||starts.length>=globalMax||jobs.size>=30)return send(429,{error:'START_LIMIT'});
  if(!takeLock())return send(409,{error:'VALIDATION_BUSY'});
  const job={id:randomUUID(),requestId,owner:token,state:'RUNNING',startedAt:new Date(time).toISOString(),completedAt:null,outcome:null,counts:count([]),steps:SAFE_CHECKS.map(c=>({id:c.id,label:c.label,state:'WAITING'}))};jobs.set(job.id,job);active=job;starts.push(time);session.starts.push(time);void launch(job);return send(202,snapshot(job));
 }
 return{handle:async(req,res)=>{try{await handle(req,res);}catch{if(!res.headersSent){res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({error:'VALIDATION_UNAVAILABLE'}));}else res.end();}},async close(){closed=true;active?.abort?.abort();while(active)await new Promise(r=>setTimeout(r,25));},snapshot:()=>active?snapshot(active):null};
}
