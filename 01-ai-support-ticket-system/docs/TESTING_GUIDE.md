# Milestone A testing guide

This guide explains the completed tests, not a new test run. Review date: 2026-11-08. No workflows, webhooks, tests, credentials, or databases were executed or changed while preparing it. Project architecture and setup remain in the [project README](../README.md).

## 1. What the evidence means

**Every runtime result below is previously reported PASS from Milestone A, not freshly verified by this documentation review.** The current test source was inspected to explain its inputs and assertions. Source shows what a test checks; it does not, by itself, prove that a historical run passed. The earlier sanitized console results in the Codex conversation, README result table, and root handoff record those runs. There is no committed raw-results archive. Missing evidence is identified rather than recreated.

An **assertion** is a statement that stops a test if the actual value differs from the expected value. A runner prints PASS only after the assertions for that check complete. A scenario can contain several requests and assertions; counts are not interchangeable with HTTP request counts or n8n execution counts.

| Group | Previously reported result | What actually ran | Main evidence |
|---|---|---|---|
| Human-review isolated logic | 33/33 PASS | JavaScript functions in Node's VM with fabricated n8n inputs; local DEV export read | Assertions and console output; no execution IDs |
| Reviewer integration | 20 numbered checks PASS, plus cleanup assertions | Real localhost HTTP requests, complete DEV workflows, real MySQL; synthetic tickets | Responses, database SELECTs, terminal output, durable decision audits |
| AI validator | 10/10 PASS | Read-only n8n API GETs to retrieve code, then local VM fixtures | Exact output/status assertions; no workflow/model execution |
| Intake regression | 6 scenarios PASS | Complete DEV intake webhook, real MySQL and Ollama for new valid tickets | HTTP replies, saved intake node run data and affected-row counts |
| Security cleanup | PASS, outside those four totals | Key rotation verification, precise history deletion, read-only preservation comparisons | Old keys403/new key200; deleted IDs404; recorded before/after hashes |

Synthetic means the ticket contents were invented for testing. It does **not** mean the database or webhook was mocked. Conversely, a fabricated SQL-result object in an isolated test does not execute SQL.

### Source files and commands

Commands are shown for understanding and future separately authorized use. **None were run for this review.** Run from the repository root.

| File | Role | Command and effects |
|---|---|---|
| [review-decision.test.mjs](../tests/review-decision.test.mjs) | All 33 local checks below | `node 01-ai-support-ticket-system/tests/review-decision.test.mjs` — offline/local, no credentials, writes, or services |
| [review-workflow.mjs](../tests/review-workflow.mjs) | Shared validator, resolver, SQL, builder and DEV replay patch | Helper module, not another test suite; exporting a function is not executing a workflow |
| [validate-ai-result.test.mjs](../tests/validate-ai-result.test.mjs) | All 10 validator fixtures | `node 01-ai-support-ticket-system/tests/validate-ai-result.test.mjs` — isolated execution, but needs local read-only API access and private API settings |
| [review-integration.test.mjs](../tests/review-integration.test.mjs) | All 20 reviewer checks | `node 01-ai-support-ticket-system/tests/review-integration.test.mjs` — **mutates DEV state**, rotates dedicated reviewer key, seeds retained tickets, publishes DEV, injects/restores audit failure, rewrites portable reviewer export |
| [persistence-integration.test.mjs](../tests/persistence-integration.test.mjs) | Six normal intake scenarios; also separate fault/edge modes | `node 01-ai-support-ticket-system/tests/persistence-integration.test.mjs` — publishes DEV, writes retained synthetic data, then deactivates DEV |

The first two commands execute isolated logic without submitting tickets; only the review-decision command is fully offline. Do not import the integration runners merely to inspect them: top-level setup reads private configuration and can make API calls. Integration commands are **not safe read-only demonstrations**. Their appearance here does not authorize running them.

`review-integration.test.mjs --provision` is first-time provisioning, not ordinary testing: it adds the narrow grant, imports a credential, creates the workflow and patches DEV. Do not rerun it. Intake `--smoke` runs one normal persistence scenario; `--faults` substitutes DEV behavior; `--edges` checks length/numeric/quoted data. Those modes require separate authorization and are not included in the six normal scenarios.

## 2. The 33 isolated human-review tests

