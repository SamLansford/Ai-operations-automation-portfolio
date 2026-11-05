// Isolated saved-code tests; no workflow executions or model requests.
// Run from any directory: node <path-to-this-file>
// Reads N8N_API_URL/N8N_API_KEY from the repository .env or process environment.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Script } from 'node:vm';

const workflowId = 'u0tVpaiOEqBLShlS';
const workflowName = 'Portfolio 1 - AI Support Ticket Intake - DEV';
const settings = {};
try {
  const text = await readFile(new URL('../../.env', import.meta.url), 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?(N8N_API_URL|N8N_API_KEY)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const value = match[2];
    settings[match[1]] = /^(['"]).*\1$/.test(value)
      ? value.slice(1, -1)
      : value.replace(/\s+#.*$/, '').trim();
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw new Error('Cannot read repository API settings.');
}
const apiKey = process.env.N8N_API_KEY || settings.N8N_API_KEY;
let base;
try {
  base = new URL(process.env.N8N_API_URL || settings.N8N_API_URL);
} catch {
  throw new Error('N8N_API_URL must be a valid local URL.');
}
assert.ok(apiKey, 'N8N_API_KEY is required.');
assert.ok(['http:', 'https:'].includes(base.protocol), 'Expected HTTP(S).');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'Expected local n8n.');
assert.ok(!base.username && !base.password && !base.search && !base.hash,
  'API URL must not contain embedded credentials, query parameters, or fragments.');
base.pathname = base.pathname.replace(/\/$/, '') || '/api/v1';

async function get(path) {
  let response;
  try {
    response = await fetch(`${base.href.replace(/\/$/, '')}${path}`, {
      method: 'GET',
      headers: { 'X-N8N-API-KEY': apiKey, Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error('Read-only local API request failed; transport details withheld.');
  }
  if (!response.ok) throw new Error(`Read-only local API returned HTTP ${response.status}.`);
  try { return await response.json(); }
  catch { throw new Error('Local API returned an invalid JSON response.'); }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

async function snapshotWorkflows() {
  const workflows = [];
  let cursor;
  do {
    const page = await get(`/workflows?limit=250${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    assert.ok(Array.isArray(page.data), 'Expected workflow definitions from API.');
    workflows.push(...page.data);
    cursor = page.nextCursor;
  } while (cursor);
  // Compare every visible definition and activation state without logging its contents.
  const definitions = workflows.map(workflow => Object.fromEntries([
    'id', 'name', 'active', 'versionId', 'nodes', 'connections', 'settings', 'pinData', 'staticData',
  ].map(key => [key, workflow[key]]))).sort((a, b) => a.id.localeCompare(b.id));
  return {
    count: workflows.length,
    digest: createHash('sha256').update(JSON.stringify(canonical(definitions))).digest('hex'),
  };
}

const ticket = {
  ticketId: 'TICKET-LOGIC-001',
  customerEmail: 'customer@example.com',
  message: 'Synthetic ticket for isolated validator tests.',
  isValid: true,
  errors: [],
  status: 'VALIDATED',
};
const cases = [
  ['Malformed JSON', { content: '{RAW_MALFORMED_OUTPUT' }],
  ['JSON null', { content: 'null' }],
  ['Actual null', { content: null }],
  ['JSON array', { content: '[{"category":"SHIPPING","reason":"Array must be rejected"}]' }],
  ['Actual array', { content: [{ category: 'SHIPPING', reason: 'Array must be rejected' }] }],
  ['Unsupported category', { content: '{"category":"ESCALATION","reason":"Unsupported value"}' }],
  ['Empty reason', { content: '{"category":"SHIPPING","reason":""}' }],
  ['Whitespace-only reason', { content: '{"category":"SHIPPING","reason":" \\t\\n "}' }],
  ['Synthetic connection refusal', { error: 'connect ECONNREFUSED; INTERNAL_FIXTURE_DETAIL' }, true],
  ['Synthetic timeout', { error: 'ETIMEDOUT; INTERNAL_FIXTURE_DETAIL' }, true],
];

async function main() {
  const before = await snapshotWorkflows();
  let passed = 0;
  try {
    const workflow = await get(`/workflows/${workflowId}`);
    assert.equal(workflow.name, workflowName, 'DEV workflow identity mismatch.');
    const find = name => {
      const matches = workflow.nodes.filter(node => node.name === name);
      assert.equal(matches.length, 1, `Expected exactly one ${name} node.`);
      return matches[0];
    };
    const validator = find('Validate AI Result');
    const responder = find('Respond to Webhook');
    assert.equal(validator.type, 'n8n-nodes-base.code');
    assert.equal(validator.parameters.mode, 'runOnceForEachItem');
    assert.equal(responder.type, 'n8n-nodes-base.respondToWebhook');
    assert.equal(typeof validator.parameters.jsCode, 'string');
    const expression = responder.parameters.options.responseCode.match(/^=\s*\{\{([\s\S]*)\}\}\s*$/);
    assert.ok(expression, 'Expected a saved JavaScript response-status expression.');
    const validate = new Script(`(function () {\n${validator.parameters.jsCode}\n})()`,
      { filename: 'saved-Validate-AI-Result.js' });
    const responseStatus = new Script(`(${expression[1]})`,
      { filename: 'saved-Respond-to-Webhook-status.js' });

    console.log('ISOLATED LOGIC TESTS — saved DEV code; no n8n execution or real HTTP responses.');
    for (const [name, input, unavailable = false] of cases) {
      try {
        const fixtureTicket = structuredClone(ticket);
        const fixtureInput = structuredClone(input);
        const result = validate.runInNewContext({
          $input: { item: { json: fixtureInput } },
          $: nodeName => {
            assert.equal(nodeName, 'Validate Ticket', 'Unexpected node lookup.');
            return { item: { json: fixtureTicket } };
          },
        }, { timeout: 1000 });
        // Normalize VM objects to the host realm before comparing complete output.
        const output = JSON.parse(JSON.stringify(result));
        const expectedStatus = unavailable ? 503 : 200;
        assert.deepEqual(output, { json: {
          ...ticket,
          classification: {
            category: 'UNKNOWN', reason: '', isValid: false, requiresReview: true,
            errorCode: unavailable ? 'AI_UNAVAILABLE' : 'INVALID_AI_OUTPUT',
          },
          httpStatus: expectedStatus,
          processingStatus: unavailable ? 'AI_UNAVAILABLE' : 'CLASSIFICATION_REVIEW_REQUIRED',
        } }, 'Output must match the safe contract with all ticket fields and no raw input/errors.');
        assert.equal(responseStatus.runInNewContext({ $json: output.json }, { timeout: 1000 }),
          expectedStatus, 'Saved response-status expression returned an unexpected status.');
        assert.deepEqual(fixtureTicket, ticket, 'Ticket fixture was mutated.');
        assert.deepEqual(fixtureInput, input, 'AI fixture was mutated.');
        passed++;
        console.log(`PASS — ${name}; intended HTTP ${expectedStatus}; saved status expression verified.`);
      } catch (error) {
        process.exitCode = 1;
        console.error(`FAIL — ${name}: ${error.message}`);
      }
    }
    console.log(`RESULT — ${passed}/${cases.length} cases passed.`);
  } finally {
    const after = await snapshotWorkflows();
    if (before.count !== after.count || before.digest !== after.digest) {
      process.exitCode = 1;
      console.error('FAIL — Workflow inventory, definitions, or activation states changed during the run.');
    } else {
      console.log(`PASS — All ${after.count} API-visible workflow definitions and activation states unchanged.`);
    }
  }
}

main().catch(error => {
  process.exitCode = 1;
  console.error(`FAIL — ${error.message}`);
});
