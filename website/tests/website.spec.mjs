import { test, expect } from "@playwright/test";
// Keep routine website checks independent of running automation services.
test.beforeEach(async ({page})=>{await page.route('**/__local-demo/api/demo/submission-history',r=>r.fulfill({json:{history:[]}}));await page.route('**/api/reliability/**',r=>r.fulfill({json:{runs:[],nextCursor:null,categories:[]}}));await page.route('**/__local-demo/api/demo/ticket-status',r=>r.fulfill({status:503,json:{error:'LOOKUP_UNAVAILABLE'}}));await page.route('**/__local-demo/api/demo/session',r=>r.fulfill({status:503,json:{error:'AUTOMATION_UNAVAILABLE'}}));});
const routes = [
  "/",
  "/projects/",
  "/support-ticket/",
  "/evidence/",
  "/reports/",
];
test("Navigation reaches the support project detail page", async ({
  page,
  isMobile,
}, info) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: "Explore projects", exact: false })
    .first()
    .click();
  await expect(page).toHaveURL(/\/projects\//);
  await page
    .getByRole("heading", { name: "AI Support Ticket Automation", exact: true })
    .getByRole("link")
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "AI Support Ticket Automation",
  );

});
test("Responsive layout, basic accessible semantics and no browser errors", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.name));
  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("main")).toHaveAttribute("id", "main");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("meta[name=viewport]")).toHaveCount(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await page
        .locator("a")
        .evaluateAll((as) =>
          as.every((a) => a.textContent.trim() || a.getAttribute("aria-label")),
        ),
    ).toBe(true);
    const ids = await page
      .locator("[id]")
      .evaluateAll((es) => es.map((e) => e.id));
    expect(new Set(ids).size).toBe(ids.length);
  }
  expect(errors).toEqual([]);
});
test("Project filters expose the right cards and announce changes", async ({
  page,
}) => {
  await page.goto("/projects/");
  await page.getByRole("button", { name: "AI workflows", exact: true }).click();
  await expect(page.locator(".project-card:visible")).toHaveCount(1);
  await expect(page.locator(".project-card:visible")).toContainText(
    "AI Support Ticket Automation",
  );
  await expect(page.locator("#filter-status")).toHaveText("1 project shown");
  await expect(page.locator(".project-card")).toHaveCount(1);
  await page.getByRole("button", { name: "All projects", exact: true }).click();
  await expect(page.locator(".project-card:visible")).toHaveCount(1);
});
test("Keyboard skip link, focus and mobile menu Escape work", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  if (info.project.name === "mobile") {
    const menu = page.locator(".nav-toggle");
    await menu.focus();
    await page.keyboard.press("Enter");
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("navigation")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(menu).toBeFocused();
  } else {
    await expect(page.getByRole("navigation")).toBeVisible();
  }
});
test("Absent demo and resume are honest disabled states", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Résumé download", exact: false }),
  ).toBeDisabled();
  for (const route of ["/support-ticket/"]) {
    await page.goto(route);
    await expect(
      page.getByRole("button", { name: "Live demo not deployed", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Public integration report not published",
      }),
    ).toBeDisabled();
  }

});
test("Report missing and available states are distinguished", async ({
  page,
}) => {
  await page.route("**/reports/website/index.html", (r) =>
    r.fulfill({ status: 404, body: "not generated" }),
  );
  await page.goto("/reports/");
  await page.getByRole("button", { name: "Check report availability" }).click();
  await expect(page.locator("#report-message")).toContainText(
    "No generated report is available",
  );
  await page.unroute("**/reports/website/index.html");
  await page.route("**/reports/website/index.html", (r) =>
    r.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>Website fixture</title>",
    }),
  );
  await page.getByRole("button", { name: "Check report availability" }).click();
  await expect(
    page.getByRole("link", { name: "Open generated website report" }),
  ).toBeVisible();
});
test("Internal navigation and assets return HTTP200, unknown route404", async ({
  page,
  request,
}) => {
  const paths = new Set();
  for (const route of routes) {
    await page.goto(route);
    for (const p of await page
      .locator("a[href],link[href],script[src]")
      .evaluateAll((es) =>
        es
          .map((e) => e.getAttribute("href") || e.getAttribute("src"))
          .filter((s) => s.startsWith("/")),
      ))
      paths.add(p.split("#")[0]);
  }
  for (const p of paths) expect((await request.get(p)).status(), p).toBe(200);
  expect((await request.get("/route-that-does-not-exist/")).status()).toBe(404);
  expect((await request.get("/.env")).status()).toBe(404);
});
test("No request is made to any automation or external provider", async ({
  page,
}) => {
  const forbidden = [];
  page.on("request", (r) => {
    if (!r.url().startsWith("http://127.0.0.1:4174/"))
      forbidden.push(new URL(r.url()).origin);
  });
  for (const route of routes) await page.goto(route);
  expect(forbidden).toEqual([]);
});

