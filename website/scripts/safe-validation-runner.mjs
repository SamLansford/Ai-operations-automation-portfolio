import fs from 'node:fs';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {adapt} from './test-result-adapters.mjs';
export const websiteRoot=fileURLToPath(new URL('../',import.meta.url));
export const SAFE_CHECKS=Object.freeze([
 {id:'structural',label:'Website structure',args:['scripts/check-site.mjs'],adapter:'structural',artifact:'.local-reports/structure.json',timeout:15000},
 {id:'bridge',label:'Isolated API security',args:['--test','--test-reporter=tap','tests/local-demo-proxy.test.mjs'],adapter:'tap',timeout:15000},
 {id:'collector',label:'Pure collector checks',args:['--test','--test-reporter=tap','tests/test-results.test.mjs'],adapter:'tap',timeout:15000},
 {id:'browser',label:'Fixture-backed desktop browser',args:['node_modules/@playwright/test/cli.js','test'],adapter:'playwright',artifact:'.local-reports/browser.json',timeout:60000},
]);
// Exact source allowlist: no live runners, credentials, .env, SQL tools or ticket code.
const files=['package.json','playwright.config.mjs','src/projects.mjs','src/render.mjs','src/test-cases.mjs','src/assets/app.mjs','src/assets/style.css','src/assets/mark.svg','src/assets/reliability.mjs','src/demo/app.mjs','src/demo/style.css','src/demo/index.html','scripts/build.mjs','scripts/check-site.mjs','scripts/serve.mjs','scripts/security-headers.mjs','scripts/local-demo-proxy.mjs','scripts/reliability-api.mjs','scripts/test-results-store.mjs','scripts/test-result-adapters.mjs','scripts/result-recording.mjs','scripts/validation-network-guard.cjs','tests/website.spec.mjs','tests/local-demo-proxy.test.mjs','tests/test-results.test.mjs'];
export function workerEnvironment(guard){
 const env={};for(const key of ['SystemRoot','WINDIR','TEMP','TMP','LOCALAPPDATA','USERPROFILE','HOME'])if(process.env[key])env[key]=process.env[key];
 env.PATH=[path.dirname(process.execPath),process.env.SystemRoot?path.join(process.env.SystemRoot,'System32'):'/usr/bin','/bin'].join(path.delimiter);
 return {...env,RESULTS_DB_TEST:'0',SAFE_VALIDATION_WORKER:'1',NODE_OPTIONS:'--max-old-space-size=256 --require '+JSON.stringify(guard)};
}
export async function runCommand(args,{cwd,env,timeout=15000,signal,limit=524288}={}){
 return new Promise(resolve=>{
  let child,finished=false,stopReason=null,output='',size=0,killTimer;
  const kill=()=>{if(!child?.pid)return;if(process.platform==='win32')spawnSync(path.join(process.env.SystemRoot||'C:/Windows','System32','taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',timeout:5000});else{try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}}};
  const stop=reason=>{if(stopReason)return;stopReason=reason;kill();killTimer=setTimeout(()=>done(null),1000);};
  const done=code=>{if(finished)return;finished=true;clearTimeout(timer);clearTimeout(killTimer);signal?.removeEventListener('abort',abort);resolve({code,output,reason:stopReason});};
  const abort=()=>stop('INTERRUPTED');const timer=setTimeout(()=>stop('TIMEOUT'),timeout);
  try{child=spawn(process.execPath,args,{cwd,env,windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});for(const stream of [child.stdout,child.stderr])stream.on('data',buf=>{size+=buf.length;if(size>limit)stop('OUTPUT_LIMIT');else output+=buf.toString('utf8');});child.on('error',()=>{stopReason='RUNNER_ERROR';done(null);});child.on('close',done);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();}catch{stopReason='RUNNER_ERROR';done(null);}
 });
}
export function prepareWorkspace(){
 const base=path.join(websiteRoot,'.local-reports','safe-validation');fs.mkdirSync(base,{recursive:true});
 // A single job is allowed, and only its own bounded temporary directory is writable.
 const dir=fs.mkdtempSync(path.join(base,'job-')),work=path.join(dir,'website');
 for(const f of files){const from=path.join(websiteRoot,f);if(fs.lstatSync(from).isSymbolicLink())throw Error('WORKSPACE_SOURCE_LINK');const to=path.join(work,f);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);}
 const workflow=path.join(dir,'.github/workflows/website-tests.yml');fs.mkdirSync(path.dirname(workflow),{recursive:true});fs.copyFileSync(path.join(websiteRoot,'../.github/workflows/website-tests.yml'),workflow);
 fs.symlinkSync(path.join(websiteRoot,'node_modules'),path.join(work,'node_modules'),process.platform==='win32'?'junction':'dir');
 const temp=path.join(dir,'temp');fs.mkdirSync(temp);const env={...workerEnvironment(path.join(work,'scripts/validation-network-guard.cjs')),TEMP:temp,TMP:temp,TMPDIR:temp};
 return {work,env,close(){const resolved=fs.realpathSync(dir),parent=fs.realpathSync(base);if(path.dirname(resolved)!==parent||!path.basename(resolved).startsWith('job-'))throw Error('WORKSPACE_BOUNDARY');fs.rmSync(resolved,{recursive:true,force:true});}};
}
export async function executeCheck(check,workspace,signal){
 const startedAt=new Date().toISOString();const result=await runCommand(check.args,{cwd:workspace.work,env:workspace.env,timeout:check.timeout,signal});
 const completedAt=new Date().toISOString();let parsed;
 if(check.artifact&&!result.reason){try{const artifact=path.join(workspace.work,check.artifact);if(fs.statSync(artifact).size>4000000)throw Error();parsed=adapt(check.adapter,fs.readFileSync(artifact,'utf8'));}catch{}}
 else if(!result.reason){try{parsed=adapt(check.adapter,result.output);}catch{}}
 const results=parsed?.results||[];
 if(result.reason||!results.length||result.code!==0&&!results.some(r=>['FAIL','ERROR'].includes(r.outcome)))results.push({name:check.label+' runner completion',outcome:'ERROR',errorCode:result.reason==='TIMEOUT'?'TIMEOUT':result.reason==='INTERRUPTED'?'INTERRUPTED':'RUNNER_ERROR',durationMs:Date.parse(completedAt)-Date.parse(startedAt),categories:['Error handling and timeouts']});
 return {runId:randomUUID(),suite:'Safe Validation - '+check.label,environment:'LOCAL',dependencyMode:check.id==='structural'||check.id==='collector'?'ISOLATED':'MOCKED',provenance:'CAPTURED',startedAt,completedAt,observedAt:completedAt,durationMs:Date.parse(completedAt)-Date.parse(startedAt),results,artifactDigest:(await import('./test-results-store.mjs')).digest({results,code:result.code,reason:result.reason}),limitations:['Fixed local safe checks only. No actual n8n, ticket database or model calls. Database integration checks intentionally disabled.']};
}
