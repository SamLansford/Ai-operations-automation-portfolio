// Sanitized case summaries reviewed against existing test source and recorded documentation.
export const testGroups = [
  {
    "label": "Backend checks",
    "source": "tests/demo-api.test.mjs",
    "method": "Actual local Node HTTP server; injected upstream fixtures. No n8n, MySQL or model execution.",
    "cases": [
      [
        "Valid fictional ticket",
        "A unique requestId, fictional=true and “For a fictional order I was charged twice. Please investigate.”",
        "Accept the request and return only safe result fields.",
        "Response keys matched category, reason, status and ticketRef.",
        "assert.deepEqual(Object.keys(out).sort(), [category, reason, status, ticketRef])",
        "Prevents private customer or infrastructure fields leaking to the browser."
      ],
      [
        "Reject personal information and invalid input",
        "Messages containing an email, URL or phone; short/1,501-character text; client ticketId; missing fictional acknowledgement.",
        "Validation rejects each input.",
        "validateBody returned false for each listed fixture.",
        "assert.equal(validateBody(changedBody), false)",
        "Keeps the demo fictional and bounds submitted data."
      ],
      [
        "Block foreign requests",
        "Foreign Origin, missing session cookie or invalid CSRF token.",
        "HTTP 403 before accepting a ticket.",
        "Each blocked request returned 403.",
        "assert.equal(response.status, 403)",
        "Prevents other sites from submitting requests through a visitor’s session."
      ],
      [
        "Duplicate and conflicting requests",
        "Repeat one requestId/message; then reuse the ID with changed text.",
        "Same request succeeds; changed content returns 409.",
        "Identical retry returned 200; changed message returned 409.",
        "HTTP status assertions; upstream persistence is a Map fixture, not MySQL.",
        "Avoids changing an existing ticket through a retry."
      ],
      [
        "Concurrent duplicate requests",
        "Two simultaneous identical POST requests using Promise.all.",
        "One upstream call; both requests succeed.",
        "Call counter increased by one; both responses were 200.",
        "assert.equal(calls - before, 1); pair.every(x => x.status === 200)",
        "Avoids duplicate model work when a visitor double-clicks."
      ],
      [
        "Timeout and rate limit",
        "A slow local HTTP upstream with a short deadline; separately, two requests against a one-request limit.",
        "Timeout 504 promptly; excess request 429.",
        "504 within one second; 429 with Retry-After: 60.",
        "Elapsed-time/status assertions and Retry-After header assertion.",
        "Bounds waiting time and protects limited compute capacity."
      ]
    ]
  },
  {
    "label": "Demo integration checks",
    "source": "tests/demo-integration.test.mjs",
    "method": "Actual local demo backend, complete DEMO n8n workflow and MySQL. Real Ollama on normal classification; fault cases explicitly substituted.",
    "cases": [
      [
        "Real classification and durable audit",
        "Fresh fictional duplicate-billing ticket through the protected demo API.",
        "200, BILLING, AUTO_ROUTED and exactly two matching audit events.",
        "Recorded 200/BILLING; saved message matched input; TICKET_CREATED and AI_CLASSIFICATION_ACCEPTED were present.",
        "Real SELECT checked status, category, synthetic email, message bytes, auditCount=2 and ordered event types.",
        "Proves classification is connected to durable storage rather than a frontend simulation."
      ],
      [
        "Database isolation and private webhook",
        "Attempt original-schema table reads using demo account; POST directly without webhook authentication.",
        "Original table access denied; unauthenticated webhook 403.",
        "Both original tables were denied; direct webhook returned 403.",
        "Permission probes plus assert.equal(response.status, 403).",
        "Keeps a demo visitor away from unrelated records and private automation access."
      ],
      [
        "Replay and conflict preserve stored data",
        "Repeat successful request; then same request ID with a different fictional message.",
        "Replay returns original result without audits; changed content 409.",
        "Replay deeply equaled first response; stored row unchanged after both requests.",
        "assert.deepEqual(response, first); assert.deepEqual(row(ticketRef), saved).",
        "Prevents retries or collisions from rewriting the original ticket."
      ],
      [
        "Concurrent demo submission",
        "Submit the same new request twice simultaneously.",
        "Both replies 200 with one persisted outcome.",
        "Replies matched and the saved ticket still had only two audits.",
        "Promise.all; response equality; independent MySQL auditCount=2 assertion.",
        "Checks duplicate protection across the real backend/workflow/database boundary."
      ],
      [
        "Uncertain classification goes to review",
        "Controlled classifier output: {\"category\":\"UNKNOWN\",\"reason\":\"Controlled synthetic model output\"}.",
        "202, PENDING_REVIEW and review-request audit.",
        "Recorded 202/PENDING_REVIEW; TICKET_CREATED and HUMAN_REVIEW_REQUESTED saved.",
        "HTTP assertions plus real MySQL status/event SELECT. Classifier node was temporarily substituted during the historical test.",
        "An unusable classification must wait for human review instead of routing confidently."
      ],
      [
        "Model failure is persisted and sanitized",
        "Controlled classifier error fixture, followed by repeating that failed request.",
        "503 with safe error; FAILED and MODEL_UNAVAILABLE saved; replay does not retry AI.",
        "Recorded 503/AUTOMATION_UNAVAILABLE; failed row/event sequence unchanged on replay.",
        "Exact response comparison and before/after MySQL row comparison. This was not a real Ollama outage.",
        "Reports dependency failure without leaking internal errors or silently repeating failed work."
      ]
    ]
  },
  {
    "label": "Human-review logic checks",
    "source": "tests/review-decision.test.mjs",
    "method": "JavaScript executed with fabricated n8n inputs in a local VM. No workflow, SQL transaction or authentication endpoint execution.",
    "cases": [
      [
        "Approval uses server identity",
        "Valid APPROVE request with BILLING and a reason.",
        "Prepared status APPROVED with fixed server-side reviewer identity.",
        "The isolated validator returned the expected status and server identity.",
        "Assertions in “approval and fixed server identity”; this does not test Header Auth.",
        "Stops the application from trusting a client-selected reviewer identity."
      ],
      [
        "Reject invalid decisions",
        "UNKNOWN approval category, invalid/missing fields, malformed body fixtures.",
        "400 for invalid decision input.",
        "Recorded validation assertions returned 400 for the invalid fixtures.",
        "assert.equal(validate(changedBody).httpStatus, 400)",
        "Prevents incomplete decisions from reaching persistence logic."
      ],
      [
        "Fail closed on inconsistent persistence output",
        "Fabricated database result with ticket update present but audit_rows=0.",
        "Resolver returns 503 rather than claiming success.",
        "Resolver returned 503.",
        "assert.equal(run(resolveDecision, inconsistentRow, prepared).httpStatus, 503)",
        "Avoids telling a reviewer that an unaudited decision succeeded; real rollback is tested separately."
      ],
      [
        "Sanitize SQL error",
        "Fabricated error containing private driver detail.",
        "Only safe REVIEW_UNAVAILABLE error and 503.",
        "Returned exactly {httpStatus:503,errorCode:REVIEW_UNAVAILABLE}.",
        "Deep equality of the entire returned object.",
        "Keeps internal database details out of public responses."
      ]
    ]
  },
  {
    "label": "Reviewer integration checks",
    "source": "tests/review-integration.test.mjs; docs/TESTING_GUIDE.md §3",
    "method": "Actual reviewer DEV webhook and MySQL with synthetic PENDING_REVIEW fixtures. Historical runs, not executed for this website change.",
    "cases": [
      [
        "Missing or wrong authentication",
        "APPROVE body with missing authentication, then intentionally invalid authentication.",
        "403; ticket and terminal-audit count unchanged.",
        "Recorded 403 for both; ticket remained PENDING_REVIEW, requires_review=1, UNKNOWN and zero terminal audits.",
        "HTTP status assertions plus independent DB SELECT. Empty execution history alone is not proof of unchanged data.",
        "Prevents unauthenticated ticket decisions."
      ],
      [
        "Approval commits ticket and audit together",
        "Synthetic pending ticket, decisionId=decision-1, APPROVE, BILLING and a synthetic reason.",
        "200; APPROVED, review flag cleared and one terminal audit.",
        "Recorded 200/replayed=false; APPROVED,0,BILLING,1. Durable audit reference 11282.",
        "DB SELECT and auditDetails checked fixed reviewer, previous/new status and matching reason.",
        "Makes the accepted decision accountable and durable."
      ],
      [
        "Identical decision is replayed",
        "Repeat exactly the committed approval.",
        "200/replayed=true without a second terminal audit.",
        "Recorded replay=true and exactly one terminal audit.",
        "HTTP replay flag assertion and DB count.",
        "Makes browser/network retries safe."
      ],
      [
        "Two competing decisions",
        "Two simultaneous decisions for one pending ticket with different IDs/categories.",
        "One 200 and one 409; exactly one terminal audit.",
        "Recorded status set [200,409] with one terminal audit.",
        "Promise.all; sorted status assertions; real DB count.",
        "Ensures only one decision wins a race."
      ],
      [
        "Audit insertion failure rolls back the ticket",
        "Synthetic pending fixture; historical test temporarily made the required audit event invalid with SQL NULL.",
        "503; ticket remains pending with no terminal audit.",
        "Recorded PENDING_REVIEW,1,UNKNOWN,0 after 503. Restored SQL then accepted the same decision with 200.",
        "Independent SELECT after failure and recovery request. Final audit rows alone cannot reconstruct the transient rollback observation.",
        "Prevents an approved ticket existing without its mandatory audit trail."
      ],
      [
        "Reviewed tickets replay through intake",
        "Replay original synthetic ticket fields after APPROVED and REJECTED decisions.",
        "200 with terminal status; no new classification or outcome write.",
        "Recorded APPROVED and REJECTED replies; execution references 11297 and 11298.",
        "Saved intake node data checked fields, no Classify Ticket/Save Ticket Outcome, and zero claim audit insertion.",
        "Prevents a customer retry from reclassifying a completed human decision."
      ]
    ]
  }
];
