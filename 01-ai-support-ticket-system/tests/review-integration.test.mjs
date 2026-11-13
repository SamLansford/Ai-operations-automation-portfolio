// Authorized local DEV integration tests. Retains synthetic MILESTONE-A-* records.
// --provision creates the permanent encrypted reviewer credential and inactive workflow.
// Later runs rotate ONLY the dedicated DEV reviewer credential while DEV is inactive.
// Never prints secrets, request headers, or raw execution data.
import assert from 'node:assert/strict';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { api, stable, definition, DEV_ID, ORIGINAL_ID, saveDev, sendTickets } from './persistence-integration.test.mjs';
import { buildReview, patchIntake, portable } from './review-workflow.mjs';

const provision = process.argv.includes('--provision');
const prefix = `MILESTONE-A-${Date.now()}`;
const dir = new URL('../workflows/', import.meta.url);
const exportPath = new URL('human-review-dev.json', dir);
const backupPath = new URL('ticket-intake-dev-before-review.json', dir);
const secret = randomBytes(32).toString('base64url');
const headerName = 'x-portfolio-review-key';
const envText = readFileSync(new URL('../../.env', import.meta.url), 'utf8');
const urlLine = envText.split(/\r?\n/).find(l => /^N8N_API_URL\s*=/.test(l));
const origin = new URL(urlLine.split('=').slice(1).join('=').trim().replace(/^(['"])(.*)\1$/, '$2')).origin;
const original = await api(`/workflows/${ORIGINAL_ID}`);
const legacy = await api('/workflows/IqMpoRI8EZcSuqrc');
const initialDev = await api(`/workflows/${DEV_ID}`);
assert.equal(initialDev.active, false);
const protectedPaths = ['ticket-intake-before-promotion.json', 'ticket-intake-dev-before-claim-20261104-223946.json', 'ticket-intake.json'];
const hashes = protectedPaths.map(p => createHash('sha256').update(readFileSync(new URL(p, dir))).digest('hex'));

function sql(query) {
  const r = spawnSync('docker', ['exec', '-i', 'mysql-ai-operations', 'sh', '-c',
    'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot --default-character-set=utf8mb4 --batch --raw --skip-column-names'],
  { input: query, encoding: 'utf8', timeout: 20000 });
  if (r.status !== 0) throw new Error('Project-scoped MySQL operation failed; driver details withheld.');
  return r.stdout.trim();
}
const lit = s => `CONVERT(0x${Buffer.from(s, 'utf8').toString('hex')} USING utf8mb4)`;
function seed(label, status = 'PENDING_REVIEW') {
  const ticket = { ticketId: `${prefix}-${label}`, customerEmail: 'synthetic@example.com', message: 'Synthetic DEV human-review fixture.' };
  const fingerprint = createHash('sha256').update(JSON.stringify([ticket.ticketId, ticket.customerEmail, ticket.message])).digest('hex');
  sql(`START TRANSACTION; INSERT INTO ai_support_portfolio.tickets
    (ticket_id,customer_email,customer_message,payload_fingerprint,execution_id,policy_version,
     classification_category,classification_reason,requires_review,review_reason,processing_status)
    VALUES (${lit(ticket.ticketId)},${lit(ticket.customerEmail)},${lit(ticket.message)},${lit(fingerprint)},
    ${lit(prefix)},'v1','UNKNOWN','',${status === 'PENDING_REVIEW' ? 1 : 0},'SYNTHETIC_DEV_FIXTURE',${lit(status)});
    INSERT INTO ai_support_portfolio.ticket_audit(ticket_id,event_key,event_type,new_status,execution_id,details)
    VALUES (${lit(ticket.ticketId)},'FINAL_OUTCOME:v1',${lit(status === 'PENDING_REVIEW' ? 'HUMAN_REVIEW_REQUESTED' : 'DEV_FIXTURE_CREATED')},${lit(status)},${lit(prefix)},
    JSON_OBJECT('synthetic',true,'fixtureRun',${lit(prefix)})); COMMIT;`);
  return ticket;
}
function evidence(ticket) {
  assert.ok(ticket.ticketId.startsWith(prefix));
  return sql(`SELECT processing_status,requires_review,classification_category,
    (SELECT COUNT(*) FROM ai_support_portfolio.ticket_audit a WHERE a.ticket_id=t.ticket_id AND event_key='HUMAN_REVIEW_DECISION:v1')
    FROM ai_support_portfolio.tickets t WHERE ticket_id=${lit(ticket.ticketId)};`);
}
function auditDetails(ticket) {
  assert.ok(ticket.ticketId.startsWith(prefix));
  return JSON.parse(sql(`SELECT JSON_OBJECT('execution',execution_id,'reviewer',reviewer_id,'previous',previous_status,'new',new_status,
    'details',details) FROM ai_support_portfolio.ticket_audit WHERE ticket_id=${lit(ticket.ticketId)} AND event_key='HUMAN_REVIEW_DECISION:v1';`));
}
let review, baseline, auth, compatibleDev;
let pass = 0;
const record = (name, result) => { pass++; console.log(`PASS ${name}${result ? ': ' + JSON.stringify(result) : ''}`); };
async function publish(id) { await api(`/workflows/${id}/publish`, 'POST', {}); await delay(500); }
async function unpublish(id) { if ((await api(`/workflows/${id}`)).active) await api(`/workflows/${id}/unpublish`, 'POST', {}); }
async function saveReview(w) { await unpublish(review.id); await api(`/workflows/${review.id}?publishIfActive=false`, 'PUT', definition(w)); }
async function send(body, mode = 'valid') {
  const response = await fetch(`${origin}/webhook/support-ticket-review-dev`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(mode === 'missing' ? {} : { [headerName]: mode === 'valid' ? secret : 'invalid-dev-test-token' }) },
    body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  assert.ok(!text.includes(secret));
  assert.ok(!/sqlMessage|sqlState|stackTrace|payload_fingerprint|reviewer_id/.test(text));
  let json; try { json = JSON.parse(text); } catch {}
  return { status: response.status, body: json };
}
const decision = (t, changes = {}) => ({ ticketId: t.ticketId, decisionId: 'decision-1', decision: 'APPROVE', category: 'BILLING', reason: 'Synthetic duplicate charge review', ...changes });
async function executions() { return (await api(`/executions?workflowId=${review.id}&limit=100`)).data; }
const executionStart = new Set();
try {
  if (provision) {
    assert.equal(existsSync(exportPath), false, 'Reviewer export already exists; use normal test mode.');
    if (!existsSync(backupPath)) writeFileSync(backupPath, JSON.stringify(portable(initialDev), null, 2) + '\n');
    // No schema changes. Only columns needed to resolve this ticket's durable decision.
    sql("GRANT SELECT (ticket_id,event_key,event_type,new_status,reviewer_id,details) ON ai_support_portfolio.ticket_audit TO 'n8n_support_portfolio'@'172.17.0.1';");
    record('narrow audit SELECT grant applied');
  }
  if (!provision) {
    const list = await api('/workflows?limit=250');
    const found = list.data.filter(w => w.name === 'Portfolio 1 - Human Review Decisions - DEV');
    assert.equal(found.length, 1);
    review = await api(`/workflows/${found[0].id}`); assert.equal(review.active, false);
    baseline = structuredClone(review); compatibleDev = initialDev;
    auth = baseline.nodes.find(n => n.name === 'Authenticated Review Webhook').credentials.httpHeaderAuth;
  } else auth = { id: randomUUID(), name: 'Portfolio 1 - DEV Reviewer 1' };
  if (baseline) {
    assert.equal(baseline.settings.saveDataSuccessExecution, 'none', 'Authenticated execution data must not be retained');
    assert.equal(baseline.settings.saveDataErrorExecution, 'none');
    assert.equal(baseline.settings.saveExecutionProgress, false);
  }
  // Supported CLI fallback: current API key cannot create credentials (HTTP403).
  // The secret enters through stdin, exists briefly in a mode-600 /tmp file, and is
  // encrypted by n8n on import. A trap removes the file on success or failure.
  const credential = { ...auth, type: 'httpHeaderAuth', data: { name: headerName, value: secret } };
  const projectId = initialDev.shared.find(s => s.role === 'workflow:owner').projectId;
  assert.match(projectId, /^[A-Za-z0-9_-]+$/);
  const imported = spawnSync('docker', ['exec', '-i', 'n8n', 'sh', '-c',
    `umask 077; f=$(mktemp /tmp/portfolio-review-XXXXXX); trap 'rm -f "$f"' EXIT; cat > "$f"; n8n import:credentials --input="$f" --projectId=${projectId}`],
  { input: JSON.stringify([credential]), encoding: 'utf8', timeout: 30000 });
  if (imported.status !== 0 || !/Successfully imported 1 credential/.test(imported.stdout)) throw new Error('Secure credential import failed; output withheld.');
  record('dedicated credential securely imported; no secret output');
  const authRef = { id: auth.id, name: auth.name };
  if (provision) {
    const mysql = initialDev.nodes.find(n => n.name === 'Save Ticket Outcome').credentials.mySql;
    review = await api('/workflows', 'POST', buildReview(mysql, authRef, initialDev));
    assert.equal(review.active, false);
    console.log(`PASS created inactive reviewer workflow: ${review.id}`);
    compatibleDev = await saveDev(patchIntake(initialDev), initialDev.versionId);
    baseline = await api(`/workflows/${review.id}`);
    writeFileSync(exportPath, JSON.stringify(portable(baseline), null, 2) + '\n');
    writeFileSync(new URL('ticket-intake-dev.json', dir), JSON.stringify(portable(compatibleDev), null, 2) + '\n');
  }
  for (const e of await executions()) executionStart.add(e.id);
  await publish(review.id);
  const approved = seed('APPROVE');
  const beforeAuth = new Set((await executions()).map(e => e.id));
  for (const mode of ['missing', 'invalid']) {
    const r = await send(decision(approved), mode); assert.equal(r.status, 403);
    record(`${mode} authentication blocked`, { http: r.status });
  }
  assert.equal((await executions()).filter(e => !beforeAuth.has(e.id)).length, 0);
  assert.equal(evidence(approved), 'PENDING_REVIEW\t1\tUNKNOWN\t0');
  record('authentication denied; synthetic ticket and audit unchanged');
  let r = await send({ ...decision(approved), reviewerId: 'spoofed-admin' }); assert.equal(r.status, 400);
  record('client reviewer identity rejected', { http: r.status });
  for (const changes of [{ category: 'UNKNOWN' }, { reason: '' }, { decision: 'REJECT' }]) {
    r = await send(decision(approved, changes)); assert.equal(r.status, 400);
  }
  record('invalid category, reason and rejection payload blocked', { http: 400 });
  r = await send(decision(approved)); assert.equal(r.status, 200); assert.equal(r.body.replayed, false);
  assert.equal(evidence(approved), 'APPROVED\t0\tBILLING\t1');
  const audit = auditDetails(approved); assert.equal(audit.reviewer, 'portfolio-dev-reviewer-1');
  assert.equal(audit.previous, 'PENDING_REVIEW'); assert.equal(audit.new, 'APPROVED');
  assert.equal(audit.details.reason, decision(approved).reason);
  record('approval and durable authenticated audit', { http: r.status, execution: audit.execution });
  r = await send(decision(approved)); assert.equal(r.status, 200); assert.equal(r.body.replayed, true);
  assert.equal(evidence(approved), 'APPROVED\t0\tBILLING\t1');
  record('identical decision replay without duplicate audit', { http: r.status });
  for (const changes of [{ reason: 'Changed reason' }, { decisionId: 'different-request' }]) {
    r = await send(decision(approved, changes)); assert.equal(r.status, 409);
  }
  record('changed-content and competing request conflicts', { http: 409 });
  const rejected = seed('REJECT'); const reject = decision(rejected, { decision: 'REJECT', reason: "Synthetic rejection: 'quoted' 😀" }); delete reject.category;
  r = await send(reject); assert.equal(r.status, 200); assert.equal(evidence(rejected), 'REJECTED\t0\tUNKNOWN\t1');
  assert.equal(auditDetails(rejected).details.reason, reject.reason);
  r = await send(reject); assert.equal(r.status, 200); assert.equal(r.body.replayed, true);
  record('rejection, Unicode/quoted reason and replay', { http: 200, execution: auditDetails(rejected).execution });
  const quoted = seed('SQL-LITERAL');
  const literalReason = "Synthetic literal: '; SIGNAL SQLSTATE '45000'; -- 😀";
  r = await send(decision(quoted, { reason: literalReason })); assert.equal(r.status, 200);
  assert.equal(auditDetails(quoted).details.reason, literalReason);
  record('SQL-like text remains literal parameter data', { http: 200 });
  const concurrent = seed('CONCURRENT');
  const pair = await Promise.all([send(decision(concurrent)), send(decision(concurrent, { decisionId: 'competing', category: 'GENERAL' }))]);
  assert.deepEqual(pair.map(x => x.status).sort(), [200, 409]);
  assert.equal(evidence(concurrent).split('\t').at(-1), '1');
  record('concurrent competing decisions have one winner', { http: pair.map(x => x.status) });
  const identical = seed('IDENTICAL');
  const same = await Promise.all([send(decision(identical)), send(decision(identical))]);
  assert.deepEqual(same.map(x => x.status), [200, 200]);
  assert.deepEqual(same.map(x => x.body.replayed).sort(), [false, true]);
  assert.equal(evidence(identical), 'APPROVED\t0\tBILLING\t1');
  record('concurrent identical decisions commit once', { http: [200, 200] });
  const other = seed('NONPENDING', 'PROCESSING');
  r = await send(decision(other)); assert.equal(r.status, 409); assert.equal(evidence(other), 'PROCESSING\t0\tUNKNOWN\t0');
  r = await send(decision({ ticketId: `${prefix}-MISSING` })); assert.equal(r.status, 404);
  record('nonpending and missing tickets', { http: [409, 404] });
  // Rollback fault is confined to the DEV reviewer definition, never a service outage.
  const rollback = seed('ROLLBACK');
  const functional = await api(`/workflows/${review.id}`);
  const faulty = structuredClone(functional);
  const query = faulty.nodes.find(n => n.name === 'Commit Review Decision');
  query.parameters.query = query.parameters.query.replace("'HUMAN_REVIEW_DECIDED'", 'NULL');
  await saveReview(faulty); await publish(review.id);
  r = await send(decision(rollback)); assert.equal(r.status, 503);
  assert.equal(evidence(rollback), 'PENDING_REVIEW\t1\tUNKNOWN\t0');
  record('injected audit NOT NULL failure rolls back ticket and audit', { http: r.status });
  await saveReview(functional); await publish(review.id);
  r = await send(decision(rollback)); assert.equal(r.status, 200);
  assert.equal(evidence(rollback), 'APPROVED\t0\tBILLING\t1');
  record('same decision succeeds after rollback restoration', { http: r.status });
  await publish(DEV_ID);
  for (const t of [approved, rejected]) {
    const [replay] = await sendTickets([t]); assert.equal(replay.status, 200);
    assert.equal(replay.body.status, t === approved ? 'APPROVED' : 'REJECTED');
    assert.ok(!replay.run['Classify Ticket']); assert.ok(!replay.run['Save Ticket Outcome']);
    assert.equal(Number(replay.run['Claim Ticket'][0].data.main[0][0].json.claim_audit_rows), 0);
    for (const k of ['ticketId', 'customerEmail', 'message']) assert.equal(replay.body[k], t[k]);
    record(`intake ${replay.body.status} replay preserves fields and skips AI/outcome writes`, { http: replay.status, execution: replay.execution.id });
  }
  const [invalid] = await sendTickets([{ ticketId: `${prefix}-INVALID`, customerEmail: 'bad', message: '' }]);
  assert.equal(invalid.status, 400); assert.ok(!invalid.run['Claim Ticket']);
  record('intake invalid-input contract retained', { http: 400, execution: invalid.execution.id });
  await delay(500);
  const recent = (await executions()).filter(e => !executionStart.has(e.id));
  assert.equal(recent.length, 0, 'Authenticated execution history must not be saved');
  record('authenticated execution history disabled; no new saved reviewer executions');
} finally {
  await unpublish(DEV_ID);
  if (review) {
    await unpublish(review.id);
    if (baseline) {
      // baseline is the permanent functional definition, not the injected fault version.
      await api(`/workflows/${review.id}?publishIfActive=false`, 'PUT', definition(baseline));
      const final = await api(`/workflows/${review.id}`);
      assert.equal(stable(definition(final)), stable(definition(baseline)));
      writeFileSync(exportPath, JSON.stringify(portable(final), null, 2) + '\n');
    }
  }
  assert.equal(stable(await api(`/workflows/${ORIGINAL_ID}`)), stable(original), 'ORIGINAL changed');
  assert.equal(stable(await api('/workflows/IqMpoRI8EZcSuqrc')), stable(legacy), 'Legacy reviewer changed');
  protectedPaths.forEach((p, i) => assert.equal(createHash('sha256').update(readFileSync(new URL(p, dir))).digest('hex'), hashes[i]));
  assert.equal((await api(`/workflows/${DEV_ID}`)).active, false);
  if (compatibleDev) assert.equal(stable(definition(await api(`/workflows/${DEV_ID}`))), stable(definition(compatibleDev)));
  console.log('PASS cleanup: both DEV workflows inactive; ORIGINAL/legacy and historical backups unchanged.');
}
console.log(`RESULT ${pass} integration checks passed; synthetic prefix ${prefix}; reviewer ${review.id}.`);
