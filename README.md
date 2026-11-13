# AI Operations & Automation Portfolio

Practical automation projects demonstrating n8n, JavaScript, MySQL, AI integration and reliability testing.

## AI Support Ticket Automation

**Local implementation verified; not publicly deployed.** Classifies fictional support tickets, applies independent business-escalation rules, persists outcomes and audit events transactionally, and supports authenticated human-review decisions in a separate DEV workflow. The isolated employer demo includes session-owned ticket history and sanitized submission-error history.

- [Project architecture, setup, demonstration and verified tests](./01-ai-support-ticket-system/README.md)
- [Milestone A testing explanations and evidence boundaries](./01-ai-support-ticket-system/docs/TESTING_GUIDE.md)
- [Current project handoff](./PROJECT_HANDOFF.md)

The public repository excludes runtime credentials, databases, raw execution histories, local test artifacts and installation-specific backups. Published workflow exports omit credential references; private runtime setup is required. Dedicated integration runners are installation-specific and require separate authorization; they are not public validation endpoints.

## Portfolio website

The same repository contains the [website source, local setup and tests](./website/README.md) under website/. Run npm.cmd ci --ignore-scripts, npm.cmd run build and npm.cmd test from that folder. Root GitHub Actions runs website checks only; no deployment. Private reader configuration and local artifacts are excluded. The original standalone website folder remains preserved locally.