**Execution method for every row:** Node `vm.Script` calls the real shared JavaScript function or saved response code with simulated `$input`, `$execution`, and node lookups. No real authentication, database locking, SQL execution, or HTTP response occurs. The functions return JSON; `httpStatus` is an intended status value.

Base request: `{ticketId:'REVIEW-UNIT-001', decisionId:'d1', decision:'APPROVE', category:'BILLING', reason:'Duplicate charge'}`. The fabricated successful SQL row has APPROVED state, the fixed reviewer identity, matching decision details, and `updated_rows=1, audit_rows=1`. Each row states its expected result and exact assertion signal. **Recorded actual result for all 33: previously reported PASS (the specified assertion succeeded); not rerun here.** Purpose/business relevance is in the last column.

| # / test name | Input or change | Expected result / verification assertion | Why it matters to the business |
|---|---|---|---|
| 1 Approval and fixed server identity | Base request | `valid === true`; reviewerId equals `portfolio-dev-reviewer-1` | Attribute decisions to a trusted identity |
| 2 Rejection | REJECT, remove category | `newStatus === 'REJECTED'` | Support an explicit negative review outcome |
| 3 Identity spoof | Add `reviewerId:'admin'` | `httpStatus === 400` | Prevent impersonation through request fields |
| 4 Unknown field | Add `extra:true` | 400 | Avoid accepting unintended controls |
| 5 Invalid category | category UNKNOWN | 400 | Prevent approving an unusable classification |
| 6 Empty reason | reason is a space | 400 | Require an explanation |
| 7 Long reason | 501 `x` characters | 400 | Reject content beyond the column limit before SQL |
| 8 Long ticket ID | 129 `x` characters | 400 | Avoid truncation/incorrect ticket matching |
| 9 Invalid decision | lowercase `approve` | 400 | Enforce an unambiguous input contract |
| 10 Invalid request ID | decisionId `x';--` | 400 | Keep request identifiers within their allowed format |
| 11 Reject with category | REJECT but retain BILLING | 400 | Avoid ambiguous rejection instructions |
| 12 Invalid null body | null | 400 | Handle missing request content safely |
| 13 Invalid array body | `[]` | 400 | Require one structured decision object |
| 14 Invalid text body | `'text'` | 400 | Reject the wrong body type |
| 15 Unicode field limits | 500 emoji in reason | `valid === true` | Count Unicode code points rather than JavaScript UTF-16 units |
| 16 Numeric-looking ID | ticketId `000123` | Returned ID exactly `000123` | Preserve meaningful leading zeros; this alone does not test SQL binding |
| 17 Committed decision | Fabricated successful SQL row | `replayed === false` | Recognize a newly committed result |
| 18 MySQL statement metadata emits one decision | Metadata `{affectedRows:1}` followed by final row | Resolver returns 200 | Ignore driver metadata rather than responding with a false failure |
| 19 Multiple final rows fail closed | Two final-result rows | 503 | Refuse an ambiguous persistence result |
| 20 Identical replay | Matching row, both write counts zero | `replayed === true` | Let safe retries return a stored decision |
| 21 Conflicting content | Same row, changed request reason | 409 | Prevent silently changing an existing decision |
| 22 Competing reviewer | Same row, request reviewer `'other'` | 409 | Prevent attributing one reviewer's decision to another; this is simulated, not two authenticated users |
| 23 Missing ticket | null ticket ID, zero counts | 404 | Tell the caller that no ticket was found |
| 24 Mismatched write counts | updated1, audit0 | 503 | Never report success without matching audit evidence |
| 25 SQL error sanitized | Fabricated private driver error | Exact JSON `{httpStatus:503,errorCode:'REVIEW_UNAVAILABLE'}` | Keep database internals out of client responses |
| 26 Only one intake node changes | Apply replay patch to local export | Deep equality of all nodes except `Prepare Public Response` | Limit compatibility changes to their intended scope |
| 27 Patch idempotent | Apply patch again | Entire patched objects deeply equal | Prevent duplicate patch insertion |
| 28 Intake APPROVED replay | Fabricated APPROVED row, BILLING/reason | Status value200; same ticketId | Recognize completed human approval |
| 29 Intake REJECTED replay | Fabricated REJECTED row | 200; same ticketId | Recognize completed rejection without retrying AI |
| 30 Intake AUTO_ROUTED replay | Fabricated AUTO_ROUTED row | 200; same ticketId | Preserve automatic-classification behavior |
| 31 Intake PENDING_REVIEW replay | Fabricated PENDING_REVIEW row | 202; same ticketId | Distinguish a request for review from a decision |
| 32 Intake PROCESSING replay | Fabricated PROCESSING row | 202; same ticketId | Report work that is still in progress |
| 33 Intake FAILED replay | Fabricated FAILED row | 503; same ticketId | Avoid presenting dependency failure as success |

