# AI Support Ticket Automation

**Status:** Completed 18-node intake milestone remains unchanged in ORIGINAL. Milestone A's separate authenticated DEV reviewer and DEV-only terminal-state replay compatibility are implemented and tested. Milestone A is complete, including verified cleanup of synthetic reviewer execution histories created before an authentication-header retention issue was found. Both DEV workflows are inactive. Public deployment is future work.

**Milestone B (2026-11-11): local interactive demo complete.** A lightweight `/support-ticket` page now submits fictional tickets through a protected local backend to a separate authenticated n8n intake and isolated MySQL schema. Real Ollama classification, persistence, retries and failure handling were tested. DEMO is left inactive; nothing is publicly deployed. See [local demo setup](#local-interactive-demo-milestone-b). Milestone A's [testing guide](docs/TESTING_GUIDE.md) remains historical A evidence, not a description of the new demo tests.

## Local interactive demo (Milestone B)

```text
Browser /support-ticket
  → same-origin Node.js /api/demo/tickets (loopback only)
  → private authenticated n8n /webhook/support-ticket-intake-demo
  → isolated ai_support_portfolio_demo tickets + ticket_audit
  → existing local Ollama → validated, persisted, allowlisted result
```

The dependency-free Node.js server is [demo/server.mjs](demo/server.mjs); the responsive HTML/CSS/JavaScript is in `demo/public/`. Four fictional examples cover shipping, billing, refunds and general questions. The UI shows loading, AUTO_ROUTED, PENDING_REVIEW, timeout and error states. No refund, email, reviewer decision or customer action is performed.

**Isolation:** `Portfolio 1 - AI Support Ticket Intake - DEMO` (`9OTSZ4fd1jOe388L`) reuses all 18 intake nodes in a separate workflow. Its three existing SQL nodes target only `ai_support_portfolio_demo`; its Webhook uses its own Header Auth credential. ORIGINAL, intake DEV, reviewer DEV and the legacy reviewer were not changed. The new schema copies reviewed table definitions with its audit foreign key pointing into the demo schema, not the original tables.

`portfolio_demo_runtime` has only demo ticket SELECT/INSERT, UPDATE on classification_category, classification_reason, requires_review, review_reason, processing_status and policy_version, plus demo audit INSERT. It has no audit SELECT/UPDATE/DELETE, DDL, or global privileges beyond USAGE. Actual SELECT attempts against both original tables were denied **before any demo writes**; a zero-row DELETE permission probe was also denied. The host pattern is `%` for existing local container connectivity; no ports/networks were changed. Public hosting must review network and host restrictions separately.

**Backend controls:** loopback bind, strict Host/Origin checks, signed HttpOnly/SameSite session cookie, session-bound CSRF token, JSON-only requests, 8KiB body cap, message limits of 10–1,500 code points/6,000 UTF-8 bytes, and rejection of unknown fields/contact links/obvious email or telephone patterns. The caller must acknowledge fictional content. These checks reduce accidental personal-data entry; arbitrary free text cannot be guaranteed free of personal data. The browser cannot supply ticket IDs, customer email, URLs, workflow IDs, or SQL. The backend creates a session-bound HMAC ticket ID and `fictional@example.invalid` email. Another session's request ID produces a different database ticket ID.

The session lasts 30 minutes. Rate limits allow 12 POST attempts per minute per client IP and at most two upstream requests in flight; concurrent identical requests share one upstream promise. Retries retain the same UI request ID while the message is unchanged, so n8n's existing fingerprint/claim transaction prevents duplicate processing, including after backend restart within the same signed session. Changed content under an existing request ID yields409. No proxy-forwarded IP header is trusted. The rate limiter is process-local, suitable for this single-process local demo; public/multi-instance deployment needs edge/shared limits.

The backend calls only the fixed local DEMO webhook path, times out upstream requests after45 seconds, and returns only status, category/reason when valid, and a short synthetic reference. SQL errors, fingerprints, customer fields, workflow execution IDs, and private headers are excluded. Static serving uses an exact asset allowlist; `.env` and management routes return404. A CSP blocks third-party scripts, framing and inline code. No n8n management key or reviewer credential is used by browser code or the serving backend.

### Local startup and shutdown

Use the existing private n8n/MySQL/Ollama installation and Node.js24. No package installation or paid service is required. Private configuration lives only in the root ignored `.env`. Never copy it into frontend assets or screenshots. Demo MySQL and webhook credentials are separate encrypted n8n credentials. Workflow imports omit credential references and require deliberate selection of those credentials.

From the repository root, for an explicitly authorized local demo session:

```powershell
# Publish only the isolated demo; this does NOT publish ORIGINAL or DEV.
node 01-ai-support-ticket-system/demo/manage.mjs activate
node 01-ai-support-ticket-system/demo/server.mjs
```

Open `http://127.0.0.1:8787/support-ticket` (use this exact origin, not localhost). Keep the terminal running. Stop it with Ctrl+C; then unpublish only DEMO:

```powershell
node 01-ai-support-ticket-system/demo/manage.mjs deactivate
```

`demo/manage.mjs provision` is **first-time-only provisioning**, requiring explicit schema/account/credential authorization and the existing reviewed source schema. Do not rerun it on this installation. It refuses an already recorded DEMO ID and does not overwrite an existing schema/account. If a provisioning transport failure leaves partial resources, inspect their metadata and resume deliberately; do not drop/recreate credentials or data. An initial transport failure during B was handled this way, preserving the already-created schema/account/credentials before creating the workflow.

Normal authenticated n8n account tools restored management access by creating a dedicated eight-scope development API key, expiring seven days after creation. It has workflow list/read/create/update/activate/deactivate and execution list/read only; existing keys were preserved. The key is operator-only in the ignored `.env`; it is not necessary for serving the page. After expiry, restore valid operator access through normal signed-in key management, or activate/deactivate DEMO through the authenticated n8n editor. Do not bypass authentication or broaden unrelated keys. Webhook and signing secrets must remain private and stable while active demo sessions need replay.

### Milestone B tests and evidence

Run only with appropriate local-test authorization; the integration runner publishes/modifies **DEMO only** and retains synthetic fixtures:

```powershell
node 01-ai-support-ticket-system/tests/demo-api.test.mjs
node 01-ai-support-ticket-system/tests/demo-integration.test.mjs
```

| Verification on 2026-11-11 | Actual result | Evidence |
|---|---|---|
| Backend boundaries/fixtures | **34 checks PASS** | `demo-api.test.mjs`: local HTTP plus mocked upstream; includes real deadline against a slow local HTTP fixture, not n8n/Ollama outage |
| Complete isolated automation | **14 checks PASS** in final full run | `demo-integration.test.mjs`: real backend/n8n/MySQL/Ollama, duplicate/conflict/concurrency, session separation, DB verification, cleanup |
| Real classification and persistence | 200/AUTO_ROUTED/BILLING; one ticket, creation/final audits | n8n audit reference15664; no saved node history |
| Controlled UNKNOWN output | 202/PENDING_REVIEW, HUMAN_REVIEW_REQUESTED persisted | Reference15669; substituted model-node output, not an unpredictable real model result |
| Controlled AI-unavailable output | 503; FAILED/MODEL_UNAVAILABLE persisted; replay503 without new audit | Reference15670; substituted error, not a stopped service |
| Actual browser submission | Loading/disabled submit → AUTO_ROUTED/BILLING via real backend | Audit reference15676; synthetic reference suffix72b38c9c18 |
| Deterministic UI-state checks | Loading, success, pending, timeout, unavailable and private-contact rejection passed | ego-browser against `tests/demo-browser-fixture.mjs`; these state fixtures did not call n8n/MySQL |
| Responsiveness | Desktop1280px two columns; mobile390px one column; no horizontal overflow; submit height44.8px | Browser-emulated DOM/layout measurements, not physical-device screenshots |
| Preservation/isolation | Original schema access denied; original full-row hashes, four protected workflow definitions and backup bytes unchanged | Integration assertions; final original counts40 tickets/76 audits; demo16 tickets/31 audits retained |

Initial attempts failed before the final results: a local settings path error, an interrupted workflow-create transport, a test Host header normalized by fetch (fixed with raw HTTP), a reused test socket, and a controlled pending-path503. Publication now waits for asynchronous webhook registration; focused and final full suites passed. One failed early synthetic execution15647 remains PROCESSING in the demo schema; it was neither reset nor deleted. The exact first transient failure is not reconstructable from disabled node history. A scoped variable error in focused test mode was fixed; the final complete run passed. These failures are not hidden by the successful final totals.

DEMO success/error/manual/progress history saving is disabled to avoid retaining webhook authentication headers. Its empty Executions tab is intentional; durable MySQL `execution_id` and ticket_audit events plus recorded test output provide evidence. Test scripts inspect only new demo data or compare hashes of protected records; raw payloads and secrets are not committed. `--faults-only` runs the focused UNKNOWN/error/replay subset; it is not the entire14-check suite. Browser fixture startup is for deterministic UI QA only and is never used by `demo/server.mjs`.

### Limits and future 24/7 hosting

The local server and DEMO workflow are stopped/inactive after testing. Screenshot capture failed because the test browser window was minimized; DOM interaction and responsive geometry were verified, but screenshot-level visual QA is not claimed. Actual dependency outages and connection loss during commit remain untested. Timeout responses do not cancel work already accepted by n8n; retry unchanged content to resolve stored status. No automated recovery steals a PROCESSING claim.

This is not public-ready simply because it runs locally. Before separately authorized deployment: choose an always-on backend/n8n/MySQL/Ollama host and model capacity, provide TLS and access controls/abuse protection, shared/edge rate limiting and quotas, narrowly allowlisted private backend-to-n8n connectivity, secure secret delivery/rotation, monitoring without request/auth payloads, retention/backup/recovery policy, and a bounded model-execution strategy. Do not expose n8n editor/management APIs, MySQL, Ollama or reviewer credentials. The local upstream allowlist must be deliberately adapted to the reviewed private service URL; no arbitrary proxy destination is accepted.

A separately hosted portfolio can link to this page on a demo domain or reverse-proxy `/support-ticket` and `/api/demo/*` to the backend under one origin. Browser requests remain same-origin; a new main portfolio, account system, iframe embedding and permissive CORS are unnecessary. The frontend/backend/workflow separation supports relocation without replacing the actual automation. No public deployment, purchase, Git commit/push or Milestone C work is authorized by this milestone.

The automation classifies support tickets into SHIPPING, REFUND, BILLING, or GENERAL. It performs no refunds or other external customer actions.

## Architecture

```text
Webhook → Validate Ticket → Ticket Valid?
  FALSE → Respond to Webhook (400)
  TRUE → Prepare Ticket Claim → Fingerprint Ticket → Fingerprint Valid?
    → Claim Ticket → Interpret Claim Result → Route Claim Result
      NEW → Classify Ticket → Validate AI Result
            → Prepare Ticket Outcome → Save Ticket Outcome
      DUPLICATE → Read Existing Ticket → Resolve Existing Ticket
      FAILURE → Prepare Public Response (503)
      unexpected / routed errors → Prepare Persistence Error
    → Prepare Public Response → Respond to Webhook
```

Expected error paths share the same response node. Invalid fingerprints never reach MySQL or AI. The valid-ticket path cannot bypass database claiming.

## Technology stack

- n8n 2.42.6 in Docker, using built-in nodes and small JavaScript transformations.
- MySQL 8.4/InnoDB: existing `ai_support_portfolio.tickets` and `ticket_audit`.
- Local Ollama model `qwen3:4b-instruct`.
- Dependency-free Node.js tests, verified with Node.js 24.

## Duplicate prevention and transactions

The ticket ID is a database primary key. SHA-256 hashes `JSON.stringify([ticketId, customerEmail, message])` after existing validation/normalization. Timestamps and policy metadata are excluded so identical retries remain stable.

The claim transaction inserts a PROCESSING ticket, or makes no change to an existing ID. Only the owning execution inserts TICKET_CREATED and calls AI. The transaction returns persisted ownership and the audit insertion count after commit. Error 1062 alone is never treated as evidence of a ticket duplicate.

- Same ID and fingerprint: replay stored state without another model call or duplicate audit writes.
- Same ID, different content: HTTP 409; stored content is preserved.
- Concurrent identical requests: one owner; another request may receive PROCESSING/202 until completion.
- Finalization updates only the owning execution’s PROCESSING ticket. Ticket update and final audit insertion share one transaction; both affected-row counts must equal one before reporting success.
- Invalid/UNKNOWN AI output persists PENDING_REVIEW and HUMAN_REVIEW_REQUESTED before returning 202.
- A model error persists FAILED and MODEL_UNAVAILABLE before returning 503. No uncalibrated confidence threshold is used.

The audit table remains append-only for runtime writes. Its unique `(ticket_id, event_key)` prevents duplicate events and its foreign key prevents orphan history. Intake milestone audit writes were verified by MySQL affected-row counts. Milestone A added column-scoped audit SELECT for decision replay; synthetic decision audits were also independently inspected during its tests.

## HTTP responses

| HTTP | Meaning |
|---|---|
| 200 | Completed classification or identical completed replay |
| 202 | PROCESSING or persisted PENDING_REVIEW |
| 400 | Invalid input or database field-length limit |
| 409 | Existing ticket ID with different normalized content |
| 503 | Dependency failure, ambiguous claim result, or failed persistence |

Public output excludes SQL, driver errors, credentials, fingerprints, fingerprintInput, and execution metadata. The separate authenticated DEV reviewer endpoint is described below.

Webhook validation requires a ticket ID, a valid email, and a nonempty message. Preparation also checks the database character limits and the message's 65,535-byte UTF-8 limit before insertion. Ollama receives the ticket message; its output must contain an allowed category and a nonempty reason. A valid classification proceeds automatically. Malformed or UNKNOWN output requests human review without an unverified confidence score.

Review requests are persisted in the ticket and audit tables. The authenticated DEV decision endpoint is implemented; a reviewer UI, notifications, and public demonstration remain unfinished.

## Milestone A: authenticated human-review decisions

`Portfolio 1 - Human Review Decisions - DEV` (`2fC4kymKXdm0o3sz`) uses seven built-in nodes:

```text
Authenticated Review Webhook → Validate Review Decision → Review Decision Valid?
  FALSE → Respond to Review
  TRUE → Commit Review Decision → Resolve Review Decision → Respond to Review
           error → Prepare Review Error → Respond to Review
```

The POST path is `/webhook/support-ticket-review-dev`. Built-in Header Auth checks the dedicated encrypted `Portfolio 1 - DEV Reviewer 1` credential before the workflow handles a request. It maps to the fixed server identity `portfolio-dev-reviewer-1`. This is one authorized DEV reviewer, not a multi-user identity system. Client-supplied identity and unknown fields are rejected. Do not put authentication values in workflow JSON, screenshots, terminal commands, or source files.

Input requires `ticketId` (1–128 Unicode code points), `decisionId` (1–64 ASCII letters/digits/underscore/hyphen), `decision` (`APPROVE` or `REJECT`), and `reason` (1–500 Unicode code points). APPROVE also requires SHIPPING, REFUND, BILLING, or GENERAL in `category`; REJECT must omit `category`. Surrounding ticket/reason whitespace is normalized. Decision IDs are scoped to a ticket. Rejection records a classification-review decision; it performs no customer action.

The transaction locks the ticket, updates only PENDING_REVIEW with `requires_review=1`, clears the review flag, and inserts `HUMAN_REVIEW_DECIDED` using the unique event key `HUMAN_REVIEW_DECISION:v1`. The audit stores authenticated reviewer identity, decision ID, normalized decision content, previous/new state, and reviewer execution ID. Ticket content, fingerprint, intake execution owner, and policy version remain unchanged. The locking read serializes simultaneous decisions, so only one terminal decision wins. An audit insertion error rolls back the ticket update.

Identical reviewer/request/content retries return the persisted result with `replayed=true`; changed content or competing requests return 409 without mutation. Decisions are terminal: reopening and re-review are outside this milestone. HTTP responses are 200 success/replay, 400 invalid input, 403 failed authentication, 404 missing ticket, 409 conflicting/nonpending state, and sanitized 503 persistence failure. A lost commit acknowledgement remains ambiguous until an identical retry resolves the durable state; an actual connection-loss test has not been performed.

Only DEV intake's existing `Prepare Public Response` node changed: identical intake retries of APPROVED and REJECTED tickets now return HTTP200 with preserved original ticket fields and no AI/outcome write. Existing intake routing and 18-node structure are unchanged. ORIGINAL has not received this compatibility change; do not apply DEV decisions to ORIGINAL tickets. DEV and ORIGINAL currently share tables, so this is a usage restriction rather than database-enforced isolation.

No schema changes were needed. The existing runtime account received only:

```sql
GRANT SELECT (ticket_id,event_key,event_type,new_status,reviewer_id,details)
ON ai_support_portfolio.ticket_audit
TO 'n8n_support_portfolio'@'172.17.0.1';
```

No audit UPDATE/DELETE, schema, or global privileges were added. Existing ticket column UPDATE permissions suffice. Imports of `workflows/human-review-dev.json` require selection of the project MySQL and dedicated Header Auth credentials. The portable export contains no credential references or secrets and is inactive.

Security finding: this installed Webhook implementation saved the authentication header in node history despite an internal redaction marker. The reviewer now disables success/error execution-data retention, execution progress saving, and manual execution saving. Integration tests verified no new saved reviewer executions. MySQL is the durable review audit. The generated key was rotated after discovery; approved cleanup permanently removed exactly 41 confirmed synthetic reviewer histories (11195–11208,11211–11219,11222–11239), each verified404 afterward. The existing signed-in Codex n8n UI supplied precise deletion after API DELETE403 and a separate editor-session401. A fresh key rotation verified previous/exposed keys403 and the new key200; all 40 tickets/76 audits and6595 baseline unrelated histories remained unchanged by content/metadata hashes. No API scopes changed. The credential-create API returned HTTP403, so provisioning used supported `n8n import:credentials`, stdin, a temporary mode-600 file removed on exit, and n8n's encrypted credential store. No Docker settings changed.

Run isolated tests before explicitly authorized local integration tests:

```powershell
node 01-ai-support-ticket-system/tests/review-decision.test.mjs
node 01-ai-support-ticket-system/tests/review-integration.test.mjs
```

The integration runner rotates only the dedicated DEV reviewer key, temporarily publishes both DEV workflows, injects/restores a reviewer-only audit failure, and retains fresh synthetic `MILESTONE-A-*` fixtures. It requires local Docker CLI access for synthetic fixture creation/verification using the existing installation; workflows continue to use the restricted runtime credential. It does not print passwords or keys. Use `--provision` only for first-time setup: it applies the narrow grant, imports the credential, backs up DEV, creates the reviewer inactive, and patches the one DEV intake response node. Existing exports prevent accidental repeat provisioning. Tests never modify historical ticket records. Use n8n's credential UI for private credential management; public/demo credential delivery is not part of this milestone.

## Local setup

Reuse an existing n8n/MySQL/Ollama installation; provisioning and credentials are handled privately. No setup script creates databases or grants.

1. Provide the verified two-table schema and a restricted MySQL account. Intake needs ticket SELECT/INSERT, column-specific processing/classification UPDATE, and audit INSERT. Human-review replay additionally needs the narrow audit SELECT grant above. Neither workflow needs DELETE or schema privileges.
2. Import `workflows/ticket-intake.json` for the completed portfolio workflow. Import `workflows/ticket-intake-dev.json` separately for development. The exports use distinct webhook paths and intentionally omit credential references, pinned inputs, execution history, and instance-level workflow IDs.
3. Select the project MySQL credential and existing Ollama credential on the imported nodes. Keep root out of workflows.
4. Confirm the local model is available and keep the workflow inactive until its connections are reviewed.

The portfolio path is `/webhook/support-ticket-intake`; DEV uses `/webhook/support-ticket-intake-dev`. Do not run both against the same synthetic ticket IDs unless deliberately testing shared persistence. The previous three-node ORIGINAL export is preserved separately as a historical rollback artifact; it is not the completed implementation.

Schema prerequisite: `tickets` needs the case-sensitive `ticket_id` primary key, original email/message, SHA-256 fingerprint, execution owner, policy version, classification/review fields, processing status, and timestamps. `ticket_audit` needs an auto-increment audit ID, ticket foreign key, unique `(ticket_id, event_key)`, event/status/owner fields, JSON details, and timestamp. Both tables must use InnoDB and compatible utf8mb4 text encodings. This milestone does not include a database provisioning/migration script; obtain and review the exact schema before reproducing it in a fresh environment.

For automated tests, use the ignored repository `.env` with `N8N_API_URL` (for example `http://localhost:5678/api/v1`) and `N8N_API_KEY`. Required scopes are workflow list/read/update/activate/deactivate and execution list/read. Never commit real values. The integration runner targets the existing project DEV workflow ID; adapt that constant for a different import.

## Demonstration

For a local demonstration, review and temporarily publish only the selected workflow. POST JSON to `http://localhost:5678/webhook/support-ticket-intake` for the portfolio workflow, or use the DEV path for development:

```json
{
  "ticketId": "DEMO-UNIQUE-001",
  "customerEmail": "customer@example.com",
  "message": "I was charged twice for the same order."
}
```

Repeat the body to demonstrate replay; change the message under the same ID to demonstrate 409. Use a fresh synthetic ID for an independent ticket. A review walkthrough can show a sanitized PENDING_REVIEW result from a controlled DEV fixture, clearly labeled as simulated; it must not expose internal controls or the editor. Unpublish the selected workflow afterward. No public deployment exists yet.

## Automated tests

Run from the repository root:

```powershell
node 01-ai-support-ticket-system/tests/validate-ai-result.test.mjs
node 01-ai-support-ticket-system/tests/persistence-integration.test.mjs
```

The first runner tests the saved validation code in isolation. The second performs complete webhook tests and temporarily publishes DEV. It inserts identifiable synthetic records, retains them, and deactivates DEV in cleanup. It never deletes records.

```powershell
node 01-ai-support-ticket-system/tests/persistence-integration.test.mjs --faults
```

Explicit fault mode temporarily substitutes DEV model output, injects SQL transaction failures, or supplies an invalid fingerprint. It restores the functional DEV definition and deactivates it. It does not stop dependencies, change credentials, alter schemas, or reproduce a real service outage. `--smoke` runs one persistence case; `--edges` runs length, numeric-text, and quote-preservation checks.

## Important verified results

| Scenario | Verified result | Execution IDs |
|---|---|---|
| Milestone A isolated review/DEV replay logic | 33/33 passed; includes MySQL multi-result regression | N/A |
| Milestone A authenticated approval/rejection | 200; fixed reviewer identity and durable audit verified | 11282, 11286 (audit references; node history disabled) |
| Milestone A integration suite | 20 checks passed: auth403, validation400, replay200, conflicts409, missing404, concurrency, literal input, audit-failure rollback503, recovery200, no saved auth payloads | Final synthetic run `MILESTONE-A-1794178914308`; review IDs in MySQL audit |
| DEV intake terminal decision replay | APPROVED/REJECTED200; original fields; no AI/outcome writes | 11297, 11298 |
| Fresh intake regression after DEV patch | All 6 existing scenarios passed; new/replay/conflict/invalid/concurrency | 11266–11275 |
| Fresh saved-validator regression | 10/10 isolated tests passed | N/A |
| Milestone A security cleanup | Prior/exposed keys403; new key200; exactly 41 synthetic reviewer histories permanently deleted/404; zero reviewer histories remain; 6595 baseline unrelated histories and 40 tickets/76 audits preserved | Deleted11195–11208,11211–11219,11222–11239 |
| ORIGINAL invalid-ticket smoke | 400; FALSE branch only; no preparation, MySQL, or AI; one response | 10473 |
| ORIGINAL SHIPPING smoke | 200/SHIPPING; initial audit 1, ticket update 1, final audit 1; stored AUTO_ROUTED; one response | 10484 |
| New ticket/classification | 200; creation audit, one ticket update, final audit | 10154 |
| Identical replay | 200; no AI/outcome write; zero new creation-audit rows | 10155 |
| Conflicting payload | 409; original result preserved | 10156–10157 |
| Invalid input | 400; no MySQL claim or AI | 10158 |
| Concurrent identical requests | One owner/model call; 200/202; settled replay 200 | 10159–10161 |
| Concurrent conflicting requests | One owner/model call; one 409 | 10162–10163 |
| Injected malformed/UNKNOWN output | Persisted PENDING_REVIEW/202; safe replay | 10168–10171 |
| Injected model failure | Persisted FAILED/503; sanitized replay | 10172–10173 |
| Injected claim failure | 503; rollback/no AI; later same-ID request is NEW | 10174–10175 |
| Injected finalization failure | 503; update rolled back; PROCESSING/202 on retry | 10176–10177 |
| Invalid fingerprint | 503; no claim or AI | 10178 |
| Field length | 400 before insertion | 10188 |
| Numeric-looking strings | Leading zeros preserved in database and response | 10189 |
| Quoted SQL-like text | Stored as literal data; one final update/audit | 10190 |
| Isolated validator | 10/10 cases passed; not integration tests | N/A |
| Editor-warning investigation | 27/27 isolated saved-code checks passed, including Unicode limits and historical error replay; no new workflow executions | N/A |

Milestone A and the explicitly labeled fresh regressions were run on 2026-11-08. Earlier rows remain historical evidence and were not all rerun. Initial Milestone A runs failed: credential API403 (supported CLI fallback used), multiple MySQL result items (batch resolver fixed), emoji inspection mismatch (client utf8mb4 fixed), and saved authentication headers (key rotated and reviewer history disabled; earlier-history cleanup completed and verified). Final functional suites passed. Except for explicitly labeled ORIGINAL smoke tests and isolated checks, the execution table describes DEV integration tests. All four category examples also passed their initial classifier tests before persistence integration; that is historical coverage, not a guarantee for arbitrary messages. Execution IDs are evidence references only; execution payloads and database fixtures are not included in the repository. The 27-case editor investigation used a separate local diagnostic harness, not an additional committed test runner.

## Operational limits and recovery

- Interrupted executions/finalization failures can leave PROCESSING. Inspect the owning execution and ticket before a separately authorized, audited recovery. Do not blindly reset status, steal claims, or rerun AI. The rollback test deliberately retains one such synthetic record.
- FAILED model outcomes also require deliberate recovery; replay returns 503.
- Actual service outages, connection loss during commit, and bounded Ollama timeouts were not induced. The native Ollama node has no explicit request timeout configured.
- The installed MySQL v2.5 sorts placeholder bindings and strips SQL newlines. Queries use unique sequential placeholder numbers and normalized whitespace. Temporary parameter prefixes prevent numeric-looking text conversion; SQL strips the prefixes before storage.
- Intake webhooks have no workflow-level authentication; the DEV reviewer uses Header Auth. Review private database networking, TLS, authentication, rate limits, and retention before public deployment. No public employer-facing endpoint is deployed. Legacy reviewer workflows are unrelated and remain untouched.
- Make project-only database backups privately before significant changes. Keep dumps, credentials, execution payloads, and customer records out of Git.

## Session-scoped demo ticket workspace

The separate portfolio website now displays recently submitted tickets for the current browser session, saved classification/status and a chronological persisted audit timeline. Local backend POST /api/demo/ticket-status accepts only a request UUID; the trusted signed session derives the full DEMO ticket ID. It never trusts a browser-selected stored ticket ID. Session workspace identifiers scope the local request list; the browser stores at most25 UUIDs, while details are fetched from MySQL. Requests from another session derive a different key and return404. Expired sessions cannot recover old tickets through this UI. No search/browse of unrelated demo or original records is available.

New workflow: Portfolio 1 - Ticket Lookup - DEMO, ID PVdtTRajigUX0gs8, seven nodes (Authenticated Demo Ticket Lookup; Validate Demo Ticket Lookup; Demo Lookup Valid?; Read Demo Ticket and Audit; Prepare Demo Ticket Detail; Prepare Demo Lookup Error; Respond to Demo Lookup). Header authentication occurs before SQL. A parameterized SELECT targets only demo tables and returns up to50 audit rows ordered by audit ID. Existing encrypted demo credentials reused; success/error/manual/progress history saving disabled. No model call or database write occurs in lookup. Approved permission delta: SELECT on ai_support_portfolio_demo.ticket_audit for portfolio_demo_runtime@%; all other grants unchanged, original-table reads still denied. No schema changes. Export: workflows/ticket-lookup-demo.json (inactive, credential references removed).

Commands: node 01-ai-support-ticket-system/demo/manage.mjs activate-lookup or deactivate-lookup manage only the lookup workflow. Existing activate/deactivate commands still manage only intake DEMO. Never rerun provision. Both workflows and the backend are currently running under the user’s explicit hands-on testing authorization.

Verification2026-11-12: lookup isolated suite8 subtests plus parent PASS; existing34 backend checks PASS, both using upstream fixtures. Actual desktop submission200/BILLING, intake execution16314; MySQL verified exactly TICKET_CREATED and AI_CLASSIFICATION_ACCEPTED. Workspace reload/timeline PASS; different-session lookup404; arbitrary-ID400; unauthenticated webhook403. Original data and protected workflows unchanged; zero saved lookup histories. Initial restricted local test attempt hit EACCES; rerun with local-network permission passed. No claim of real reviewer actions.

Future human review requires separate authorization: a demo-only review workflow/account scope, reviewer authentication distinct from requester sessions, fixed server-side reviewer identity, pending-only transactional update with unique durable decision audit, and race/replay/rollback tests. Do not connect the requester-facing UI to the existing reviewer DEV or expose its credential. No reviewer feature implemented here.

## Testing & Reliability Dashboard — separate results store

The portfolio now reads genuine stored test runs from isolated ai_support_portfolio_test_results.test_runs/test_results using a SELECT-only reader. A private SELECT/INSERT collector imports attributable artifacts without rerunning tests and captures only fixed allowed jobs; evidence is transactional/append-only with duplicate replay and conflicting-import rejection. No ticket database or workflow changed. Local results history distinguishes actual infrastructure, isolated/mocked checks, historical dates and unknown/stale fingerprints. Source-count summaries are not combined into coverage totals.

Fresh checks for this milestone: structural15 PASS; bridge1 PASS; collector6 PASS including rollback-only results MySQL permissions/parity; browser19 PASS and8 explicit retired-operator SKIP, desktop/mobile; live read-only SQL/API/display and preservation checks PASS. No ticket writes or model/workflow integration reruns. Original/demo records and six workflow states/definitions unchanged. Existing local hands-on demo left running. Exact imports, run provenance, limitations and failures corrected are in the website README/handoff.

Run Safe Validation remains a required separately approved future feature: no on-demand execution endpoint or enabled button. Only a predefined non-destructive isolated subset is planned, with authentication/abuse limits, clean worker environment and actual results storage. Never give a future public worker ticket credentials, n8n activation permissions, arbitrary commands/targets or fault-injection access.

## Submission issues and failed attempts

The demo records safely observable rejected and failed submissions separately from saved tickets. **Submission activity and issues** shows session-owned, sanitized HTTP outcomes and timestamps. A validation rejection is not a pending-review ticket. Saved FAILED tickets remain visible with their real audit timeline; unconfirmed timeouts are labeled unconfirmed. Actual PENDING_REVIEW tickets wait for a separately authorized reviewer feature; requester approval/rejection is unavailable.

No rejected message/body/contact details/headers/tokens are stored in submission history. New demo-only metadata table and a dedicated SELECT/INSERT/DELETE account implement duplicate-safe records and24h expiry. Latest50 entries are visible within the existing30min session; total rows capped10000. Expiry cleanup runs while the application is running. If the application, logger or logging budget is unavailable, not every request is recorded; the UI reports unconfirmed history instead of promising persistence. Existing ticket and audit tables are unchanged. Old missing failures cannot be recreated.

| Verification (2026-11-12) | Actual result / scope |
| --- | --- |
| Error-history HTTP contracts |11 leaf PASS, mocked store/upstream |
| Website browser / bridge / structural |24 PASS+7 deliberate SKIP /1 PASS /15 PASS |
| Browser-to-actual infrastructure history checks |9 PASS, real backend/MySQL/n8n/Ollama |
| MySQL history concurrency / restricted UPDATE |2 PASS, new synthetic metadata only |
| Existing ticket/audit preservation |Original full-row hash and6 workflow resources unchanged |

One real synthetic ticket returned200/AUTO_ROUTED/BILLING; independent MySQL verification found TICKET_CREATED and AI_CLASSIFICATION_ACCEPTED, execution16668. A rejected400 attempt persisted without a ticket, survived reload and was invisible to another session. Processing-failed, pending-review and logger-unavailable branches were tested with isolated fixtures, not induced real outages. Full execution histories remain disabled; use actual durable audit evidence. No new reviewer actions, public execution or public deployment.

Safe isolated command from repository root: node --test 01-ai-support-ticket-system/tests/demo-submission-history.test.mjs. Backend now needs npm.cmd install --prefix 01-ai-support-ticket-system/demo --ignore-scripts and existing machine-private DPAPI history configuration; never copy credentials into source. Startup remains node 01-ai-support-ticket-system/demo/server.mjs. New submission-history.sql documents authorized one-time DDL only; do not rerun provision or change existing workflow schemas.

## DEMO business escalation policy — verified 2026-11-12

AI classification and business routing are separate. The new **Evaluate Escalation Policy** Code node runs after **Validate AI Result**, before **Prepare Ticket Outcome**. A valid category can remain REFUND while the saved status is PENDING_REVIEW. AUTO_ROUTED requires valid AI output and completed policy checks with no enabled escalation signal. HTTP400 input rejection and HTTP503 infrastructure failure retain their existing behavior; they are not converted into review tickets.

Trusted configuration lives in demo/escalation-policy.mjs and is embedded into the published DEMO node by tests/policy-workflow.mjs. Editing the source alone does not hot-reload n8n. Current policy version: demo-escalation-v2. All six rule switches are enabled; they are not browser settings. Future configuration changes require intentional review/versioning and DEMO republishing. No refund threshold or currency mapping has been invented: refundThreshold/refundCurrency are null and symbolCurrencies is empty.

| Rule | Escalates | Does not escalate solely for |
| --- | --- | --- |
| Unverified approval | Affirmative manager/supervisor approval of a support remedy/request | Unrelated manager/vacation mentions; denied approval; approval questions |
| Monetary refund | Explicit refund claim/request with an amount; missing threshold/currency policy requires review | A product-price mention or general refund-policy question |
| Configured monetary limit | Amount strictly above configured limit; ambiguous/mismatched currency/amount requires review | Verified same-currency amount at or below limit, absent other rules |
| Policy exception | Request to make an exception or waive/bypass a policy | Ordinary policy inquiry or explicit denial of an exception request |
| Fraud/payment dispute | Fraud/unauthorized-payment allegations, formal disputes, chargebacks | Negated allegations or prevention/definition questions |
| Legal action | Reported/threatened litigation; conditional first-person threat also escalates | Negated threats or explicitly hypothetical examples |
| AI/policy uncertainty | Unsupported/malformed/explicitly uncertain AI; missing or invalid required policy configuration | Valid low-risk classification with completed checks |

Examples: “Your manager approved my refund” escalates; “Your manager has not approved my refund” and “If your manager approved a refund, how would returns work?” do not trigger approval escalation. “If you refuse, I will sue” still triggers legal review. Negation/hypothetical handling is sentence/contrast-scoped, not a blanket keyword exclusion. Rules are bounded English pattern checks: paraphrases, quotations, sarcasm, complex negation, multilingual text and multiple monetary amounts can cause missed signals or conservative false positives. This demonstrates explainable triage, not proof of approval or a production-complete risk detector. Explicit low/uncertain model markers are handled; model confidence is not calibrated.

The original problematic message now returns HTTP202, REFUND, PENDING_REVIEW, requires_review=1. Its saved review reason identifies both an unverified approval claim and a monetary refund claim with unconfigured policy. Independent MySQL evidence: execution16740; TICKET_CREATED and HUMAN_REVIEW_REQUESTED; stable FINAL_OUTCOME:demo-escalation-v2. The existing transaction saves classification, review fields, status/version and one outcome audit together. Audit details add fixed policyCodes and the static review explanation, without copying the customer message. Existing payload fingerprint/claim ownership and pending-only outcome UPDATE are preserved. Historical tickets are replayed, not re-evaluated or overwritten. No schema/grant/credential changes.

Modified intake nodes: Classify Ticket (UNKNOWN/uncertainty instruction), Validate AI Result (explicit uncertainty fallback), Prepare Ticket Claim (version), Prepare Ticket Outcome (independent decision/invariants), Save Ticket Outcome (policy-code audit parameter), Prepare Public Response (retain valid pending category/reason). Added node: Evaluate Escalation Policy. Lookup nodes changed: Read Demo Ticket and Audit; Prepare Demo Ticket Detail. Existing lookup now returns saved reviewReason and policyVersion; backend, local proxy and both UIs sanitize/display them after refresh. No reviewer actions enabled.

| Fresh test group | Verified result and boundary |
| --- | --- |
| Policy + workflow logic |53 PASS:42 pure table cases and11 isolated node/SQL-configuration checks; no real SQL in this group |
| Actual local UI/n8n/MySQL/Ollama |11 PASS, including original case, normal refund, manager/negation/hypothetical negatives, reload,409 conflict, retry and concurrent direct n8n claims |
| Controlled workflow fallbacks/replay |12 PASS: per-new-ticket AI fixtures, FAILED replay, changed-version replay, actual fraud/legal/exception/dispute cases, no saved execution histories, restoration |
| Existing backend / lookup / submission history |34 /8 /11 PASS, isolated upstream/store fixtures |
| Website browser / bridge / structural |25 PASS +7 retired-operator SKIP /1 PASS /15 PASS |
| Preservation |Original full-row hash unchanged; all197 pre-existing DEMO ticket/audit row hashes unchanged; four protected workflows unchanged; both DEMO exports match live |

An initial integration harness mistakenly reused a later test's request ID and failed the409 assertion. Corrected runner passed; genuine FAIL run84cdc40b-6c2f-466a-a03e-5d618c5d03e2 is retained in Testing & Reliability. Early builder syntax/path errors occurred before publication, were corrected, and are not counted as application PASS results. Controlled AI-unavailable tests inject an error item after the real model call for specific new synthetic IDs; no actual service outage or fresh SQL rollback fault was induced. Temporary fixtures were removed and normal DEMO restored active. Initial live receipts have unknown revision/fingerprint metadata; this is not treated as fresh revision proof. Original execution dates/outcomes are retained.

Safe isolated commands from this repository root:

    node --test 01-ai-support-ticket-system/tests/escalation-policy.test.mjs 01-ai-support-ticket-system/tests/policy-workflow.test.mjs

From the separate website directory, npm.cmd run results:capture -- escalation-policy executes and records these isolated checks. Operator-only integration commands (write new synthetic DEMO records, never public buttons): node tests/live-escalation-policy.mjs --allow-synthetic-write; node tests/policy-controlled-integration.mjs --allow-controlled-fixtures. The latter briefly republishes only DEMO with ticket-specific fixtures and restores its baseline; do not run casually during interactive use. Standard browser tests use fixtures. No historical ticket is a test fixture.

## Public-source boundaries

Historical installation backups (`workflows/*-before-*.json`), private runtime settings and local evidence are intentionally excluded and preserved locally. Reusable sanitized JSON under tests/fixtures is permanent regression input, not raw execution data. The historical demo/reviewer integration runners reference installation-specific private backups and credentials: they are not portable safe isolated tests and may not run from a clean clone without separately authorized setup. Use the documented pure policy/review tests for safe isolated verification. No public demo is deployed by committing these sources.

## Local safe-validation milestone

The integrated website now supports a local-only fixed validation button with actual persisted results. It runs only structural, isolated API/collector and fixture-backed browser checks; it never runs this project’s live workflows, model, ticket database tests or reviewer actions. Verified14 service checks and8 real execution/results-MySQL verification checks passed; the completed safe job saved53 PASS/9 intentional SKIP. Existing ticket services remain running. Final preview reload/smoke was intentionally not performed after minor parent-process refinements, per user stop request. See ../website/README.md and the existing root handoff for current runtime, actual evidence and limitations. No workflow/schema/credential changes, public deployment or Git commit/push in this milestone.
