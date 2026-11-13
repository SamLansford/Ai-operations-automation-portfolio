// Shared workflow definition and exact-code fixtures. No network or database side effects.
import { randomUUID } from 'node:crypto';

export function validateDecision() {
  const body = $input.item.json.body;
  const fail = () => ({ json: { valid: false, httpStatus: 400, errorCode: 'INVALID_REVIEW_DECISION' } });
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail();
  const allowed = ['ticketId', 'decisionId', 'decision', 'category', 'reason'];
  if (Object.keys(body).some(key => !allowed.includes(key))) return fail();
  const bounded = (value, max) => typeof value === 'string' && value.trim().length > 0
    && Array.from(value.trim()).length <= max;
  if (!bounded(body.ticketId, 128) || !bounded(body.reason, 500)
      || typeof body.decisionId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(body.decisionId)
      || !['APPROVE', 'REJECT'].includes(body.decision)) return fail();
  const approve = body.decision === 'APPROVE';
  if (approve ? !['SHIPPING', 'REFUND', 'BILLING', 'GENERAL'].includes(body.category)
    : body.category !== undefined) return fail();
  return { json: { valid: true, ticketId: body.ticketId.trim(), decisionId: body.decisionId,
    decision: body.decision, category: approve ? body.category : 'UNKNOWN', reason: body.reason.trim(),
    reviewerId: 'portfolio-dev-reviewer-1', newStatus: approve ? 'APPROVED' : 'REJECTED',
    executionId: String($execution.id) } };
}

export function resolveDecision() {
  const failure = (httpStatus, errorCode) => ({ json: { httpStatus, errorCode } });
  // mysql2 can return statement metadata alongside the final SELECT, especially
  // when a bound reason contains quotes. Resolve the batch once, never per item.
  const results = $input.all().map(item => item.json);
  const finalRows = results.filter(row => Object.hasOwn(row, 'updated_rows'));
  const requests = $('Validate Review Decision').all();
  if (results.some(row => row.error) || finalRows.length !== 1 || requests.length !== 1) return failure(503, 'REVIEW_UNAVAILABLE');
  const row = finalRows[0];
  const input = requests[0].json;
  if (!row.ticket_id) return failure(404, 'TICKET_NOT_FOUND');
  const updated = Number(row.updated_rows), audited = Number(row.audit_rows);
  if (!((updated === 1 && audited === 1) || (updated === 0 && audited === 0))) {
    return failure(503, 'REVIEW_UNAVAILABLE');
  }
  let details;
  try { details = typeof row.details === 'string' ? JSON.parse(row.details) : row.details; } catch {}
  const same = row.reviewer_id === input.reviewerId && row.processing_status === input.newStatus
    && row.new_status === input.newStatus && row.event_type === 'HUMAN_REVIEW_DECIDED'
    && details?.decisionId === input.decisionId && details?.decision === input.decision
    && details?.category === input.category && details?.reason === input.reason;
  if (!same) return failure(409, 'REVIEW_CONFLICT');
  return { json: { httpStatus: 200, ticketId: row.ticket_id, status: input.newStatus,
    decisionId: input.decisionId, replayed: updated === 0 } };
}

export function persistenceFailure() {
  return { json: { httpStatus: 503, errorCode: 'REVIEW_UNAVAILABLE' } };
}

export const code = fn => `return (${fn.toString()})();`;
export const eventKey = 'HUMAN_REVIEW_DECISION:v1';
// One locked ticket is the serialization point. A duplicate terminal audit causes rollback,
// never a second decision. Each placeholder occurrence is unique for installed MySQL v2.5.
export const reviewSql = `
SET @portfolio_review_locked = NULL; SELECT ticket_id INTO @portfolio_review_locked FROM ai_support_portfolio.tickets WHERE ticket_id = SUBSTRING($1,2) FOR UPDATE;
UPDATE ai_support_portfolio.tickets SET processing_status = SUBSTRING($2,2),
 classification_category = SUBSTRING($3,2), classification_reason = SUBSTRING($4,2),
 requires_review = 0, review_reason = NULL
 WHERE ticket_id = SUBSTRING($5,2) AND processing_status = 'PENDING_REVIEW'
 AND requires_review = 1 AND NOT EXISTS
 (SELECT 1 FROM ai_support_portfolio.ticket_audit WHERE ticket_id = SUBSTRING($6,2)
 AND event_key = 'HUMAN_REVIEW_DECISION:v1');
SET @portfolio_review_updated = ROW_COUNT();
INSERT INTO ai_support_portfolio.ticket_audit
 (ticket_id,event_key,event_type,previous_status,new_status,reviewer_id,execution_id,details)
 SELECT ticket_id,'HUMAN_REVIEW_DECISION:v1','HUMAN_REVIEW_DECIDED','PENDING_REVIEW',
 processing_status,SUBSTRING($7,2),SUBSTRING($8,2),
 JSON_OBJECT('decisionId',SUBSTRING($9,2),'decision',SUBSTRING($10,2),
 'category',SUBSTRING($11,2),'reason',SUBSTRING($12,2))
 FROM ai_support_portfolio.tickets WHERE ticket_id = SUBSTRING($13,2) AND @portfolio_review_updated = 1;
SET @portfolio_review_audited = ROW_COUNT();
SELECT t.ticket_id,t.processing_status,a.event_type,a.new_status,a.reviewer_id,a.details,
 @portfolio_review_updated AS updated_rows,@portfolio_review_audited AS audit_rows
 FROM (SELECT 1 AS anchor) seed
 LEFT JOIN ai_support_portfolio.tickets t ON t.ticket_id = SUBSTRING($14,2)
 LEFT JOIN ai_support_portfolio.ticket_audit a ON a.ticket_id = t.ticket_id
 AND a.event_key = 'HUMAN_REVIEW_DECISION:v1';`.replace(/\s+/g, ' ').trim();