test("Evidence presents concrete source-backed cases with truthful scope", async ({page}) => {
 await page.goto('/evidence/');
 await expect(page.locator('.test-case')).toHaveCount(22);
 await expect(page.locator('main')).toContainText('Audit insertion failure rolls back the ticket');
 await expect(page.locator('main')).toContainText('This was not a real Ollama outage.');
 await expect(page.locator('main')).toContainText('No workflow, SQL transaction or authentication endpoint execution.');
 await expect(page.locator('.test-case').first()).toContainText('Test input');
 await expect(page.locator('.test-case').first()).toContainText('How checked');
});

test('Embedded demo shows all examples and displays a result in place', async ({page}) => {
 await page.route('**/__local-demo/api/demo/session',r=>r.fulfill({json:{csrf:'isolated-ui-fixture'}}));
 await page.route('**/__local-demo/api/demo/tickets',r=>r.fulfill({json:{status:'AUTO_ROUTED',category:'BILLING',reason:'Explicit browser fixture',ticketRef:'fixture-only'}}));
 await page.goto('/support-ticket/#demo');
 const frame=page.frameLocator('iframe[title="Interactive support ticket demo"]');
 await expect(frame.locator('[data-example]')).toHaveCount(18);
 await frame.locator('[data-example="billing"]').click();

 await frame.locator('#submit').click();
 await expect(frame.locator('#result')).toContainText('BILLING');
 await expect(page).toHaveURL(new RegExp('support-ticket/#demo$'));
 await expect(page.locator('#open-local-demo')).toHaveCount(0);
});
test('Project card opens directly at the visible demo', async ({page}) => {
 await page.goto('/');
 await page.locator('.project-card h2 a').click();
 await expect(page).toHaveURL(new RegExp('support-ticket/#demo$'));
 await expect(page.locator('iframe[title="Interactive support ticket demo"]')).toBeInViewport();
 const order=await page.locator('main').evaluate(main=>{const demo=main.querySelector('#demo');const headings=[...main.querySelectorAll('h2')];return headings[0]===demo.querySelector('h2');});
 expect(order).toBe(true);
});

test('Realistic ticket examples describe expected outcomes without a checkbox', async ({page}) => {
 await page.goto('/support-ticket/#demo');
 const frame=page.frameLocator('iframe[title="Interactive support ticket demo"]');
 const buttons=frame.locator('[data-example]');
 for(let i=0;i<18;i++){
  await buttons.nth(i).click();
  const message=await frame.locator('textarea').inputValue();
  expect(message).not.toMatch(/^For a fictional|^For this fictional|^x+$/);
  await expect(frame.locator('#example-note')).not.toHaveText('Select an example to see what it checks.');
  await expect(frame.locator('input[type=checkbox]')).toHaveCount(0);
 }
 await frame.locator('[data-example="long"]').click();
 expect((await frame.locator('#message').inputValue()).length).toBe(1501);
 await frame.locator('[data-example="billing"]').click();
 await expect(frame.locator('#example-note')).toContainText('Expected category: BILLING');
 await expect(frame.locator('#message')).toHaveValue(/two completed charges/);
});

