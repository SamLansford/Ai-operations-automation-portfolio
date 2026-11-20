# AI Operations & Automation Portfolio

Practical automation projects demonstrating n8n, JavaScript, MySQL, AI integration and reliability testing.

## AI Support Ticket Automation

n8n sends fictional support tickets to Ollama for AI classification. Separate business rules route qualifying tickets to human review. MySQL stores the ticket lifecycle and its audit history.

The employer showcase has two views for the same demo session. **Customer View** submits tickets and displays their classification, saved status, and audit history. **Reviewer View** lets visitors approve or reject their own pending tickets with a required written reason. Decisions and audit events are saved together. The private reviewer workspace uses separate authentication.

- [Try the interactive support-ticket demo](https://folk-downloadable-jesus-tracker.trycloudflare.com/support-ticket/)
- [Project architecture and verified tests](./01-ai-support-ticket-system/README.md)
- [Milestone A testing explanations and evidence boundaries](./01-ai-support-ticket-system/docs/TESTING_GUIDE.md)
- Automated and focused live checks verified session isolation, safe retries, concurrent decisions, rollback and recovery, and saved review reasons.

The public repository excludes runtime credentials, databases, raw execution histories, local test artifacts and installation-specific backups. Published workflow exports omit credential references; runtime credentials are managed privately. Dedicated integration runners are installation-specific and require separate authorization; they are not public validation endpoints.

## Portfolio website

The [website source and verification notes](./website/README.md) are in website/. GitHub Actions runs website checks. The live demo is hosted separately.
