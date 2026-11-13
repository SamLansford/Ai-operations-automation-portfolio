import mysql from 'mysql2/promise';import fs from 'node:fs';import path from 'node:path';import{spawnSync}from'node:child_process';
export const OUTCOMES=['REJECTED','PROCESSED','PENDING_REVIEW','PROCESSING_FAILED','PROCESSING','UNCONFIRMED'];
export const ERROR_CODES=['HOST_NOT_ALLOWED','REQUEST_NOT_ALLOWED','JSON_REQUIRED','RATE_LIMITED','REQUEST_TOO_LARGE','INVALID_JSON','FICTIONAL_TICKET_REQUIRED','REQUEST_CONFLICT','DEMO_BUSY','AUTOMATION_TIMEOUT','AUTOMATION_UNAVAILABLE','INVALID_AUTOMATION_RESPONSE','INVALID_REQUEST'];
export const HISTORY_LIMIT=50,RETENTION_HOURS=24;
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
export function historyConfig(){
 const cfg=JSON.parse(fs.readFileSync(new URL('../../.env.demo-submissions.json',import.meta.url),'utf8'));
 if(cfg.host!=='127.0.0.1'||cfg.database!=='ai_support_portfolio_demo'||cfg.user!=='portfolio_demo_history')throw Error('HISTORY_CONFIG_INVALID');
 const r=spawnSync(path.join(process.env.SystemRoot||'C:/Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-Command',"Import-Module ($PSHOME+'\\Modules\\Microsoft.PowerShell.Security\\Microsoft.PowerShell.Security.psd1') -ErrorAction Stop;$s=ConvertTo-SecureString ([Console]::In.ReadToEnd());$p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s);try{[Console]::Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($p))}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p)}"],{input:cfg.protectedPassword,encoding:'utf8',windowsHide:true,timeout:5000,maxBuffer:16384});if(r.status!==0||!r.stdout)throw Error('HISTORY_CREDENTIAL_UNAVAILABLE');
 const{protectedPassword,...rest}=cfg;return{...rest,password:r.stdout};
}
export function createHistoryStore(cfg){
 const pool=mysql.createPool({...cfg,connectionLimit:2,queueLimit:10,connectTimeout:2000,dateStrings:true,timezone:'Z',multipleStatements:false});
 const execute=(db,sql,values=[])=>db.execute({sql,timeout:2500},values);
 return{
 async record(event){
 if(!hash(event.ownerKey)||!hash(event.eventKey)||!OUTCOMES.includes(event.outcome)||!Number.isInteger(event.httpStatus)||event.httpStatus<100||event.httpStatus>599||event.errorCode&&!ERROR_CODES.includes(event.errorCode))throw Error('INVALID_HISTORY_EVENT');
 if(event.ticketRef!=null&&!/^[a-f0-9]{10}$/.test(event.ticketRef))throw Error('INVALID_HISTORY_REFERENCE');
 if(event.ticketStatus!=null&&!['AUTO_ROUTED','PENDING_REVIEW','PROCESSING','FAILED'].includes(event.ticketStatus))throw Error('INVALID_HISTORY_STATUS');
 // Serialize the duplicate check, expiry purge and insert across backend workers.
 const db=await pool.getConnection();let locked=false;try{
 const[lock]=await execute(db,"SELECT GET_LOCK('portfolio_demo_submission_history',1) acquired");if(lock[0].acquired!==1)return null;locked=true;
 await execute(db,'DELETE FROM demo_submission_history WHERE created_at < UTC_TIMESTAMP(3)-INTERVAL 24 HOUR LIMIT 500');
 const[existing]=await execute(db,'SELECT RIGHT(event_key,12) attemptRef,created_at createdAt FROM demo_submission_history WHERE event_key=? AND owner_key=?',[event.eventKey,event.ownerKey]);if(existing.length)return existing[0];
 const[count]=await execute(db,'SELECT COUNT(*) n FROM demo_submission_history');if(count[0].n>=10000)return null;
 await execute(db,'INSERT INTO demo_submission_history(event_key,owner_key,outcome,http_status,error_code,ticket_ref,ticket_status,created_at) VALUES (?,?,?,?,?,?,?,UTC_TIMESTAMP(3))',[event.eventKey,event.ownerKey,event.outcome,event.httpStatus,event.errorCode||null,event.ticketRef||null,event.ticketStatus||null]);
 const[rows]=await execute(db,'SELECT RIGHT(event_key,12) attemptRef,created_at createdAt FROM demo_submission_history WHERE event_key=?',[event.eventKey]);return rows[0];
 }finally{if(locked)await execute(db,"SELECT RELEASE_LOCK('portfolio_demo_submission_history')").catch(()=>{});db.release();}
 },
 // Ownership is derived by the server; the browser never supplies this key.
 async list(ownerKey){if(!hash(ownerKey))throw Error('INVALID_HISTORY_OWNER');const[rows]=await execute(pool,'SELECT RIGHT(event_key,12) attemptRef,outcome,http_status httpStatus,error_code errorCode,ticket_ref ticketRef,ticket_status ticketStatus,created_at createdAt FROM demo_submission_history WHERE owner_key=? AND created_at>=UTC_TIMESTAMP(3)-INTERVAL 24 HOUR ORDER BY created_at DESC,event_key DESC LIMIT 50',[ownerKey]);return rows;},
 // Retention deletes only this new metadata table, never tickets or audit events.
 async prune(){await execute(pool,'DELETE FROM demo_submission_history WHERE created_at < UTC_TIMESTAMP(3)-INTERVAL 24 HOUR LIMIT 10000');},
 async close(){await pool.end();}
 };
}
