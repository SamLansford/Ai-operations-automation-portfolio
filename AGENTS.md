# AI Operations & Automation Portfolio

## Development

- Prioritize working, reliable, employer-ready automation projects over unnecessary documentation.
- Before implementing a change, evaluate whether it improves functionality, reliability, maintainability, security, or hiring value.
- Reuse existing working workflows, configurations, and code where practical. Do not rebuild working components unnecessarily.
- Develop and test changes in separate DEV workflows before modifying original workflows.
- Back up existing workflows before making significant changes.
- Use exact n8n node names. Clearly distinguish executing the complete workflow from executing an individual node.
- Claim a test passed only when its actual results have been verified. Distinguish configuration inspection from runtime testing.
- Modify production workflows, Docker configurations, or credentials only with explicit authorization.
- Never expose secrets, API keys, credentials, or private data.

## Task Reporting

After each development or testing task, provide a concise, copy-ready Markdown report in the Codex conversation containing:

- Task completed.
- Overall status: PASS, FAIL, or PARTIAL.
- Changes made.
- Tests actually executed and their results.
- Execution IDs and HTTP status codes, when relevant.
- Unresolved issues.
- Next recommended action.

Clearly distinguish verified results from unverified assumptions. Do not automatically save task reports as separate files. Routine task reports belong in the conversation; important project milestones belong in the project README.

## GitHub Portfolio Documentation

- Use each project's README.md as its primary employer-facing documentation. Include a concise project description, architecture, technology stack, setup instructions, and demonstration instructions.
- Maintain a short table of important verified test results in the project README.
- Update the README when an important feature or test milestone is completed, not after every minor action.
- Use the existing tests/ folder for reproducible automated tests and related fixtures, not routine task reports.
- Use screenshots/ for useful workflow diagrams or screenshots.
- Create a reports/ folder only when a future project has a demonstrated need for it.
- Avoid unnecessary files, folders, reports, and documentation.

## GitHub Safety

- Inspect staged changes before committing.
- Never commit .env, API keys, credentials, or sensitive information.
- Commit or push changes only with user approval; do not do so automatically.
- Keep workflow exports synchronized with verified n8n behavior.