export const replacements = "={{ [$json.ticketId, $json.newStatus, $json.category, $json.reason, $json.ticketId, $json.ticketId, $json.reviewerId, $json.executionId, $json.decisionId, $json.decision, $json.category, $json.reason, $json.ticketId, $json.ticketId].map(value => { if (typeof value !== 'string') throw new Error('Invalid prepared SQL parameter'); return '~' + value; }) }}";

export function buildReview(mysqlCredential, authCredential, intake) {
  const node = (name, type, typeVersion, parameters, position) => ({ id: randomUUID(), name,
    type: `n8n-nodes-base.${type}`, typeVersion, parameters, position });
  const webhook = node('Authenticated Review Webhook', 'webhook', 2.2, {
    httpMethod: 'POST', path: 'support-ticket-review-dev', authentication: 'headerAuth',
    responseMode: 'responseNode', options: {} }, [0, 0]);
  webhook.webhookId = randomUUID();
  webhook.credentials = { httpHeaderAuth: authCredential };
  const validate = node('Validate Review Decision', 'code', 2,
    { mode: 'runOnceForEachItem', jsCode: code(validateDecision) }, [240, 0]);
  const branch = structuredClone(intake.nodes.find(n => n.name === 'Ticket Valid?'));
  branch.id = randomUUID(); branch.name = 'Review Decision Valid?'; branch.position = [480, 0];
  delete branch.onError;
  branch.parameters.conditions.conditions[0].leftValue = '={{ $json.valid }}';
  const sql = node('Commit Review Decision', 'mySql', 2.5, { operation: 'executeQuery',
    query: reviewSql, options: { queryBatching: 'transaction', queryReplacement: replacements } }, [720, -100]);
  sql.credentials = { mySql: mysqlCredential }; sql.retryOnFail = false; sql.onError = 'continueErrorOutput';
  const resolve = node('Resolve Review Decision', 'code', 2,
    { mode: 'runOnceForAllItems', jsCode: `return [(${resolveDecision.toString()})()];` }, [960, -100]);
  const fail = node('Prepare Review Error', 'code', 2,
    { mode: 'runOnceForEachItem', jsCode: code(persistenceFailure) }, [960, 160]);
  const respond = node('Respond to Review', 'respondToWebhook', 1.5,
    { respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}',
      options: { responseCode: '={{ $json.httpStatus }}' } }, [1200, 0]);
  const connections = {};
  const connect = (from, outputs) => { connections[from] = { main: outputs.map(names => names.map(name => ({ node: name, type: 'main', index: 0 }))) }; };
  connect(webhook.name, [[validate.name]]); connect(validate.name, [[branch.name]]);
  connect(branch.name, [[sql.name], [respond.name]]); connect(sql.name, [[resolve.name], [fail.name]]);
  connect(resolve.name, [[respond.name]]); connect(fail.name, [[respond.name]]);
  return { name: 'Portfolio 1 - Human Review Decisions - DEV', nodes: [webhook, validate, branch, sql, resolve, fail, respond],
    // This installed Webhook version passes raw headers into node output. Keep
    // authenticated payloads out of n8n history; MySQL remains the durable audit.
    connections, settings: { executionOrder: 'v1', saveDataSuccessExecution: 'none',
      saveDataErrorExecution: 'none', saveManualExecutions: false,
      saveExecutionProgress: false, executionTimeout: 60 } };
}

export function patchIntake(workflow) {
  const changed = structuredClone(workflow);
  const node = changed.nodes.find(n => n.name === 'Prepare Public Response');
  const marker = "  if (row.processing_status !== 'AUTO_ROUTED'";
  if (node.parameters.jsCode.includes("row.processing_status === 'APPROVED'")) return changed;
  if (!node.parameters.jsCode.includes(marker)) throw new Error('Unexpected intake response code');
  node.parameters.jsCode = node.parameters.jsCode.replace(marker, `  if (row.processing_status === 'REJECTED') {
    return { json: { ...fields, isValid: true, errors: [], status: 'REJECTED',
      processingStatus: 'REJECTED', httpStatus: 200 } };
  }
  if (row.processing_status === 'APPROVED') {
    if (!['SHIPPING','REFUND','BILLING','GENERAL'].includes(row.classification_category)
        || typeof row.classification_reason !== 'string' || !row.classification_reason.trim()) return failure();
    return { json: { ...fields, isValid: true, errors: [], status: 'APPROVED',
      classification: { category: row.classification_category, reason: row.classification_reason,
        isValid: true, requiresReview: false }, processingStatus: 'APPROVED', httpStatus: 200 } };
  }
${marker}`);
  return changed;
}

export function portable(workflow) {
  const copy = structuredClone(workflow);
  delete copy.id; delete copy.versionId; delete copy.activeVersionId;
  for (const n of copy.nodes) delete n.credentials;
  return { name: copy.name, nodes: copy.nodes, connections: copy.connections,
    settings: copy.settings, active: false, pinData: {} };
}