Example assertions from the suite:

```js
assert.equal(v.reviewerId, 'portfolio-dev-reviewer-1');
assert.equal(run(resolveDecision, { ...row, audit_rows: 0 }, prepared).httpStatus, 503);
```

`assert.equal` compares values. `{ ...row, audit_rows: 0 }` copies a fixture and changes one field. `run` supplies the fake n8n environment and executes the shared function locally. The first assertion checks identity assignment, not Header Auth. The second checks error-handling logic, not transaction rollback.

Coverage limits: the current DEV export is already patched, so check26 can be a no-op comparison; it is not independent proof of the original-to-DEV diff. Earlier milestone configuration/parity checks supplied that evidence. Check18 asserts the resolver's returned status, not that an actual response node ran exactly once. Checks28–33 assert status and ticket ID, not every response field or absence of AI execution; integration checks supply the stronger field/no-AI evidence for APPROVED/REJECTED.

## 3. The 20 reviewer integration checks

### Shared input and method

The final recorded fixture prefix is **`MILESTONE-A-1794178914308`**. The runner creates fresh tickets directly in real MySQL as PENDING_REVIEW, UNKNOWN, `requires_review=1`, with synthetic email/message and a clearly marked fixture audit. This setup bypasses intake/AI intentionally to test the reviewer independently. The NONPENDING fixture is PROCESSING instead.

Base HTTP body (no authentication material shown):

```json
{
  "ticketId": "MILESTONE-A-1794178914308-APPROVE",
  "decisionId": "decision-1",
  "decision": "APPROVE",
  "category": "BILLING",
  "reason": "Synthetic duplicate charge review"
}
```

The runner's `send` submits POST to the local reviewer webhook. It checks actual HTTP status and scans response text for the test key and selected internal SQL/error fields. `evidence(ticket)` performs a real SELECT returning status, review flag, category and count of the unique terminal audit. `auditDetails(ticket)` independently reads the saved reviewer, previous/new state, execution reference and decision details. Fixture creation/inspection uses the existing local administrative connection privately; the n8n SQL node uses the restricted runtime credential. No passwords or request authentication headers belong in documentation.

**Recorded actual result for every numbered row: previously reported PASS with the stated results.** These 20 `record(...)` calls are the final normal run's count; some group several requests. Most reviewer execution IDs are not recorded individually in the README. Do not invent them. Methods are marked HTTP, DB SELECT, API/config, or intake run-data inspection below.

