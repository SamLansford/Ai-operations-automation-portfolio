export const profile = {
  "name": "Sam",
  "handle": "SamLansford",
  "github": "https://github.com/SamLansford/Ai-operations-automation-portfolio",
  "resume": null,
  "email": null
};
export const projects = [
  {
    "id": "support-ticket",
    "number": "01",
    "title": "AI Support Ticket Automation",
    "category": "AI workflows",
    "summary": "Classify fictional support requests once. Persist the outcome and its audit together, with accountable human-review decisions.",
    "technologies": [
      "n8n",
      "JavaScript",
      "MySQL",
      "Docker",
      "Ollama"
    ],
    "status": "Locally verified",
    "mode": "Real local AI classification",
    "demoUrl": null,
    "reportUrl": null,
    "repository": "https://github.com/SamLansford/Ai-operations-automation-portfolio",
    "sourceDate": "2026-11-12",
    "sources": "Project README, root handoff and Milestone A testing guide",
    "problem": "Support queues need consistent triage without duplicate processing, lost outcomes or unaudited manual decisions.",
    "flow": [
      [
        "Validate",
        "A protected backend bounds fictional input and assigns a synthetic ticket ID."
      ],
      [
        "Claim & classify",
        "n8n claims the ticket in MySQL before asking Ollama to classify a new request."
      ],
      [
        "Persist & review",
        "A transaction saves the result and audit; unusable AI output waits for authenticated human review."
      ]
    ],
    "capabilities": [
      "AI ticket classification",
      "Input validation",
      "Duplicate and conflict protection",
      "Transactional MySQL persistence",
      "Audit logging",
      "Authenticated human review",
      "Automated testing"
    ],
    "challenges": [
      [
        "Retries must not become duplicate work",
        "A payload fingerprint and conditional claim replay identical requests and reject changed content."
      ],
      [
        "A result needs an audit",
        "Ticket updates and audit insertion share a transaction; failure tests check rollback."
      ],
      [
        "A demo must not reach unrelated data",
        "A separate schema, restricted account, synthetic identifiers and private webhook isolate the demo."
      ]
    ],
    "evidence": [
      {
        "label": "Backend checks",
        "count": 34,
        "date": "2026-11-11",
        "scope": "Local HTTP with mocked upstream plus a slow local timeout fixture; no model or database access."
      },
      {
        "label": "Demo integration checks",
        "count": 14,
        "date": "2026-11-11",
        "scope": "Real n8n, MySQL and Ollama. UNKNOWN/error cases deliberately substitute demo model output."
      },
      {
        "label": "Human-review logic checks",
        "count": 33,
        "date": "2026-11-08",
        "scope": "Isolated JavaScript fixtures; no n8n workflow or SQL execution."
      },
      {
        "label": "Reviewer integration checks",
        "count": 20,
        "date": "2026-11-08",
        "scope": "Actual local webhooks and MySQL with synthetic tickets, concurrency and audit rollback."
      }
    ],
    "limits": [
      "The interactive demo is local only, not publicly deployed.",
      "Actual service outages and connection loss during commit remain untested.",
      "Reviewer/demo node histories are intentionally unsaved; durable audits and recorded output supply evidence."
    ],
    "walkthrough": [
      "Choose a fictional ticket example in the separate local demo.",
      "Submit through a protected backend to actual n8n, MySQL and Ollama.",
      "Inspect AUTO_ROUTED or PENDING_REVIEW, then demonstrate safe replay."
    ],
    "repoNote": "Source and sanitized testing documentation are available in the project repository. Runtime secrets and raw local artifacts remain private."
  }
];
