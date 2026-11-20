# Automation Portfolio Website

An employer-facing showcase for AI Support Ticket Automation: real synthetic ticket submission, session-owned ticket lookup, persisted audit history, and a read-only Testing & Reliability dashboard. [Open the live support-ticket demo](https://sam-automation-portfolio.tailaacf08.ts.net/support-ticket/).

## Pages and functionality

- Home/projects: AI Support Ticket Automation only. Project card opens the embedded demo.
- /support-ticket/#demo: 18 realistic fictional ticket examples, real classification and a current-session ticket workspace. Up to25 recent request UUIDs are indexed in browser storage; saved details and up to50 chronological audit events come from MySQL. Signed session-derived keys enforce ownership. Session expires after30 minutes; old records remain preserved.
- /support-ticket/#reliability-dashboard and /reports/reliability/: read-only stored test runs, individual outcomes, categories, environment/dependency scope, dates, durations, revision/fingerprint availability, supporting evidence and history.
- /evidence/: separately labeled historical project case explanations.
- /reports/: generated sanitized report availability. These recorded reports are not health monitoring.
- /404.html: not-found handling.

All GitHub links lead only to the approved support-ticket repository. No profile/other-repository links are included. Résumé/contact details remain deferred.

## Testing & Reliability architecture

Trusted operator CLI → isolated MySQL results database → reader-only backend API → dashboard.

Database ai_support_portfolio_test_results contains test_runs and test_results. Runs have UUIDs, original execution/observation dates, environment, dependency mode, provenance, nullable duration/revision, artifact/code fingerprints and limitations. Leaf results contain actual PASS/FAIL/SKIP/ERROR, category tags, optional duration, allowlisted errors and bounded evidence. No third table is needed initially.

Normal operations are append-only. One transaction inserts a run and its results. Identical UUID/payload replay returns the existing run; changed content under an existing UUID is rejected. Counts are derived from leaf rows; parent groups are not double-counted. Categories overlap, so the UI never adds their totals into a coverage score.

Accounts portfolio_test_reader and portfolio_test_writer are restricted to existing container gateway172.17.0.1. Reader has SELECT on the two results tables; writer has SELECT/INSERT only. Both are denied original/demo ticket-table access, UPDATE and DELETE. No Docker, n8n, ticket schema or existing credential changes. New .env.results-reader.json and .env.results-writer.json are ignored, ACL-restricted and Windows DPAPI-protected; they are not copied to dist/artifacts. Different operating systems/users need separately authorized secret provisioning.

Read APIs: GET /api/reliability/runs (bounded limit/cursor), GET /api/reliability/runs/:uuid. Methods other than GET are405. No arbitrary HTTP ingestion, commands or user-selected targets are supported. The separately controlled local Safe Validation routes below now provide fixed execution. Origin/Host checks, read concurrency/rate bounds, prepared SQL, response allowlists and sanitized errors apply. Only the reader account is used by the server.

## Collector and evidence

Private CLI examples, run from this repository:

    node scripts/collect-test-results.mjs import structural .local-reports/import-source/structure.json
    node scripts/collect-test-results.mjs capture structural
    node scripts/collect-test-results.mjs capture bridge
    node scripts/collect-test-results.mjs capture collector
    node scripts/collect-test-results.mjs capture browser
    node scripts/collect-test-results.mjs capture results-read

Import only reads an existing artifact; it never starts tests. Capture accepts fixed allowlisted jobs with a120-second deadline, never arbitrary command strings. A failed/errored capture is stored and exits unsuccessfully. Unchanged old runner artifacts are not mistaken for a newly executed run. Actual DB verification requires explicit local RESULTS_DB_TEST=1; its isolated fixture inserts are rolled back and never exposed as genuine automation evidence.

Five preserved historical artifacts were imported without rerunning them: structural15 checks, browser24, embedded demo5 receipt-backed assertions, reliability12 receipt-backed assertions, ticket workspace8 receipt-backed assertions. These are separate, overlapping runs—not summed coverage or execution counts. Original timestamps are retained. Missing start times/durations/revisions remain absent; old evidence has UNKNOWN freshness. Conversation-only counts and unarchived failures were not reconstructed into fabricated records.

New captures preserve actual outcomes, including eight explicitly skipped retired operator UI checks. CURRENT means the captured selected source/config fingerprint matches now, not production reliability. STALE means that fingerprint differs. Historical provenance is separate from freshness. Historical pre-publication runs have no Git revision; those missing revisions are not retroactively invented. The website now shares the automation repository main branch under website/. No CI execution is claimed.

FAIL/SKIP/ERROR/empty/outage rendering is tested with isolated fixtures. Those fixtures are not committed to the results database. No intentional failure or n8n fault injection was performed just to populate history. Raw logs, authentication headers, secrets, absolute source paths and customer payloads are not ingested.

## Verification completed on2026-11-12

- Structural15/15 PASS.
- Desktop browser suite19 PASS and8 SKIP; includes desktop1440 and mobile390 dashboard layout checks. Skips are retired operator-only controls, not hidden failures.
- Bridge security1 PASS.
- Collector suite6 PASS with the explicit local DB opt-in: outcomes/sanitization, invalid timestamps/private names, historical attribution/missing evidence, timeout/skip/error conversion, real rollback-only MySQL parity/duplicate/conflict/permissions.
- Committed historical import replay verified; conflicting reimport rejected with original digest unchanged.
- Actual reader SQL/API/display parity, cursor pagination, GET-only boundaries, invalid limit/origin/private-config denial, disabled validation control, current/historical labeling and existing connected ticket UI passed. No ticket submission occurred in this milestone.
- Actual desktop/mobile screenshots inspected; ego-browser confirmed a historical real-integration run with UNKNOWN freshness and disabled execution.
- Original ticket hash, demo ticket/audit counts and all six n8n workflow baselines verified unchanged. No stored renderer fixtures remain.

Corrected issues: PowerShell5 module loading prevented the first DPAPI attempt after empty tables were created; resumed safely with existing PowerShell7, without dropping/recreating data. A read probe checked readiness too early; corrected to await the existing connection check. Visual inspection caught a SKIP badge class collision; fixed. Standalone report generation now treats explicit skips separately rather than calling them incomplete. No outstanding test failure is known. The early manual probe failure was not imported as a fabricated dated run.

## Run Safe Validation — local implementation

The feature is implemented locally; no public endpoint is deployed. Opt in with SAFE_VALIDATION_ENABLED=1 when starting the local Node preview. The service uses loopback binding, exact origin/host checks, a short-lived HttpOnly session/CSRF, fixed commands, empty request bodies, UUID replay protection, one job, quotas and timeouts. Visitors cannot select test targets or modify tickets/workflows. Existing read APIs remain read-only; only the trusted collector appends actual results to its existing restricted tables.

The allowlist runs website structure, isolated API security, pure collector tests (database integration OFF) and fixture-backed desktop browser tests in temporary source-only workers without private configuration. Results are labeled ISOLATED/MOCKED and include failures, skips, errors, durations and individual cases. No n8n, model, ticket database, credentials, reviewer actions or destructive integrations are exercised. The button is disabled when dependencies/results storage are unavailable. Output and Node memory are bounded; one browser worker and deadlines limit execution. This is trusted local software containment, not an OS sandbox or a public hosting security guarantee.

Verified:14 service-security checks PASS; real button-to-results-MySQL8 verification checks PASS. The completed four-group button job saved53 PASS/9 intentional SKIP. Genuine early failures remain inspectable; a100ms operator-only timeout fixture was killed and its ERROR/TIMEOUT independently read from MySQL. See [Hosting and integration](./docs/HOSTING_AND_INTEGRATION.md) for integration scope and deployment boundaries. Only this results database was written; no schema/grant changes.

The current preview is http://127.0.0.1:4176/reports/reliability/; the original4173 website and8787 backend remain unchanged. Existing private results settings are read through operator-only PORTFOLIO_RESULTS_CONFIG_DIR; none were copied into this source tree. Final metadata/cleanup refinements passed isolated checks but the preview was not reloaded afterward, at the user's request. No additional test cycle or runtime cutover was performed. Changes are uncommitted; public deployment/human-review workspace remain out of scope.

## Publication boundary

Cloudflare static hosting configuration and future private backend boundaries are documented in docs/HOSTING_AND_INTEGRATION.md. Hosting CSP permits same-origin framing only for demo-frame; local preview applies the matching policy. Static hosting does not run MySQL/n8n/Ollama or this Node read API. Public deployment, purchases, credential relocation, commits/pushes and further milestones require separate approval. No public deployment occurred.

## Reliable recording and failure review — current behavior

Use npm.cmd test and npm.cmd run test:browser. These now automatically collect/store the suites they execute, even when a check fails or throws; the standard test command continues to capture later fixed suites instead of losing their results after an earlier failure. Private results:capture also supports backend (34 isolated HTTP checks) and lookup (8 leaf checks, not their parent) plus the existing fixed suites. Direct ad-hoc Node/Playwright invocations outside these wrappers are not automatically intercepted; use the documented wrappers. Earlier runs without preserved artifacts cannot be retroactively fabricated.

Each captured run is sanitized and saved first in ignored .local-reports/results-outbox. Database-unavailable outcomes remain LOCAL_PENDING, never discarded; npm start/dev privately retries them before starting the reader-only server. npm.cmd run results:retry retries manually. Delivered receipts prevent redundant delivery, and MySQL run-ID/digest checks preserve duplicate/conflict protection. CI configuration preserves this sanitized outbox as a separate artifact; no CI run/ingestion is claimed here. Normalized local evidence contains no credential/header/raw-log/customer fields.

The read-only Show runs filter offers Needs human review (FAIL / ERROR), with preserved individual status, sanitized error and available duration. It does not modify outcomes or record a reviewer decision. Actual dashboard regression71268863-5009-49ce-a356-d4fba71e2608 was recorded FAIL while the service was broken, and is intentionally retained after the fix. The loader defect was a dependency on Codex-bundled PowerShell absent from normal terminal PATH, compounded by inherited module paths. Existing credentials were not rotated or changed. The regression now passes under restricted PATH/module settings using Windows' built-in shell.

New verification covers offline FAIL/ERROR preservation and retry, local conflict rejection, nested leaf counts, native runner exceptions/timeouts, credential loading without Codex paths, and failure-review filtering. Offline/exception fixtures remain isolated test fixtures; they are not fabricated product failures. Real isolated backend34/lookup8 controls passed and were recorded. Run Safe Validation remains disabled; no on-demand execution endpoint or human-review mutation feature was enabled.

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

From this website directory, npm.cmd run results:capture -- submission-history runs and records only isolated HTTP checks. Existing npm.cmd run test:browser uses fixtures. Explicit operator-only node tests/live-submission-history.mjs --allow-synthetic-write creates a synthetic demo ticket and metadata, verifies actual services, and records sanitized outcomes; it is not a safe public button. Local history API POST /__local-demo/api/demo/submission-history accepts only an empty object and trusted session/CSRF. No arbitrary owner/SQL/command endpoint exists. Relevant verification receipts are in the existing private .local-reports directory and stored dashboard history, not public raw logs.

## Policy-sensitive ticket routing

The connected DEMO now separates AI category from deterministic business review. Valid REFUND can be PENDING_REVIEW for unverified approval or monetary refund claims, while ordinary refund inquiries can still AUTO_ROUTE. Saved review reason/policy version are returned by the authenticated DEMO lookup and shown after refresh. Current threshold/currency is intentionally unset; no customer approval action is available. Source project README documents the rule criteria, negative examples and limitations.

Fresh verification:53 isolated policy/node checks PASS;11 actual browser/n8n/MySQL/Ollama checks PASS;12 controlled workflow checks PASS; browser25 PASS/7 deliberate SKIP; backend34/lookup8/history11 fixture checks PASS. Original message actual audit16740 matches202/REFUND/PENDING_REVIEW and saved reasons. Controlled error outputs are per-new-ticket fixtures, not actual service outages. Four protected workflows and all197 prior DEMO ticket/audit row hashes preserved. Genuine initial harness FAIL84cdc40b-6c2f-466a-a03e-5d618c5d03e2 remains in stored results. No schema/permission/credential changes.

Safe recorded command: npm.cmd run results:capture -- escalation-policy. Operator-only synthetic integration: node tests/live-escalation-policy.mjs --allow-synthetic-write. Controlled fixtures: node tests/policy-controlled-integration.mjs --allow-controlled-fixtures (brief DEMO republication, then restoration; never an employer-facing button). New runs record actual failures too. No public validation or reviewer decision endpoint was enabled. Local demo remains available; public deployment/Git operations remain unauthorized.

## Unified repository layout and CI

Run all website commands from this repository’s website/ directory. GitHub Actions is configured at ../.github/workflows/website-tests.yml, uses website/package-lock.json for caching, and uploads website/artifacts/site and sanitized pending evidence only. It does not deploy. Private credentials, .env files, generated builds and local reports were not copied from the original standalone folder. That original folder and its running local preview are preserved; this source copy requires private local configuration before actual MySQL results can be read. Current integration tests use fixtures and retain LOCAL_PENDING evidence without database writes.