| # / check | Input and execution method | Expected and previously reported actual result / PASS evidence | Purpose and business relevance |
|---|---|---|---|
| 1 Dedicated credential securely imported | Runner generates a key in memory and uses supported CLI import | CLI status0 and captured success marker; no secret output | Provision an encrypted credential without hardcoding a key; no HTTP test yet |
| 2 Missing authentication | Base body without reviewer authentication; HTTP | 403 assertion | Stop unauthenticated decisions |
| 3 Invalid authentication | Base body with intentionally wrong authentication; HTTP | 403 assertion | Reject an untrusted caller |
| 4 Auth denied; ticket/audit unchanged | Same APPROVE fixture; DB SELECT plus API history comparison after2–3 | `PENDING_REVIEW,1,UNKNOWN,0`; no new saved histories | Confirm denied requests did not change the ticket; with saving disabled, empty history alone does not prove no execution or no SELECT |
| 5 Client identity rejected | Add spoofed reviewerId to validly authenticated body; HTTP | 400 | A caller cannot nominate an administrator identity |
| 6 Invalid payloads | UNKNOWN category; empty reason; REJECT retaining category; three HTTP requests | Each400 | Reject incomplete/contradictory decisions before accepting a review |
| 7 Approval and durable audit | Base approval; HTTP and DB SELECT | 200, `replayed=false`; `APPROVED,0,BILLING,1`; saved reviewer fixed, previous PENDING_REVIEW, new APPROVED, matching reason | Make the ticket result and accountability record agree. Audit execution reference **11282** |
| 8 Identical decision replay | Repeat exactly the approval; HTTP and DB SELECT | 200, `replayed=true`; still exactly one terminal audit | A retry must not approve twice or duplicate history |
| 9 Changed/competing request conflicts | Same ticket, changed reason; then different decisionId; HTTP | Both409 | Preserve the first committed decision |
| 10 Rejection, Unicode/quoted reason and replay | REJECT fixture, omit category, reason containing quotes/emoji; then repeat | 200; `REJECTED,0,UNKNOWN,1`; exact saved reason; replay200/true | Preserve human explanations and make rejection retriable. Audit reference **11286** |
| 11 SQL-like text is literal data | SQL-LITERAL fixture; reason contains `'; SIGNAL SQLSTATE '45000'; --` and emoji; HTTP/DB SELECT | 200; stored audit reason exactly equals input | Treat potentially hostile-looking text as data, not executable SQL |
| 12 Concurrent competing decisions | Two `Promise.all` requests for CONCURRENT: different IDs/categories | Status set `[200,409]`; exactly one terminal audit | One winner when two requests race; not a multi-user identity test |
| 13 Concurrent identical decisions | Two simultaneous identical requests for IDENTICAL | Both200; replay flags false/true; `APPROVED,0,BILLING,1` | Duplicate submissions can both get a useful response while committing once |
| 14 Nonpending and missing tickets | PROCESSING fixture; then nonexistent `-MISSING` ID | 409 with PROCESSING row/no terminal audit unchanged; missing404 | Do not steal in-progress tickets or invent records |
| 15 Audit constraint failure rolls back | Fresh ROLLBACK fixture; temporarily replace audit event type with SQL NULL only in reviewer DEV | HTTP503; DB still `PENDING_REVIEW,1,UNKNOWN,0` | Ticket update must not survive failure to insert its required audit |
| 16 Recovery after restoring SQL | Restore functional reviewer definition, repeat same ROLLBACK decision | 200; `APPROVED,0,BILLING,1` | A rolled-back attempt must not consume the valid decision |
| 17 Intake APPROVED replay | Original synthetic ticket fields sent to intake DEV after approval | 200/APPROVED; all original fields equal; no `Classify Ticket` or `Save Ticket Outcome`; claim audit0 | Customers retrying intake must see the completed review. Intake execution **11297** |
| 18 Intake REJECTED replay | Same method for rejected fixture | 200/REJECTED; same field/no-AI/no-outcome assertions | Avoid misreporting a completed rejection as service failure. Intake **11298** |
| 19 Intake invalid contract | Invalid email/empty message to intake DEV | 400 and no `Claim Ticket` run | Keep the earlier validation boundary intact. Intake **11299** |
| 20 No new saved reviewer history | API list after all requests, subtract IDs known before the run | New reviewer history count0 | Avoid persisting authentication headers in node execution data; this check alone is not proof about every possible log destination |

Additional unnumbered `finally` assertions restore the functional reviewer definition, deactivate both DEV workflows, compare ORIGINAL and legacy definitions with their baselines, verify historical backup hashes, and compare intake DEV's definition. The runner rewrites the sanitized reviewer export. These cleanup checks are **not extra entries in the reported20**. The earlier provisioning run printed a grant-applied check but failed later; it is not the final successful20-check run.

### How the important SQL works

The actual parameterized SQL and `queryReplacement` are in `review-workflow.mjs`. Key excerpts:

```sql
SELECT ticket_id INTO @portfolio_review_locked
FROM ai_support_portfolio.tickets
WHERE ticket_id = SUBSTRING($1,2) FOR UPDATE;

-- Inside the same transaction:
UPDATE ai_support_portfolio.tickets SET ...
WHERE ticket_id = SUBSTRING($5,2)
  AND processing_status = 'PENDING_REVIEW'
  AND requires_review = 1 AND NOT EXISTS (...);
SET @portfolio_review_updated = ROW_COUNT();
```

The ellipses here are explanatory omissions, not runnable SQL. `FOR UPDATE` locks the matching row until the transaction finishes; a concurrent decision waits. The pending-only condition prevents changing a terminal decision. `NOT EXISTS` checks that this ticket has no terminal decision audit. `ROW_COUNT()` records how many rows the update changed.

