// Complete DEV webhook tests. Uses synthetic records, never deletes data.
// Run: node <this-file> [--smoke]
// Temporarily publishes DEV and always attempts to unpublish it afterward.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

export const DEV_ID = 'u0tVpaiOEqBLShlS';
export const ORIGINAL_ID = '0G0j4x3GtVpRCAPa';
const env = {};
for (const line of (await readFile(new URL('../../.env', import.meta.url), 'utf8')).split(/\r?\n/)) {
  const match = line.match(/^\s*(N8N_API_URL|N8N_API_KEY)\s*=\s*(.*?)\s*$/);
  if (match) env[match[1]] = /^(['"]).*\1$/.test(match[2]) ? match[2].slice(1, -1) : match[2];
}
const base = new URL(process.env.N8N_API_URL || env.N8N_API_URL);
assert.ok(['localhost', '127.0.0.1'].includes(base.hostname), 'Only local n8n is permitted.');
assert.ok(!base.username && !base.password && !base.search && !base.hash);
base.pathname = base.pathname.replace(/\/$/, '') || '/api/v1';
const apiKey = process.env.N8N_API_KEY || env.N8N_API_KEY;
assert.ok(apiKey, 'Local API key is required.');

export async function api(path, method = 'GET', body) {
  let response;
  try {
    response = await fetch(base.href.replace(/\/$/, '') + path, {
      method, headers: { 'X-N8N-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error', signal: AbortSignal.timeout(30_000),
    });
  } catch { throw new Error(`Local API ${method} request failed; transport details withheld.`); }
  if (!response.ok) throw new Error(`Local API ${method} ${path} returned HTTP ${response.status}.`);
  return response.status === 204 ? null : response.json();
}
export const readDev = () => api(`/workflows/${DEV_ID}`);
export const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const stable = value => JSON.stringify(canonical(value));
export function definition(workflow) {
  return { name: workflow.name, nodes: workflow.nodes, connections: workflow.connections, settings: workflow.settings };
}
export async function saveDev(workflow, expectedVersion) {
  const current = await readDev();
  assert.equal(current.active, false, 'DEV must be inactive before editing.');
  if (expectedVersion) assert.equal(current.versionId, expectedVersion, 'DEV changed since inspection; refusing overwrite.');
  await api(`/workflows/${DEV_ID}?publishIfActive=false`, 'PUT', definition(workflow));
  const saved = await readDev();
  assert.equal(saved.active, false);
  assert.equal(stable(definition(saved)), stable(definition(workflow)), 'Saved definition differs.');
  return saved;
}
export async function deactivate() {
  if ((await readDev()).active) await api(`/workflows/${DEV_ID}/unpublish`, 'POST', {});
  assert.equal((await readDev()).active, false, 'DEV cleanup failed.');
}
export async function activate() {
  assert.equal((await readDev()).active, false);
  await api(`/workflows/${DEV_ID}/publish`, 'POST', {});
  assert.equal((await readDev()).active, true);
  // Publication registers the production webhook asynchronously.
  await delay(500);
}
async function executionIds() {
  return new Set((await api(`/executions?workflowId=${DEV_ID}&limit=100`)).data.map(e => e.id));
}
export async function sendTickets(tickets) {
  const before = await executionIds();
  const replies = await Promise.all(tickets.map(async ticket => {
    let response;
    try {
      response = await fetch(`${base.origin}/webhook/support-ticket-intake-dev`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ticket), redirect: 'error', signal: AbortSignal.timeout(180_000),
      });
    } catch { throw new Error('Single ticket POST failed; no request retry performed.'); }
    let body;
    try { body = await response.json(); } catch { throw new Error('Webhook returned non-JSON.'); }
    assert.ok([200, 202, 400, 409, 503].includes(response.status),
      `Production webhook returned unexpected HTTP ${response.status}; no request retry performed.`);
    const text = JSON.stringify(body);
    assert.ok(!/fingerprintInput|payloadFingerprint|sqlMessage|stackTrace|sqlState|execution_id|executionId/.test(text),
      'Public response exposes internal fields.');
    assert.ok(!text.includes(apiKey), 'Public response exposes the API key.');
    return { ticket, status: response.status, body };
  }));
  let details = [];
  // Poll saved execution metadata only; never repeat a ticket request.
  for (let attempt = 0; attempt < 6; attempt++) {
    const recent = (await api(`/executions?workflowId=${DEV_ID}&limit=100`)).data.filter(e => !before.has(e.id));
    details = await Promise.all(recent.map(e => api(`/executions/${e.id}?includeData=true`)));
    details = details.filter(e => tickets.some(t => e.data?.resultData?.runData?.['Validate Ticket']?.[0]?.data?.main?.[0]?.[0]?.json?.ticketId === t.ticketId));
    if (details.length === tickets.length && details.every(e => e.finished || ['success', 'error'].includes(e.status))) break;
    await delay(250);
  }
  assert.equal(details.length, tickets.length, 'Missing or extra saved DEV execution.');
  for (const result of replies) {
    const index = details.findIndex(e => {
      const run = e.data.resultData.runData;
      const input = run['Validate Ticket'][0].data.main[0][0].json;
      const output = run['Respond to Webhook']?.[0]?.data?.main?.[0]?.[0]?.json;
      return input.ticketId === result.ticket.ticketId
        && input.message === result.ticket.message.trim()
        && (!output || stable(output) === stable(result.body));
    });
    assert.ok(index >= 0);
    result.execution = details.splice(index, 1)[0];
    result.run = result.execution.data.resultData.runData;
    assert.equal(result.execution.mode, 'webhook');
    assert.equal(result.execution.workflowId, DEV_ID);
    assert.equal(result.execution.status, 'success', `Execution ${result.execution.id} failed; inspect its failing node privately.`);
    assert.equal(result.run['Respond to Webhook']?.length, 1, 'Expected exactly one response-node run.');
  }
  return replies;
}
export function rows(result, node) {
  return (result.run[node] || []).flatMap(run => run.data?.main?.[0] || []).map(item => item.json);
}
function ticket(id, message = 'I was charged twice for the same order. Please investigate the duplicate charge.') {
  return { ticketId: id, customerEmail: 'customer@example.com', message };
}
function fieldsPreserved(result) {
  for (const key of ['ticketId', 'customerEmail', 'message']) assert.equal(result.body[key], result.ticket[key]);
}
function assertNew(result) {
  assert.equal(result.status, 200);
  assert.equal(result.body.classification?.category, 'BILLING');
  assert.equal(result.body.classification?.isValid, true);
  fieldsPreserved(result);
  assert.equal(result.run['Classify Ticket']?.length, 1);
  assert.equal(rows(result, 'Interpret Claim Result')[0]?.claimOutcome, 'NEW', 'MySQL claim must happen before AI.');
  const saved = rows(result, 'Save Ticket Outcome')[0];
  assert.equal(Number(saved?.updated_rows), 1, 'Final ticket update must affect exactly one row.');
  assert.equal(Number(saved?.audit_rows), 1, 'Final audit insertion must affect exactly one row.');
  assert.equal(saved?.processing_status, 'AUTO_ROUTED');
  assert.equal(saved?.classification_category, 'BILLING');
  const claim = rows(result, 'Claim Ticket')[0];
  assert.equal(Number(claim?.claim_audit_rows), 1, 'Initial audit event must be inserted.');
}
function assertReplay(result, expected) {
  assert.equal(result.status, expected.status);
  assert.deepEqual(result.body, expected.body);
  assert.ok(!result.run['Classify Ticket'], 'Replay must not call Ollama.');
  assert.ok(!result.run['Save Ticket Outcome'], 'Replay must not insert outcome audit events.');
  assert.equal(Number(rows(result, 'Claim Ticket')[0]?.claim_audit_rows), 0, 'Replay must not insert a creation event.');
}

async function main() {
  const original = await api(`/workflows/${ORIGINAL_ID}`);
  const baseline = await readDev();
  assert.equal(baseline.name, 'Portfolio 1 - AI Support Ticket Intake - DEV');
  assert.equal(baseline.active, false);
  const prefix = `PORTFOLIO-QA-${Date.now()}`;
  const results = [];
  const record = (name, runs) => {
    results.push({ name, executions: runs.map(r => r.execution.id), statuses: runs.map(r => r.status) });
    console.log(`PASS ${name}: ${JSON.stringify(results.at(-1))}`);
  };
  try {
    await activate();
    const firstTicket = ticket(`${prefix}-NEW`);
    const [first] = await sendTickets([firstTicket]);
    assertNew(first);
    record('new ticket, classification and both audit writes', [first]);
    if (!process.argv.includes('--smoke')) {
      const [replay] = await sendTickets([firstTicket]);
      assertReplay(replay, first);
      record('identical retry', [replay]);
      const [conflict] = await sendTickets([{ ...firstTicket, message: 'Different content for the same ticket ID.' }]);
      assert.equal(conflict.status, 409);
      assert.ok(!conflict.run['Classify Ticket']);
      assert.ok(!conflict.run['Save Ticket Outcome']);
      const [unchanged] = await sendTickets([firstTicket]);
      assertReplay(unchanged, first);
      record('conflicting payload and original result preserved', [conflict, unchanged]);
      const [invalid] = await sendTickets([{ ticketId: `${prefix}-INVALID`, customerEmail: 'invalid-email', message: '' }]);
      assert.equal(invalid.status, 400);
      assert.deepEqual(invalid.body.errors, ['Invalid customer email', 'Invalid ticket message']);
      assert.ok(!invalid.run['Claim Ticket']);
      assert.ok(!invalid.run['Classify Ticket']);
      record('invalid input bypasses database and AI', [invalid]);
      const simultaneous = ticket(`${prefix}-CONCURRENT`);
      const pair = await sendTickets([simultaneous, simultaneous]);
      assert.equal(pair.filter(r => r.run['Classify Ticket']).length, 1);
      assert.equal(pair.filter(r => r.status === 200).length >= 1, true);
      assert.ok(pair.every(r => [200, 202].includes(r.status)));
      const [settled] = await sendTickets([simultaneous]);
      assert.equal(settled.status, 200);
      assert.ok(!settled.run['Classify Ticket']);
      const createdRows = pair.flatMap(r => rows(r, 'Claim Ticket'));
      assert.equal(createdRows.filter(r => r.claim_outcome === 'NEW').length, 1);
      assert.equal(createdRows.reduce((sum, r) => sum + Number(r.claim_audit_rows), 0), 1);
      record('concurrent identical requests and settled replay', [...pair, settled]);
      const raceA = ticket(`${prefix}-CONFLICT-RACE`);
      const raceB = { ...raceA, message: 'Please refund my purchase and return my money.' };
      const race = await sendTickets([raceA, raceB]);
      assert.equal(race.filter(r => r.status === 409).length, 1);
      assert.equal(race.filter(r => r.run['Classify Ticket']).length, 1);
      record('concurrent conflicting requests', race);
    }
  } finally {
    await deactivate();
    assert.equal(stable(await api(`/workflows/${ORIGINAL_ID}`)), stable(original), 'ORIGINAL changed.');
    assert.equal(stable(definition(await readDev())), stable(definition(baseline)), 'DEV definition changed during normal tests.');
    console.log('PASS cleanup: DEV inactive; ORIGINAL and DEV definitions unchanged.');
  }
  console.log(`RESULT ${results.length} verified integration scenarios passed. Synthetic data retained; no records deleted.`);
}

// Explicit fault-test mode temporarily substitutes DEV nodes, then restores them.
// It never stops dependencies, changes credentials/grants, or creates another workflow.
async function faultTests() {
  const baseline = await readDev();
  const original = await api(`/workflows/${ORIGINAL_ID}`);
  assert.equal(baseline.active, false);
  const stamp = Date.now();
  const prefix = `PORTFOLIO-FAULT-${stamp}`;
  let scenarios = 0;
  async function install(edit) {
    await deactivate();
    const changed = structuredClone(baseline);
    edit(changed);
    await saveDev(changed, (await readDev()).versionId);
    await activate();
  }
  async function restore() {
    await deactivate();
    await saveDev(baseline, (await readDev()).versionId);
  }
  function fakeModel(workflow, value) {
    const n = workflow.nodes.find(n => n.name === 'Classify Ticket');
    n.type = 'n8n-nodes-base.code'; n.typeVersion = 2;
    n.parameters = { mode: 'runOnceForEachItem', jsCode: `return { json: ${JSON.stringify(value)} };` };
    delete n.credentials;
  }
  function report(name, results) {
    scenarios++;
    console.log(`PASS ${name}: ${JSON.stringify({ executions: results.map(r => r.execution.id), statuses: results.map(r => r.status) })}`);
  }
  try {
    if (!process.argv.includes('--edges')) {
    for (const [label, output] of [
      ['malformed AI output', { content: '{INVALID_MODEL_JSON' }],
      ['UNKNOWN AI category', { content: '{"category":"UNKNOWN","reason":"Human review needed"}' }],
    ]) {
      await install(w => fakeModel(w, output));
      const pendingTicket = ticket(`${prefix}-${label.startsWith('UNKNOWN') ? 'UNKNOWN' : 'MALFORMED'}`);
      const [pending] = await sendTickets([pendingTicket]);
      assert.equal(pending.status, 202);
      assert.equal(pending.body.status, 'PENDING_REVIEW');
      assert.equal(pending.body.classification.requiresReview, true);
      fieldsPreserved(pending);
      const saved = rows(pending, 'Save Ticket Outcome')[0];
      assert.equal(saved.processing_status, 'PENDING_REVIEW');
      assert.equal(saved.classification_category, 'UNKNOWN');
      assert.equal(Number(saved.requires_review), 1);
      assert.equal(Number(saved.updated_rows), 1);
      assert.equal(Number(saved.audit_rows), 1);
      await restore(); await activate();
      const [replay] = await sendTickets([pendingTicket]);
      assertReplay(replay, pending);
      report(`${label}: persisted review and replay`, [pending, replay]);
      await deactivate();
    }
    await install(w => fakeModel(w, { error: 'Synthetic model connection refusal: INTERNAL_FIXTURE_DETAIL' }));
    const unavailableTicket = ticket(`${prefix}-MODEL-FAILURE`);
    const [unavailable] = await sendTickets([unavailableTicket]);
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.body.errorCode, 'AI_UNAVAILABLE');
    assert.ok(!JSON.stringify(unavailable.body).includes('INTERNAL_FIXTURE_DETAIL'));
    const failedRow = rows(unavailable, 'Save Ticket Outcome')[0];
    assert.equal(failedRow.processing_status, 'FAILED');
    assert.equal(failedRow.review_reason, 'AI_UNAVAILABLE');
    assert.equal(Number(failedRow.updated_rows), 1);
    assert.equal(Number(failedRow.audit_rows), 1);
    await restore(); await activate();
    const [failedReplay] = await sendTickets([unavailableTicket]);
    assertReplay(failedReplay, unavailable);
    report('synthetic model failure: persisted FAILED state and replay', [unavailable, failedReplay]);
    await deactivate();

    await install(w => {
      const n = w.nodes.find(n => n.name === 'Claim Ticket');
      n.parameters.query = n.parameters.query.replace('INSERT INTO ai_support_portfolio.ticket_audit',
        "SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Synthetic claim transaction failure'; INSERT INTO ai_support_portfolio.ticket_audit");
    });
    const rollbackTicket = ticket(`${prefix}-CLAIM-ROLLBACK`);
    const [claimFailure] = await sendTickets([rollbackTicket]);
    assert.equal(claimFailure.status, 503);
    assert.ok(!claimFailure.run['Classify Ticket']);
    assert.ok(!claimFailure.run['Save Ticket Outcome']);
    await restore(); await activate();
    const [recovery] = await sendTickets([rollbackTicket]);
    assertNew(recovery); // NEW proves the failed claim did not leave a ticket behind.
    report('injected claim failure: rollback, no AI, later new claim', [claimFailure, recovery]);
    await deactivate();

    await install(w => {
      const n = w.nodes.find(n => n.name === 'Save Ticket Outcome');
      n.parameters.query = n.parameters.query.replace('INSERT INTO ai_support_portfolio.ticket_audit',
        "SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Synthetic finalization transaction failure'; INSERT INTO ai_support_portfolio.ticket_audit");
    });
    const interruptedTicket = ticket(`${prefix}-FINALIZE-ROLLBACK`);
    const [finalFailure] = await sendTickets([interruptedTicket]);
    assert.equal(finalFailure.status, 503);
    await restore(); await activate();
    const [processing] = await sendTickets([interruptedTicket]);
    assert.equal(processing.status, 202);
    assert.equal(processing.body.status, 'PROCESSING');
    assert.ok(!processing.run['Classify Ticket']);
    assert.equal(rows(processing, 'Read Existing Ticket')[0].processing_status, 'PROCESSING');
    report('injected finalization failure: rollback and safe PROCESSING replay', [finalFailure, processing]);
    await deactivate();

    await install(w => {
      const n = w.nodes.find(n => n.name === 'Fingerprint Ticket');
      n.type = 'n8n-nodes-base.code'; n.typeVersion = 2;
      n.parameters = { mode: 'runOnceForEachItem', jsCode: "return { json: { ...$input.item.json, payloadFingerprint: 'invalid' } };" };
    });
    const [badFingerprint] = await sendTickets([ticket(`${prefix}-INVALID-FINGERPRINT`)]);
    assert.equal(badFingerprint.status, 503);
    assert.ok(!badFingerprint.run['Claim Ticket']);
    assert.ok(!badFingerprint.run['Classify Ticket']);
    report('invalid fingerprint bypasses MySQL and AI', [badFingerprint]);
    }
    await restore(); await activate();
    const tooLong = ticket(`${prefix}-TOO-LONG`.padEnd(129, 'X'));
    const [lengthFailure] = await sendTickets([tooLong]);
    assert.equal(lengthFailure.status, 400);
    assert.ok(!lengthFailure.run['Claim Ticket']);
    assert.ok(!lengthFailure.run['Classify Ticket']);
    report('database field limit rejected before insertion', [lengthFailure]);

    const numericTicket = { ticketId: `00${stamp}`, customerEmail: 'customer@example.com', message: '000123' };
    const [numeric] = await sendTickets([numericTicket]);
    assert.equal(numeric.status, 200);
    fieldsPreserved(numeric);
    assert.equal(rows(numeric, 'Save Ticket Outcome')[0].ticket_id, numericTicket.ticketId);
    assert.equal(rows(numeric, 'Save Ticket Outcome')[0].customer_message, '000123');
    report('numeric-looking ticket ID and message preserved', [numeric]);
    const quotedTicket = ticket(`${prefix}-QUOTED`, "Please check the receipt marked O'Reilly; SELECT 'fixture-only'; -- and its delivery status.");
    const [quoted] = await sendTickets([quotedTicket]);
    assert.equal(quoted.status, 200);
    fieldsPreserved(quoted);
    assert.equal(rows(quoted, 'Save Ticket Outcome')[0].customer_message, quotedTicket.message);
    assert.equal(Number(rows(quoted, 'Save Ticket Outcome')[0].updated_rows), 1);
    assert.equal(Number(rows(quoted, 'Save Ticket Outcome')[0].audit_rows), 1);
    report('quotes and SQL-like punctuation stored as literal ticket data', [quoted]);
  } finally {
    await restore();
    assert.equal(stable(definition(await readDev())), stable(definition(baseline)));
    assert.equal(stable(await api(`/workflows/${ORIGINAL_ID}`)), stable(original));
    console.log('PASS fault cleanup: original DEV definition restored inactive; ORIGINAL unchanged.');
  }
  console.log(`RESULT ${scenarios} controlled fault/edge scenarios passed. These used DEV-only substitutions, not real service outages.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file:///${process.argv[1].replaceAll('\\', '/')}`))) {
  (process.argv.includes('--faults') || process.argv.includes('--edges') ? faultTests() : main())
    .catch(error => { process.exitCode = 1; console.error(`FAIL ${error.message}`); });
}
