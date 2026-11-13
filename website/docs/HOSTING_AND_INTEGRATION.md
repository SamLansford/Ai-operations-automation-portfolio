# Hosting and future integration

Research checked: November 12, 2026 (America/New_York). Findings come from official documentation. Architecture below is proposed; hosting, connectivity, and live demos have not been deployed or runtime tested.

## Recommendation

Start with **Cloudflare Pages Free** and its included `pages.dev` address. It serves the portfolio independently of future automation servers and permits adding a protected API later. **GitHub Pages** is a good alternative for a public website repository. This is a design recommendation based on documented features, not a measured uptime comparison. A third provider would add little value for this small static portfolio.

| Decision                     | Cloudflare Pages                                  | GitHub Pages                                                    |
| ---------------------------- | ------------------------------------------------- | --------------------------------------------------------------- |
| Initial static hosting       | Free static-asset requests                        | Included for public repositories on GitHub Free                 |
| Included URL                 | Project `pages.dev` subdomain                     | Account `github.io` domain; project sites add a repository path |
| Best fit here                | Static site with a possible future edge/API layer | Public portfolio with repository-based publishing               |
| Persistent automation server | Must be hosted separately                         | Must be hosted separately                                       |

## Verified hosting facts

Cloudflare documents free, unlimited requests to static assets when no Function runs. Pages Functions instead share Workers Free's 100,000-request daily allowance, resetting at midnight UTC. Functions have runtime constraints and are not an unlimited backend just because static hosting is free. [Pages pricing](https://developers.cloudflare.com/pages/functions/pricing/)

Cloudflare Free limits include 500 builds monthly, one concurrent build, a 20-minute build timeout, 20,000 files per site, 25 MiB per asset, and 100 custom domains per project. Keep large demonstration videos outside the site bundle. Cloudflare advertises unlimited bandwidth and SSL out of the box; this does not establish a measured availability guarantee. [Pages limits](https://developers.cloudflare.com/pages/platform/limits/), [Pages product overview](https://www.cloudflare.com/products/pages/)

GitHub Pages serves static HTML, CSS, and JavaScript from a repository. GitHub Free supports public source repositories; private-source Pages requires an eligible paid plan such as Pro or Team. An account site uses `<owner>.github.io`; project sites normally use `<owner>.github.io/<repository>`. Configure assets and links for that repository path if selected. [What is GitHub Pages?](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)

GitHub documents a 1 GB published-site limit, a soft 100 GB monthly bandwidth limit, and a soft ten-builds-per-hour limit; custom Actions publishing workflows are exempt from that build-frequency limit. GitHub excludes sites primarily facilitating commercial transactions or commercial SaaS. A personal employer-facing portfolio is a suitable use; review terms again if demos become commercial services. [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)

## Domains, HTTPS, and releases

A purchased domain is optional: start with the included provider address. Domain registration and renewal are separate from static hosting. Compare the exact name, extension, registrar, renewal charge, taxes, and premium status before buying; no fixed domain cost is assumed. Cloudflare Registrar describes at-cost registry/ICANN-based registration and renewal. [Registrar overview](https://developers.cloudflare.com/registrar/)

Cloudflare Pages requires a Cloudflare zone and Cloudflare nameservers for an apex domain such as `example.com`. A subdomain can use external DNS and a CNAME. First associate the hostname in the Pages dashboard; adding DNS alone is insufficient. Restrictive CAA records can prevent certificate issuance. [Pages custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/)

GitHub Pages supports HTTPS for correctly configured custom domains. Published files are publicly accessible even when the source repository is private in the usual configuration. Never put credentials or private data in frontend code, build output, screenshots, or example files. [GitHub HTTPS guidance](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)

Cloudflare Git integration normally deploys on pushes and allows automatic deployments to be disabled. Select release controls deliberately during a later authorized hosting task. No repository was connected, automatic deployment enabled, domain bought, or DNS changed during this research. [Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/)

## Proposed trust boundaries

```text
Untrusted browser → HTTPS static portfolio
                  → protected demo API
                        → private DEV n8n workflows
                        → private MySQL demo data
                        → private Ollama / approved AI service
```

This is a proposal, not an inspection of existing infrastructure. The API should validate input and enforce request-size, rate, concurrency, and spending limits. Keep credentials server-side. Use authentication for restricted demos and abuse controls for deliberately anonymous ones. Expose only narrow operations and sanitized results. CORS restricts browser origins; it does not authenticate arbitrary callers.

Keep the n8n editor/admin API, MySQL port, and Ollama endpoint private. Permit only necessary service-to-service access using private networking or an authenticated tunnel. Use isolated DEV workflows, separate demo credentials, and synthetic data. n8n documents SSL, access restrictions, security auditing, and execution-data redaction. Ollama documents local operation and configurable network binding; a reachable listening endpoint does not establish an access-control system. [n8n security](https://docs.n8n.io/deploy/host-n8n/configure-n8n/security.md), [Ollama FAQ](https://docs.ollama.com/faq)

Continuous demos need separately budgeted, always-running compute or suitable managed services, persistent storage, backups, patching, and monitoring. Ollama resources depend on model size and CPU/RAM/GPU needs. Static hosting and temporary CI build jobs do not provide an always-on n8n/MySQL/Ollama server. Until that infrastructure is authorized and tested, label demos as planned and offer synthetic examples or recordings.

## Future routes and integration


Alternatively, link to a separate demo host such as `demo.example.com`. This keeps the portfolio available when a demo server is offline. Cross-origin API calls require an explicit origin policy and suitable authentication. Choose after confirming the backend environment, then verify isolated DEV workflows before any production change. Existing automations, Docker configurations, credentials, and production services were neither accessed nor modified for this research.

## Concrete release proposal — desktop showcase

Prepared static target: Cloudflare Pages, Node 24, install npm ci --ignore-scripts, build npm run build, output dist. _headers scopes frame-ancestors self only to demo-frame; ordinary pages deny framing. The local preview applies equivalent CSP so embedding is tested under that policy. Functions need their own response headers. Run the website checks and generate sanitized reports before preparing artifacts. No hosting project is connected.

Public live-demo gateway is a separate approval gate: choose an always-on backend host/budget, exact HTTPS origin, server-side access/abuse policy, secure cookies, trusted-client rate accounting, request/concurrency/deadline limits, private connectivity to n8n/MySQL/Ollama, secrets provisioning, retention, health monitoring and backup/restart ownership. Preserve the isolated database/account and private webhook authentication. The current loopback bridge is not a production gateway. Test the chosen deployment with its actual headers, HTTPS cookies and one synthetic real submission before advertising it as live.

## Results dashboard and deferred safe validation

The local Node server now reads the separate ai_support_portfolio_test_results database through a SELECT-only account. Static pages alone cannot serve these APIs; provision the approved server/secret arrangement separately before public hosting. Current credentials are Windows DPAPI-bound and must not be copied as cloud credentials. No HTTP ingestion or on-demand execution endpoint exists. The disabled Run Safe Validation architecture and exact initial safe subset are documented in the root README; implementing/activating it requires separate authorization.