The next statement inserts `HUMAN_REVIEW_DECIDED` only when that count is1, with event key `HUMAN_REVIEW_DECISION:v1`. The table's unique `(ticket_id,event_key)` prevents a second terminal event for the same ticket. n8n's MySQL `queryBatching:'transaction'` wraps the statements so they commit together or roll back on an error. The test's NULL event type deliberately violates a NOT NULL constraint **after the update**, testing real database rollback without stopping MySQL.

The final SELECT returns persisted ticket/audit details and both write counts. The JavaScript resolver accepts `(1 update,1 audit)` as a new decision or `(0,0)` as a potential replay, then checks reviewer, request ID, decision, category, reason and persisted state all match. A different result conflicts; an ambiguous count returns503. The resolver cannot itself roll back an already completed transaction: atomicity comes from the SQL transaction, not from checking counts afterward.

Bindings keep user text separate from SQL. Existing n8n MySQL v2.5 workarounds use unique sequential placeholders and prefix strings with `~`; SQL `SUBSTRING(...,2)` removes that prefix. This preserves numeric-looking strings. Do not replace binding with string interpolation.

```js
const same = await Promise.all([send(decision(identical)), send(decision(identical))]);
assert.deepEqual(same.map(x => x.status), [200, 200]);
assert.deepEqual(same.map(x => x.body.replayed).sort(), [false, true]);
```

`Promise.all` starts both requests without waiting for the first response. The assertions do not assume which finishes first. Together with the database count of one decision audit, they show the tested race committed once. They are a small concurrency test, not a load test or proof of every possible scheduling order.

## 4. The 10 AI validator tests

The runner retrieves DEV's saved `Validate AI Result` code and `Respond to Webhook` status expression through authenticated GETs, then runs them in a local VM. It supplies a valid synthetic ticket plus the following **fabricated model output**. Ollama, MySQL, and the complete workflow are not executed. Every case compares the complete safe output, checks the saved status expression, and checks that neither input fixture was mutated.

For cases1–8 the expected output is UNKNOWN, blank reason, `isValid=false`, `requiresReview=true`, errorCode INVALID_AI_OUTPUT, processingStatus CLASSIFICATION_REVIEW_REQUIRED and **intermediate intended status200**. Cases9–10 expect AI_UNAVAILABLE and intended503. **All ten were previously reported PASS; no real HTTP status was produced by this VM.**

| # / test name | Fabricated input | Expected/asserted result and purpose/business relevance |
|---|---|---|
| 1 Malformed JSON | content `{RAW_MALFORMED_OUTPUT` | Safe review-required output200; broken model formatting must not crash ticket processing |
| 2 JSON null | content string `'null'` | Same; valid JSON syntax is not enough to be a classification |
| 3 Actual null | content null | Same; handle missing model content |
| 4 JSON array | content string containing an array of a SHIPPING classification | Same; require one classification object |
| 5 Actual array | content already an array | Same; reject the wrong shape regardless of representation |
| 6 Unsupported category | ESCALATION with a reason | Same; prevent routing to a nonexistent business category |
| 7 Empty reason | SHIPPING, reason `''` | Same; require usable justification |
| 8 Whitespace-only reason | SHIPPING, spaces/tab/newline reason | Same; blank explanations are not meaningful |
| 9 Synthetic connection refusal | Fabricated error text ECONNREFUSED with internal marker | Safe AI_UNAVAILABLE503; do not leak connection details |
| 10 Synthetic timeout | Fabricated ETIMEDOUT with internal marker | Safe AI_UNAVAILABLE503; do not leak timeout details |

The exact whole-output comparison excludes the raw model text/internal error marker and preserves ticket fields. Before/after API inventory hashes also check that workflow definitions and activation states did not change (previously19 API-visible workflows). That is read-only configuration verification, not another model test.

**Why200 here versus202 for PENDING_REVIEW?** This suite tests an intermediate node's legacy output and the responder expression against that output. In the full persisted workflow, `Prepare Ticket Outcome` and `Save Ticket Outcome` persist PENDING_REVIEW, then `Prepare Public Response` returns202. The VM's intended200 does not prove that invalid model output reaches a customer as200. The earlier injected-output integration evidence (10168–10171) records the actual persisted202 path. Likewise, fabricated timeout/refusal fixtures are not actual service outages or a test of a configured model timeout.

## 5. The six complete intake scenarios

These execute **Portfolio 1 - AI Support Ticket Intake - DEV**, ID `u0tVpaiOEqBLShlS`, through `/webhook/support-ticket-intake-dev`. Synthetic IDs begin `PORTFOLIO-QA-<run timestamp>`. The normal message asks about being charged twice. New valid tickets reach real Ollama and MySQL. This is integration testing, not a model-accuracy benchmark.

