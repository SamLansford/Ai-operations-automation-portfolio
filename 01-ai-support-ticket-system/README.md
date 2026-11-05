# AI Support Ticket Automation

**Status:** Completed 18-node implementation promoted from DEV to the portfolio workflow. ORIGINAL passed invalid-ticket and valid SHIPPING smoke tests; both workflows were left inactive. Public deployment and authenticated human-review decisions are future work.

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

The audit table is append-only for the runtime account. Its unique `(ticket_id, event_key)` prevents duplicate events and its foreign key prevents orphan history. Audit writes were verified by actual MySQL affected-row counts; independent audit-row reads were not performed because runtime access is INSERT-only.

## HTTP responses

| HTTP | Meaning |
|---|---|
| 200 | Completed classification or identical completed replay |
| 202 | PROCESSING or persisted PENDING_REVIEW |
| 400 | Invalid input or database field-length limit |
| 409 | Existing ticket ID with different normalized content |
| 503 | Dependency failure, ambiguous claim result, or failed persistence |

Public output excludes SQL, driver errors, credentials, fingerprints, fingerprintInput, and execution metadata. No reviewer endpoint is included in this project milestone.

Webhook validation requires a ticket ID, a valid email, and a nonempty message. Preparation also checks the database character limits and the message's 65,535-byte UTF-8 limit before insertion. Ollama receives the ticket message; its output must contain an allowed category and a nonempty reason. A valid classification proceeds automatically. Malformed or UNKNOWN output requests human review without an unverified confidence score.

Review requests are persisted in the ticket and audit tables. An authenticated reviewer decision interface, reviewer notifications, and a public demonstration have **not** been implemented.

## Local setup

Reuse an existing n8n/MySQL/Ollama installation; provisioning and credentials are handled privately. No setup script creates databases or grants.

1. Provide the verified two-table schema and a restricted MySQL account. Runtime needs ticket SELECT/INSERT, column-specific processing/classification UPDATE, and audit INSERT only. It does not need DELETE or schema privileges.
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

Except for the explicitly labeled ORIGINAL smoke tests and isolated checks, the execution table describes DEV integration tests. All four category examples also passed their initial classifier tests before persistence integration; that is historical coverage, not a guarantee for arbitrary messages. Execution IDs are evidence references only; execution payloads and database fixtures are not included in the repository. The 27-case editor investigation used a separate local diagnostic harness, not an additional committed test runner.

## Operational limits and recovery

- Interrupted executions/finalization failures can leave PROCESSING. Inspect the owning execution and ticket before a separately authorized, audited recovery. Do not blindly reset status, steal claims, or rerun AI. The rollback test deliberately retains one such synthetic record.
- FAILED model outcomes also require deliberate recovery; replay returns 503.
- Actual service outages, connection loss during commit, and bounded Ollama timeouts were not induced. The native Ollama node has no explicit request timeout configured.
- The installed MySQL v2.5 sorts placeholder bindings and strips SQL newlines. Queries use unique sequential placeholder numbers and normalized whitespace. Temporary parameter prefixes prevent numeric-looking text conversion; SQL strips the prefixes before storage.
- Webhooks currently have no workflow-level authentication. Review private database networking, TLS, webhook authentication, rate limits, and data retention before any public deployment. No public employer-facing endpoint is deployed.
- Make project-only database backups privately before significant changes. Keep dumps, credentials, execution payloads, and customer records out of Git.
