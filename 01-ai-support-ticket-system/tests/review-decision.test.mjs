// Isolated exact-code tests. No services, credentials, workflow execution, or writes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { code, validateDecision, resolveDecision, patchIntake } from './review-workflow.mjs';

let count = 0;
function check(name, fn) { fn(); count++; console.log(`PASS ${name}`); }
const body = { ticketId: 'REVIEW-UNIT-001', decisionId: 'd1', decision: 'APPROVE', category: 'BILLING', reason: 'Duplicate charge' };
const run = (fn, json, input) => JSON.parse(JSON.stringify(new Script(`(function(){${code(fn)}})()`).runInNewContext({
  $input: { item: { json }, all: () => (Array.isArray(json) ? json : [json]).map(json => ({ json })) }, $execution: { id: 'unit-execution' },
  $: () => ({ item: { json: input }, all: () => [{ json: input }] }),
}))).json;
const validate = b => run(validateDecision, { body: b });
check('approval and fixed server identity', () => {
  const v = validate(body); assert.equal(v.valid, true); assert.equal(v.reviewerId, 'portfolio-dev-reviewer-1');
});
check('rejection', () => { const b = { ...body, decision: 'REJECT' }; delete b.category; assert.equal(validate(b).newStatus, 'REJECTED'); });
for (const [name, changes] of [
  ['identity spoof', { reviewerId: 'admin' }], ['unknown field', { extra: true }],
  ['invalid category', { category: 'UNKNOWN' }], ['empty reason', { reason: ' ' }],
  ['long reason', { reason: 'x'.repeat(501) }], ['long id', { ticketId: 'x'.repeat(129) }],
  ['invalid decision', { decision: 'approve' }], ['invalid request id', { decisionId: "x';--" }],
  ['reject with category', { decision: 'REJECT' }],
]) check(name, () => assert.equal(validate({ ...body, ...changes }).httpStatus, 400));
for (const b of [null, [], 'text']) check(`invalid body ${JSON.stringify(b)}`, () => assert.equal(validate(b).httpStatus, 400));
check('Unicode field limits', () => assert.equal(validate({ ...body, reason: '😀'.repeat(500) }).valid, true));
check('numeric-looking id preserved', () => assert.equal(validate({ ...body, ticketId: '000123' }).ticketId, '000123'));
const prepared = validate(body);
const row = { ticket_id: body.ticketId, processing_status: 'APPROVED', new_status: 'APPROVED',
  reviewer_id: prepared.reviewerId, event_type: 'HUMAN_REVIEW_DECIDED',
  details: { decisionId: body.decisionId, decision: body.decision, category: body.category, reason: body.reason },
  updated_rows: 1, audit_rows: 1 };
check('committed decision', () => assert.equal(run(resolveDecision, row, prepared).replayed, false));
check('MySQL statement metadata emits one decision', () => assert.equal(run(resolveDecision, [{ affectedRows: 1 }, row], prepared).httpStatus, 200));
check('multiple final rows fail closed', () => assert.equal(run(resolveDecision, [row, row], prepared).httpStatus, 503));
check('identical replay', () => assert.equal(run(resolveDecision, { ...row, updated_rows: 0, audit_rows: 0 }, prepared).replayed, true));
check('conflicting content', () => assert.equal(run(resolveDecision, row, { ...prepared, reason: 'changed' }).httpStatus, 409));
check('competing reviewer', () => assert.equal(run(resolveDecision, row, { ...prepared, reviewerId: 'other' }).httpStatus, 409));
check('missing ticket', () => assert.equal(run(resolveDecision, { updated_rows: 0, audit_rows: 0, ticket_id: null }, prepared).httpStatus, 404));
check('mismatched write counts', () => assert.equal(run(resolveDecision, { ...row, audit_rows: 0 }, prepared).httpStatus, 503));
check('SQL error sanitized', () => assert.deepEqual(run(resolveDecision, { error: 'private driver detail' }, prepared), { httpStatus: 503, errorCode: 'REVIEW_UNAVAILABLE' }));
const intake = JSON.parse(readFileSync(new URL('../workflows/ticket-intake-dev.json', import.meta.url)));
const patched = patchIntake(intake);
check('only one intake node changes', () => assert.deepEqual(patched.nodes.filter(n => n.name !== 'Prepare Public Response'), intake.nodes.filter(n => n.name !== 'Prepare Public Response')));
check('patch idempotent', () => assert.deepEqual(patchIntake(patched), patched));
const responseCode = patched.nodes.find(n => n.name === 'Prepare Public Response').parameters.jsCode;
for (const status of ['APPROVED', 'REJECTED', 'AUTO_ROUTED', 'PENDING_REVIEW', 'PROCESSING', 'FAILED']) {
  check(`intake ${status} replay`, () => {
    const r = new Script(`(function(){${responseCode}})()`).runInNewContext({ $input: { item: { json: { resultKind: 'REPLAY', row: {
      ticket_id: body.ticketId, customer_email: 'synthetic@example.com', customer_message: 'Synthetic test',
      processing_status: status, classification_category: 'BILLING', classification_reason: 'Reason',
    } } } }, $: () => ({ item: { json: {} } }) }).json;
    assert.equal(r.httpStatus, ['PROCESSING', 'PENDING_REVIEW'].includes(status) ? 202 : status === 'FAILED' ? 503 : 200);
    assert.equal(r.ticketId, body.ticketId);
  });
}
console.log(`PASS ${count}/${count} isolated tests; no workflow executions`);