`sendTickets` captures actual responses, finds matching saved DEV executions, checks webhook mode/success and one `Respond to Webhook` run, and rejects selected internal fields in public output. `assertNew`, `assertReplay`, and `rows` inspect node run data. Audit persistence here is primarily evidenced by MySQL affected-row counts returned through n8n; the normal six-scenario runner does not independently SELECT every audit row.

**All six results below are previously reported PASS from the post-patch Milestone A run.**

| Scenario | Input / execution | Expected and recorded actual / verification | Business purpose |
|---|---|---|---|
| 1 New ticket/classification and both audits | Fresh `-NEW` duplicate-charge ticket; complete webhook | **11266**,200/BILLING; original fields equal; Classify once; NEW claim; creation audit1; final update1/audit1; AUTO_ROUTED | Establish the happy path really persists accountable results |
| 2 Identical retry | Repeat scenario1 body | **11267**,200; response deeply equals original; no AI/final outcome node; creation audit0 | Prevent duplicate processing and model costs on retries |
| 3 Conflicting payload, original preserved | Same ID but different message, then repeat original body | **11268**,409, no AI/outcome write; **11269**,200 original replay | Prevent an ID collision overwriting an existing customer ticket |
| 4 Invalid input bypasses DB/AI | Invalid email and empty message | **11270**,400; exact two validation errors; no Claim Ticket/Classify Ticket | Reject unusable data before consuming dependencies |
| 5 Concurrent identical requests and settled replay | Same fresh `-CONCURRENT` body twice concurrently, then retry | **11271–11273**: pair200/202 in recorded run; exactly one AI call, one NEW owner, sum creation-audit counts1; settled200 with no AI | Avoid duplicate work while honestly reporting in-progress requests |
| 6 Concurrent conflicting requests | Same fresh ID, duplicate-charge message versus refund message | **11274–11275**, one200 and one409; exactly one AI call | Make competing submissions choose one owner instead of mixing content |

The saved console line associated the identical-request pair with IDs11272/11271 and statuses202/200; IDs and arrival order must not be interpreted as guaranteed scheduling. The code permits both replies200 if the first finishes before the duplicate reads the row. The conflicting-race check asserts exactly one409 and one AI call; it does not separately assert the winning category. ORIGINAL was read and compared, not executed by this run. Both DEV deactivation and unchanged definitions were checked in cleanup.

### Earlier fault/edge evidence, separate from these six

The README also records older DEV runs: malformed/UNKNOWN output persisted PENDING_REVIEW202 and replayed (10168–10171); simulated model failure persisted FAILED503 (10172–10173); injected claim transaction failure rolled back and allowed a later NEW claim (10174–10175); injected finalization failure left PROCESSING after rollback (10176–10177); invalid fingerprint stopped claiming (10178); length, numeric-looking text, and quoted SQL-like text checks (10188–10190).

These are **previously reported historical results**, not freshly re-inspected executions or newly rerun tests. The fault runner replaces DEV model behavior or inserts SQL `SIGNAL` failures, then restores it. They are real workflow/database tests with deliberately injected faults, not actual Ollama/MySQL outages. The separate27-case private warning investigation in the README is not a committed runner and is not part of the33 review tests.

## 6. Where to find evidence safely

### Workflows and saved results

| Workflow | ID | Evidence role |
|---|---|---|
| Portfolio 1 - Human Review Decisions - DEV | `2fC4kymKXdm0o3sz` | Reviewer HTTP integration; intentionally no retained node histories after security fix |
| Portfolio 1 - AI Support Ticket Intake - DEV | `u0tVpaiOEqBLShlS` | Six normal scenarios and reviewer-to-intake compatibility requests; IDs above |
| Portfolio 1 - AI Support Ticket Intake | `0G0j4x3GtVpRCAPa` | Protected by definition comparisons during A; earlier ORIGINAL smoke10473/10484 is separate historical evidence |
| AI Review Decision Processor (legacy) | `IqMpoRI8EZcSuqrc` | Compared for preservation; not reused or executed by the milestone tests |