test('Desktop embedded demo honors hosting CSP and offline state', async ({page,request})=>{
 const parent=await request.get('/support-ticket/');expect(parent.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
 const child=await request.get('/demo-frame/index.html');expect(child.headers()['content-security-policy']).toContain("frame-ancestors 'self'");
 await page.goto('/support-ticket/#demo');const frame=page.frameLocator('.demo-frame');
 await expect(frame.locator('#service-status')).toContainText('Demo offline');await expect(frame.locator('#submit')).toBeDisabled();
 await expect(frame.locator('#reconnect')).toBeVisible();
});
test('Desktop demo handles pending results and safe retry IDs',async({page})=>{
 await page.route('**/__local-demo/api/demo/session',r=>r.fulfill({json:{csrf:'fixture'}}));
 const ids=[];await page.route('**/__local-demo/api/demo/tickets',r=>{ids.push(r.request().postDataJSON().requestId);return r.fulfill({status:202,json:{status:'PENDING_REVIEW',ticketRef:'fixture'}});});
 await page.goto('/support-ticket/#demo');const frame=page.frameLocator('.demo-frame');
 await frame.locator('[data-example="billing"]').click();
 await frame.locator('#submit').click();await expect(frame.locator('#result')).toContainText('PENDING_REVIEW');
 await frame.locator('#submit').click();await expect.poll(()=>ids.length).toBe(2);expect(ids[0]).toBe(ids[1]);
});

for(const scenario of ['parallel','conflict','retry','short','contact','identity','csrf'])test.skip('Operator-only reliability control: '+scenario,async({page})=>{
 await page.route('**/__local-demo/api/demo/session',r=>r.fulfill({json:{csrf:'fixture'}}));
 const received=[],saved=new Map();let active=0,peak=0;
 await page.route('**/__local-demo/api/demo/tickets',async r=>{
  const data=r.request().postDataJSON();received.push(data);active++;peak=Math.max(peak,active);
  let status=200,body={status:'AUTO_ROUTED',category:'BILLING',reason:'Explicit test fixture',ticketRef:'fixture'};
  if(!r.request().headers()['x-demo-csrf']){status=403;body={error:'REQUEST_NOT_ALLOWED'};}
  else if(data.message.length<10||data.message.includes('@')||data.ticketId){status=400;body={error:'FICTIONAL_TICKET_REQUIRED'};}
  else if(saved.has(data.requestId)&&saved.get(data.requestId)!==data.message){status=409;body={error:'REQUEST_CONFLICT'};}
  else saved.set(data.requestId,data.message);
  await new Promise(resolve=>setTimeout(resolve,40));await r.fulfill({status,json:body});active--;
 });
 await page.goto('/support-ticket/#demo');const frame=page.frameLocator('.demo-frame');
 await frame.locator('[data-check="'+scenario+'"]').click();await expect(frame.locator('#check-result')).toContainText('Response check passed');
 await expect(frame.locator('#check-result')).toContainText('Database effects were not independently verified');
 expect(received.length).toBe(['parallel','conflict','retry'].includes(scenario)?2:1);
 if(received.length===2){expect(received[0].requestId).toBe(received[1].requestId);if(scenario!=='conflict')expect(received[0]).toEqual(received[1]);else expect(received[0].message).not.toBe(received[1].message);}
 if(scenario==='parallel'||scenario==='conflict')expect(peak).toBe(2);
});
test('Reliability page is read-only with no execution control enabled',async({page})=>{await page.goto('/reports/reliability/');await expect(page.locator('h1')).toHaveText('Testing & Reliability');await expect(page.getByRole('button',{name:'Run Safe Validation',exact:true})).toBeDisabled();await expect(page.locator('[data-status]')).toContainText('NO RESULTS');await expect(page.locator('[data-check]')).toHaveCount(0);});
test('Ticket workspace reloads persisted details and audit timeline',async({page})=>{
 await page.route('**/__local-demo/api/demo/session',r=>r.fulfill({json:{csrf:'fixture',workspaceId:'workspace-fixture'}}));
 await page.route('**/__local-demo/api/demo/tickets',r=>r.fulfill({json:{status:'AUTO_ROUTED',category:'BILLING',reason:'Submission fixture',ticketRef:'saved-fixture'}}));
 await page.route('**/__local-demo/api/demo/ticket-status',r=>r.fulfill({json:{ticket:{ticketRef:'saved-fixture',status:'AUTO_ROUTED',category:'BILLING',reason:'Saved database fixture',message:'Saved customer text',requiresReview:false,createdAt:'2026-11-12',updatedAt:'2026-11-12',events:[{type:'TICKET_CREATED',from:null,to:'PROCESSING',at:'2026-11-12'},{type:'AI_CLASSIFICATION_ACCEPTED',from:'PROCESSING',to:'AUTO_ROUTED',at:'2026-11-12'}]}}}));
 await page.goto('/support-ticket/#demo');const frame=page.frameLocator('.demo-frame');await frame.locator('[data-example="billing"]').click();await frame.locator('#submit').click();
 await expect(frame.locator('#ticket-detail')).toContainText('Saved database fixture');await expect(frame.locator('#ticket-detail li')).toHaveCount(2);await expect(frame.locator('#ticket-list')).toContainText('AUTO_ROUTED');
 await page.reload();await expect(page.frameLocator('.demo-frame').locator('#ticket-detail')).toContainText('Saved customer text');
});

for(const viewport of [{width:1440,height:1000},{width:390,height:844}])test('Stored dashboard outcomes and layout '+viewport.width,async({page})=>{
 await page.setViewportSize(viewport);const run={runId:'11111111-1111-4111-a111-111111111111',suite:'Explicit isolated UI fixture',environment:'LOCAL',dependencyMode:'MOCKED',provenance:'HISTORICAL_IMPORT',observedAt:'2020-01-01 00:00:00.000',durationMs:null,revision:null,dirty:null,freshness:'UNKNOWN',limitations:['Renderer fixture only'],outcome:'ERROR',counts:{PASS:1,FAIL:1,SKIP:1,ERROR:1},results:['PASS','FAIL','SKIP','ERROR'].map(outcome=>({name:'Fixture '+outcome,outcome,categories:['Input validation'],durationMs:null,errorCode:outcome==='FAIL'?'ASSERTION_FAILED':null,evidence:{}}))};
 await page.route('**/api/reliability/runs?*',r=>r.fulfill({json:{runs:[run],nextCursor:null,categories:['Input validation','Audit logging']}}));await page.route('**/api/reliability/runs/'+run.runId,r=>r.fulfill({json:run}));
 await page.goto('/reports/reliability/');await expect(page.locator('.stored-check')).toHaveCount(4);for(const outcome of ['pass','fail','skip','error'])await expect(page.locator('.result-counts .outcome-'+outcome)).toBeVisible();await expect(page.locator('[data-detail]')).toContainText('ASSERTION_FAILED');await expect(page.locator('[data-detail]')).toContainText('UNKNOWN');await page.locator('[data-detail] summary').click();await expect(page.locator('[data-detail]')).toContainText('NOT TESTED in this run');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('Results outage does not display a passing run',async({page})=>{await page.route('**/api/reliability/**',r=>r.fulfill({status:503,json:{error:'RESULTS_UNAVAILABLE'}}));await page.goto('/reports/reliability/');await expect(page.locator('[data-status]')).toContainText('unavailable');await expect(page.locator('.stored-check')).toHaveCount(0);});

test('Submission has no checkbox gate and retains backend contract',async({page})=>{await page.route('**/__local-demo/api/demo/session',r=>r.fulfill({json:{csrf:'fixture',workspaceId:'fixture'}}));let body;await page.route('**/__local-demo/api/demo/tickets',r=>{body=r.request().postDataJSON();return r.fulfill({json:{status:'AUTO_ROUTED',category:'BILLING',reason:'Fixture',ticketRef:'fixture'}});});await page.goto('/support-ticket/#demo');const frame=page.frameLocator('.demo-frame');await expect(frame.locator('input[type=checkbox]')).toHaveCount(0);await frame.locator('[data-example="billing"]').click();await frame.locator('#submit').click();await expect(frame.locator('#result')).toContainText('BILLING');expect(body.fictional).toBe(true);});

test('Homepage repository section appears first and is immediately visible',async({page})=>{await page.goto('/');await expect(page.locator('main > section').first()).toHaveAttribute('id','contact');await expect(page.locator('#contact').getByRole('link',{name:'View project repository',exact:false})).toBeInViewport();});

test('Human review filter requests stored FAIL and ERROR runs',async({page})=>{let filterSeen=false;const run={runId:'22222222-2222-4222-a222-222222222222',suite:'Explicit failing renderer fixture',outcome:'FAIL',environment:'LOCAL',dependencyMode:'ISOLATED',provenance:'CAPTURED',observedAt:'2020-01-01 00:00:00.000',durationMs:5,revision:null,freshness:'STALE',limitations:[],counts:{PASS:0,FAIL:1,SKIP:0,ERROR:0},results:[{name:'Failed assertion fixture',outcome:'FAIL',categories:[],durationMs:1,errorCode:'ASSERTION_FAILED',evidence:{}}]};await page.route('**/api/reliability/runs?*',r=>{filterSeen=r.request().url().includes('needsReview=1');return r.fulfill({json:{runs:[run],nextCursor:null,categories:[]}});});await page.route('**/api/reliability/runs/'+run.runId,r=>r.fulfill({json:run}));await page.goto('/reports/reliability/');await page.locator('[data-review-filter]').selectOption('review');await expect.poll(()=>filterSeen).toBe(true);await expect(page.locator('[data-detail]')).toContainText('Needs human review');await expect(page.locator('[data-detail]')).toContainText('ASSERTION_FAILED');});

// UI fixtures exercise rendering only; real persistence is verified separately.
test('Rejected attempts appear in activity without inventing tickets',async({page})=>{
 await page.route('**/__local-demo/api/demo/session',r=>r.fulfill({json:{csrf:'fixture',workspaceId:'history-fixture'}}));
 let rejected=false;await page.route('**/__local-demo/api/demo/submission-history',r=>r.fulfill({json:{history:rejected?[{attemptRef:'fixture12345',outcome:'REJECTED',httpStatus:400,errorCode:'FICTIONAL_TICKET_REQUIRED',ticketRef:null,createdAt:'2026-11-12 12:00:00'}]:[]}}));
 await page.route('**/__local-demo/api/demo/tickets',r=>{rejected=true;return r.fulfill({status:400,json:{error:'FICTIONAL_TICKET_REQUIRED',historyRecorded:true}});});
 await page.goto('/support-ticket/#demo');const frame=page.frameLocator('.demo-frame');await frame.locator('#message').fill('Help');await frame.locator('#submit').click();await expect(frame.locator('#submission-history-list')).toContainText('Rejected before automation');await expect(frame.locator('#ticket-list')).toContainText('No tickets');await expect(frame.locator('#submission-history-list')).not.toContainText('Help');
});
test('Saved FAILED ticket remains visible after a failed submission response',async({page})=>{
 await page.route('**/__local-demo/api/demo/session',r=>r.fulfill({json:{csrf:'fixture',workspaceId:'failed-fixture'}}));
 await page.route('**/__local-demo/api/demo/tickets',r=>r.fulfill({status:503,json:{error:'AUTOMATION_UNAVAILABLE',historyRecorded:false}}));
 await page.route('**/__local-demo/api/demo/ticket-status',r=>r.fulfill({json:{ticket:{ticketRef:'failed1234',status:'FAILED',category:'',reason:'',requiresReview:false,message:'Synthetic saved ticket',createdAt:'2026-11-12',updatedAt:'2026-11-12',events:[{type:'MODEL_UNAVAILABLE',to:'FAILED',at:'2026-11-12'}]}}}));
 await page.goto('/support-ticket/#demo');const frame=page.frameLocator('.demo-frame');await frame.locator('[data-example="billing"]').click();await frame.locator('#submit').click();await expect(frame.locator('#ticket-list')).toContainText('FAILED');await expect(frame.locator('#ticket-detail')).toContainText('Operator attention needed');await expect(frame.locator('#result')).toContainText('could not be confirmed as saved');
});

test('Policy review keeps valid category and displays saved review reason',async({page})=>{
 const reviewReason='Unverified manager or supervisor approval claim. Monetary refund claim requires review: refund threshold or currency policy is not configured.';
 await page.route('**/__local-demo/api/demo/session',r=>r.fulfill({json:{csrf:'fixture',workspaceId:'policy-fixture'}}));
 await page.route('**/__local-demo/api/demo/tickets',r=>r.fulfill({status:202,json:{status:'PENDING_REVIEW',category:'REFUND',requiresReview:true,reviewReason,ticketRef:'policy1234'}}));
 await page.route('**/__local-demo/api/demo/ticket-status',r=>r.fulfill({json:{ticket:{ticketRef:'policy1234',status:'PENDING_REVIEW',category:'REFUND',reason:'Broken item refund',requiresReview:true,reviewReason,policyVersion:'demo-escalation-v2',message:'Synthetic refund claim',createdAt:'2026-11-12',updatedAt:'2026-11-12',events:[{type:'HUMAN_REVIEW_REQUESTED',to:'PENDING_REVIEW',at:'2026-11-12'}]}}}));
 await page.goto('/support-ticket/#demo');const frame=page.frameLocator('.demo-frame');await frame.locator('[data-example="refund"]').click();await frame.locator('#submit').click();await expect(frame.locator('#result')).toContainText('REFUND');await expect(frame.locator('#result')).toContainText(reviewReason);await expect(frame.locator('#ticket-detail')).toContainText(reviewReason);await expect(frame.locator('#ticket-detail')).toContainText('demo-escalation-v2');await page.reload();await expect(page.frameLocator('.demo-frame').locator('#ticket-detail')).toContainText(reviewReason);
});
