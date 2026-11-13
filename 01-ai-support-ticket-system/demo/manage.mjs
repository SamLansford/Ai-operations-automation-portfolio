// Local operator tools only. Never imported by browser code.
import { readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';

const root = new URL('../../', import.meta.url);
export function settings() {
  const out = {};
  for (const line of readFileSync(new URL('.env', root), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}
export async function api(path, method = 'GET', body) {
  const s = settings();
  const base = new URL(s.N8N_API_URL);
  assert.ok(['localhost','127.0.0.1'].includes(base.hostname));
  const r = await fetch(base.href.replace(/\/$/,'') + path, {
    method, headers: { 'X-N8N-API-KEY': s.N8N_DEMO_API_KEY, 'content-type':'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), redirect:'error', signal:AbortSignal.timeout(20000),
  }).catch(() => { throw Error('Local management transport failed; details withheld'); });
  if (!r.ok) throw Error(`Local management ${method} returned HTTP ${r.status}`);
  return r.status === 204 ? null : r.json();
}
export function mysql(query, account) {
  // Query and optional password enter via stdin, never shell arguments or output.
  const command = account
    ? 'IFS= read -r MYSQL_PWD; export MYSQL_PWD; exec mysql -h127.0.0.1 -uportfolio_demo_runtime --default-character-set=utf8mb4 --batch --raw --skip-column-names'
    : 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot --default-character-set=utf8mb4 --batch --raw --skip-column-names';
  const r = spawnSync('docker',['exec','-i','mysql-ai-operations','sh','-c',command], {
    input: account ? account.password+'\n'+query : query, encoding:'utf8',timeout:20000,
  });
  return { ok:r.status===0, output:r.status===0?r.stdout.trim():'', denied:/ERROR (1044|1142)/.test(r.stderr||''),
    errorCode:(r.stderr||'').match(/ERROR (\d+)/)?.[1] };
}
export function rootSql(query) { const r=mysql(query); if(!r.ok)throw Error(`Project SQL operation failed (${r.errorCode||'transport'}); details withheld`); return r.output; }
export function exportCredential(id) {
  assert.match(id,/^[A-Za-z0-9_-]+$/);
  const r=spawnSync('docker',['exec','n8n','sh','-c',`umask 077; f=$(mktemp /tmp/portfolio-demo-XXXXXX); trap 'rm -f "$f"' EXIT; n8n export:credentials --id=${id} --decrypted --output="$f" >/dev/null 2>/dev/null; cat "$f"`],{encoding:'utf8',timeout:30000});
  if(r.status!==0)throw Error('Scoped credential read failed; output withheld');
  const list=JSON.parse(r.stdout);assert.equal(list.length,1);assert.equal(list[0].id,id);return list[0];
}
function importCredentials(credentials, project) {
  assert.match(project,/^[A-Za-z0-9_-]+$/);
  const r=spawnSync('docker',['exec','-i','n8n','sh','-c',`umask 077; f=$(mktemp /tmp/portfolio-demo-XXXXXX); trap 'rm -f "$f"' EXIT; cat > "$f"; n8n import:credentials --input="$f" --projectId=${project}`],{input:JSON.stringify(credentials),encoding:'utf8',timeout:30000});
  if(r.status!==0||!new RegExp(`Successfully imported ${credentials.length} credentials?`).test(r.stdout))throw Error('Demo credential import failed; output withheld');
}
export const definition = w => ({name:w.name,nodes:w.nodes,connections:w.connections,settings:w.settings});
export const portable = w => {const d=structuredClone(definition(w));for(const n of d.nodes)delete n.credentials;return {...d,active:false,pinData:{}};};
export async function setActive(active) {
  const id=settings().DEMO_WORKFLOW_ID;assert.ok(id);
  const w=await api('/workflows/'+id);assert.equal(w.name,'Portfolio 1 - AI Support Ticket Intake - DEMO');
  if(w.active!==active)await api(`/workflows/${id}/${active?'publish':'unpublish'}`,'POST',{});
  assert.equal((await api('/workflows/'+id)).active,active);
  // The active flag precedes asynchronous registration of the production webhook.
  if(active)await delay(1000);
}
export async function setLookupActive(active) {
  const id=settings().DEMO_LOOKUP_WORKFLOW_ID;assert.ok(id,'Lookup workflow not configured');
  const w=await api('/workflows/'+id);assert.equal(w.name,'Portfolio 1 - Ticket Lookup - DEMO');
  if(w.active!==active)await api('/workflows/'+id+'/'+(active?'publish':'unpublish'),'POST',{});
  assert.equal((await api('/workflows/'+id)).active,active);
  if(active)await delay(1000);
}
export function originalDataHash() {
  return createHash('sha256').update(rootSql(`SELECT SHA2(CAST(JSON_ARRAY(ticket_id,customer_email,customer_message,classification_category,classification_reason,requires_review,review_reason,processing_status,payload_fingerprint,execution_id,policy_version,created_at,updated_at) AS CHAR CHARACTER SET utf8mb4),256) FROM ai_support_portfolio.tickets ORDER BY ticket_id; SELECT SHA2(CAST(JSON_ARRAY(audit_id,ticket_id,event_key,event_type,previous_status,new_status,reviewer_id,execution_id,details,occurred_at) AS CHAR CHARACTER SET utf8mb4),256) FROM ai_support_portfolio.ticket_audit ORDER BY audit_id;`)).digest('hex');
}
async function provision() {
  const s=settings();assert.ok(!s.DEMO_WORKFLOW_ID,'Demo already provisioned');
  const protectedIds=['0G0j4x3GtVpRCAPa','u0tVpaiOEqBLShlS','2fC4kymKXdm0o3sz','IqMpoRI8EZcSuqrc'];
  const before=await Promise.all(protectedIds.map(id=>api('/workflows/'+id)));
  const source=before[1];assert.equal(source.active,false);assert.equal(source.nodes.length,18);
  const dataHash=originalDataHash();
  assert.equal(rootSql("SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='ai_support_portfolio_demo';"),'0');
  assert.equal(rootSql("SELECT COUNT(*) FROM mysql.user WHERE User='portfolio_demo_runtime';"),'0');
  assert.equal(rootSql('SELECT @@general_log,@@slow_query_log;'),'0\t0','Do not send generated SQL credentials to enabled query logs');
  const ddl = name => {
    // SHOW CREATE returns one metadata row; no customer records are retrieved.
    const raw=rootSql('SHOW CREATE TABLE ai_support_portfolio.'+name+';').split('\t').slice(1).join('\t').replaceAll('\\n','\n');
    return raw.replace('CREATE TABLE `'+name+'`','CREATE TABLE `ai_support_portfolio_demo`.`'+name+'`')
      .replace(/REFERENCES `tickets`/g,'REFERENCES `ai_support_portfolio_demo`.`tickets`').replace(/ AUTO_INCREMENT=\d+/g,'');
  };
  const ticketDdl=ddl('tickets'),auditDdl=ddl('ticket_audit');
  const password=randomBytes(32).toString('base64url'),key=randomBytes(32).toString('base64url');
  rootSql(`CREATE DATABASE ai_support_portfolio_demo CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
    ${ticketDdl}; ${auditDdl}; CREATE USER 'portfolio_demo_runtime'@'%' IDENTIFIED BY '${password}';
    GRANT SELECT,INSERT ON ai_support_portfolio_demo.tickets TO 'portfolio_demo_runtime'@'%';
    GRANT UPDATE(classification_category,classification_reason,requires_review,review_reason,processing_status,policy_version) ON ai_support_portfolio_demo.tickets TO 'portfolio_demo_runtime'@'%';
    GRANT INSERT ON ai_support_portfolio_demo.ticket_audit TO 'portfolio_demo_runtime'@'%';`);
  for(const query of ['SELECT ticket_id FROM ai_support_portfolio.tickets LIMIT 0;','SELECT ticket_id FROM ai_support_portfolio.ticket_audit LIMIT 0;']){
    const denied=mysql(query,{password});assert.equal(denied.ok,false);assert.equal(denied.denied,true);
  }
  assert.equal(mysql('SELECT COUNT(*) FROM ai_support_portfolio_demo.tickets;',{password}).output,'0');
  console.log('PASS demo runtime denied original ticket/audit access before any demo writes; demo tables empty.');
  const old=exportCredential(source.nodes.find(n=>n.type==='n8n-nodes-base.mySql').credentials.mySql.id);
  const db={id:randomUUID(),name:'Portfolio 1 - Demo MySQL',type:'mySql',data:{...old.data,user:'portfolio_demo_runtime',password,database:'ai_support_portfolio_demo'}};
  const auth={id:randomUUID(),name:'Portfolio 1 - Demo Webhook',type:'httpHeaderAuth',data:{name:'x-demo-backend-key',value:key}};
  importCredentials([db,auth],source.shared.find(x=>x.role==='workflow:owner').projectId);
  const w=structuredClone(definition(source));w.name='Portfolio 1 - AI Support Ticket Intake - DEMO';
  for(const n of w.nodes){n.id=randomUUID();if(n.type==='n8n-nodes-base.mySql'){n.parameters.query=n.parameters.query.replaceAll('ai_support_portfolio.','ai_support_portfolio_demo.');n.credentials={mySql:{id:db.id,name:db.name}};}
    if(n.type==='n8n-nodes-base.webhook'){n.webhookId=randomUUID();n.parameters.path='support-ticket-intake-demo';n.parameters.authentication='headerAuth';n.credentials={httpHeaderAuth:{id:auth.id,name:auth.name}};}}
  Object.assign(w.settings,{saveDataSuccessExecution:'none',saveDataErrorExecution:'none',saveManualExecutions:false,saveExecutionProgress:false,executionTimeout:120});
  const created=await api('/workflows','POST',w);assert.equal(created.active,false);
  appendFileSync(new URL('.env',root),`\n# Isolated local support demo; never share these values\nDEMO_WORKFLOW_ID=${created.id}\nDEMO_MYSQL_CREDENTIAL_ID=${db.id}\nDEMO_WEBHOOK_KEY=${key}\nDEMO_ID_SECRET=${randomBytes(32).toString('base64url')}\n`);
  writeFileSync(new URL('../workflows/ticket-intake-demo.json',import.meta.url),JSON.stringify(portable(await api('/workflows/'+created.id)),null,2)+'\n');
  const after=await Promise.all(protectedIds.map(id=>api('/workflows/'+id)));
  assert.deepEqual(after,before);assert.equal(originalDataHash(),dataHash);
  console.log(`PASS isolated DEMO created inactive: ${created.id}; 18 reused nodes; protected workflows/data unchanged.`);
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const action=process.argv[2];
  try {if(action==='provision')await provision();else if(action==='activate')await setActive(true);else if(action==='deactivate')await setActive(false);else if(action==='activate-lookup')await setLookupActive(true);else if(action==='deactivate-lookup')await setLookupActive(false);else throw Error('Use activate, deactivate, activate-lookup, or deactivate-lookup; provision is first-time-only');}
  catch(e){console.error('FAIL '+(e.message||'Local management failure'));process.exitCode=1;}
}