The [README result table](../README.md#important-verified-results), [root handoff](../../PROJECT_HANDOFF.md), and Milestone A Codex console output are the recorded summaries. A source file's `console.log` template is not a saved result. n8n IDs are references, not copies of execution payloads in Git. This documentation review did not fetch current histories or query MySQL; whether any retained record has since changed is not newly established here.

### Why the reviewer's Executions tab is empty

Early tests discovered that this installed Webhook node saved the authentication header despite an internal redaction marker. The dedicated key was rotated; success/error execution-data retention, manual execution saving, and progress saving were disabled **only for the reviewer workflow**. The final integration runner asserted zero new saved reviewer histories. A workflow can execute successfully while its node data is not retained; its SQL transaction still writes the business audit.

With explicit approval, **41 confirmed synthetic reviewer histories were permanently deleted**: **11195–11208 (14), 11211–11219 (9), 11222–11239 (18)**. Each returned404 afterward. They cannot now be replayed from the Executions tab. The final successful reviewer decisions11282/11286 were not among those deletions: their IDs are stored in MySQL audits, while their node histories were deliberately never retained.

Previously reported cleanup checks: current prior key and every exposed historical key rejected403; newly rotated key replayed an existing synthetic decision200. Exact selected-ID deletion used the existing signed-in n8n UI after public API DELETE403 and a separate session401; no API privileges were expanded. Baseline6,595 unrelated history metadata entries and all40 tickets/76 audit rows matched their before/after hashes. Twelve unrelated background histories appeared independently. Those counts describe the cleanup moment, not current live inventory. The cleanup was a separately authorized one-off procedure recorded in the conversation, not a committed fifth test runner.

### Durable MySQL evidence

For the final review run, inspect only exact synthetic ticket IDs with prefix `MILESTONE-A-1794178914308`: `-APPROVE`, `-REJECT`, `-SQL-LITERAL`, `-CONCURRENT`, `-IDENTICAL`, `-NONPENDING`, `-ROLLBACK`. `-MISSING` was not inserted; `-INVALID` was an invalid intake request. Final expected states are APPROVED for the successful approvals/races/recovered rollback, REJECTED for rejection, and PROCESSING for NONPENDING. For CONCURRENT, do not assume the category: either competing request could win.

The fixture audit uses `FINAL_OUTCOME:v1` and HUMAN_REVIEW_REQUESTED for pending setup, or DEV_FIXTURE_CREATED for NONPENDING. That setup event is **not evidence that AI failed on these fixtures**: the test inserted it directly. A completed review has event key `HUMAN_REVIEW_DECISION:v1`, event type HUMAN_REVIEW_DECIDED, previous_status PENDING_REVIEW, terminal new_status, fixed reviewer_id, and normalized decision details. Intake-created tickets instead have TICKET_CREATED and their final-outcome event.

For future authorized read-only inspection, use an existing private database connection without putting credentials in commands. The following are illustrative SELECTs, **not executed for this guide**. Select one exact known synthetic ID; avoid customer email/message, raw request headers, and unrestricted dumps.

```sql
SELECT ticket_id, processing_status, requires_review, classification_category
FROM ai_support_portfolio.tickets
WHERE ticket_id = 'MILESTONE-A-1794178914308-APPROVE';

-- Columns already included in the runtime account's narrow audit SELECT grant:
SELECT ticket_id, event_key, event_type, new_status, reviewer_id,
       JSON_UNQUOTE(JSON_EXTRACT(details, '$.decisionId')) AS decision_id
FROM ai_support_portfolio.ticket_audit
WHERE ticket_id = 'MILESTONE-A-1794178914308-APPROVE'
  AND event_key = 'HUMAN_REVIEW_DECISION:v1';

SELECT COUNT(*) AS terminal_decision_events
FROM ai_support_portfolio.ticket_audit
WHERE ticket_id = 'MILESTONE-A-1794178914308-APPROVE'
  AND event_key = 'HUMAN_REVIEW_DECISION:v1';
```

Expected from the recorded run: APPROVED/0/BILLING, fixed reviewer with decision-1, and one terminal event. These are expectations from prior evidence, not freshly queried results. Existing audit SELECT privileges cover ticket_id,event_key,event_type,new_status,reviewer_id,details only. The test's administrative inspection also read previous_status/execution_id; those are **not** granted to the runtime account. Do not add permissions or use root in a workflow just to demonstrate them.

Final rows substantiate a committed decision, not every request that led to it. A single final audit cannot prove how many HTTP attempts occurred. The recovered ROLLBACK fixture is now APPROVED: its final row cannot independently reconstruct the brief pending/no-audit state observed after503. That transient assertion depends on the previously recorded test run. An absent audit alone likewise cannot prove that authentication ran before a read; the built-in auth configuration plus403 responses and unchanged records support that boundary.

## 7. Important concepts and honest limits

- **Authentication** asks whether the caller possesses the allowed credential. **Authorization** limits that authenticated caller to the fixed DEV reviewer role/path. This is one credential-bound identity, not a multi-user roles system. Spoof rejection and a simulated competing-reviewer fixture do not prove multiple real reviewers authenticated.
- **Idempotency** means repeating the same action has the same business effect. Reviewer identity, ticket-scoped decision ID, decision and normalized content must match to replay. A new decision ID is a conflict after a terminal decision, even with the same category.
- **Concurrency** means overlapping requests. Row locking and conditional updates give a single winner; the audit uniqueness constraint is another safeguard. The tested two-request races do not establish sustained throughput, fairness or behavior under large load.
- **Transactions** keep the ticket update and required audit together. **Rollback** undoes the ticket update when the injected audit insertion fails. The deliberately broken DEV SQL was restored; no database service was stopped.
- **Sanitization** means returning a small allowed response instead of raw driver errors. It is not a complete penetration test. HTTP200 alone does not prove persistence: database/audit assertions supply that evidence.

Evidence gaps and coverage limits:

1. No test was rerun and no current live records were read for this guide. All historical PASS labels are previously reported. There is no committed machine-readable run manifest or raw output archive; exact reviewer request-to-execution mappings beyond the recorded audit references are incomplete.
2. Deleted reviewer histories and transient rollback observations cannot be independently reconstructed from retained node logs. One-off security cleanup hash comparisons were reported in chat; those baseline payloads are not committed evidence.
3. Reviewer fixtures start already pending; the final20 checks do not demonstrate an unmodified model naturally producing PENDING_REVIEW and then a human decision end to end. Older injected-output tests cover the pending persistence path separately.
4. The ten AI fixtures are negative/error cases, not successful category coverage or model accuracy evaluation. Actual service outages, connection loss during commit, and an enforced native Ollama timeout remain untested.
5. History-off verification checks saved reviewer execution inventory. It does not prove secret absence in every possible infrastructure log, memory dump or monitoring system. Disabling history is a mitigation, not a tested redaction fix; do not turn it back on for screenshots.
6. Reviewer/ORIGINAL share tables. ORIGINAL lacks terminal decision replay compatibility. Demo isolation, public endpoint controls/rate limits, a reviewer UI, notifications, reopening decisions, and PROCESSING/FAILED recovery remain unfinished. Intake is unauthenticated and must not be exposed publicly as-is.
7. Neither isolated assertions nor small integration races prove every invariant for arbitrary inputs. The earlier promotion/parity and cleanup checks are separate evidence; preserved source alone is not a current infrastructure audit.

## 8. Explaining this in interviews

Start with the risk and the proof, rather than reciting test counts:

> “I separated fast JavaScript checks from full DEV webhook tests. The local checks tested validation and response decisions without a database. Integration tests used synthetic tickets against real n8n and MySQL. I checked actual HTTP replies and durable audit records, not just green workflow runs. I tested duplicate requests, two simultaneous decisions, and an audit failure that had to roll back the ticket update. I also found an authentication-header retention issue, rotated the affected key, disabled reviewer execution-data saving and removed only the approved synthetic histories.”

The three tests to understand best:

1. **Audit failure rollback (reviewer15–16):** explain the update-then-audit transaction, why NULL forces an insertion failure, the503 plus pending/no-audit SELECT immediately afterward, and successful retry after restoration. This prevents unaudited business changes.
2. **Concurrent identical/competing decisions (reviewer12–13):** explain `Promise.all`, a row lock, one durable terminal audit, replay versus409, and why request order does not determine the winner. This prevents duplicate or contradictory processing.
3. **Authentication and trusted identity (reviewer2–7, plus cleanup):** explain missing/wrong key403, spoofed identity400, the server-assigned reviewer audit, and why an empty Executions tab is intentional. This protects decision integrity without pretending the project has a full multi-user identity system.

If asked about confidence, say what was actually established: the specific scenarios passed in the recorded local DEV installation. Do not claim public production readiness, comprehensive security testing, real outage testing, or freshly verified infrastructure from this documentation review.
