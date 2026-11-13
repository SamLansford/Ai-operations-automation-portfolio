// Read-only checks of actual results API/MySQL and existing local demo; never submits a ticket.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { listRuns, getRun } from "../scripts/test-results-store.mjs";
import { test } from "node:test";
test("Actual results SQL API display and ticket UI preservation", async () => {
  const origin = "http://127.0.0.1:4173";
  const expected = await listRuns();
  let r = await fetch(origin + "/api/reliability/runs");
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.deepEqual(body, expected);
  assert.ok(body.runs.length >= 5);
  const firstPage = await listRuns({ limit: 2 });
  let paged = await fetch(origin + "/api/reliability/runs?limit=2");
  assert.deepEqual(await paged.json(), firstPage);
  if (firstPage.nextCursor) {
    paged = await fetch(
      origin + "/api/reliability/runs?limit=2&cursor=" + firstPage.nextCursor,
    );
    assert.deepEqual(
      await paged.json(),
      await listRuns({ limit: 2, cursor: firstPage.nextCursor }),
    );
  }
  assert.equal((await fetch(origin + "/.env.results-reader.json")).status, 404);
  const attention = await fetch(origin + "/api/reliability/runs?needsReview=1");
  assert.equal(attention.status, 200);
  const review = await attention.json();
  assert.ok(
    review.runs.every((r) => r.outcome === "FAIL" || r.outcome === "ERROR"),
  );
  const id = body.runs[0].runId;
  const sql = await getRun(id);
  r = await fetch(origin + "/api/reliability/runs/" + id);
  assert.deepEqual(await r.json(), sql);
  for (const method of ["POST", "PUT", "PATCH", "DELETE"])
    assert.equal(
      (await fetch(origin + "/api/reliability/runs", { method })).status,
      405,
    );
  assert.equal(
    (await fetch(origin + "/api/reliability/run-safe-validation")).status,
    404,
  );
  assert.equal(
    (await fetch(origin + "/api/reliability/runs?limit=999")).status,
    400,
  );
  assert.equal(
    (
      await fetch(origin + "/api/reliability/runs", {
        headers: { Origin: "https://foreign.invalid" },
      })
    ).status,
    403,
  );
  const browser = await chromium.launch();
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      await page.goto(origin + "/reports/reliability/");
      await page.locator(".stored-check").first().waitFor();
      assert.equal(
        await page.locator(".stored-check").count(),
        sql.results.length,
      );
      assert.ok(
        (await page.locator("[data-detail]").innerText()).includes(sql.suite),
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Run Safe Validation", exact: true })
          .isDisabled(),
        true,
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await page.screenshot({
        path: ".local-reports/dashboard-" + width + ".png",
      });
      await page.close();
    }
    const ticket = await browser.newPage();
    await ticket.goto(origin + "/support-ticket/#demo");
    const frame = ticket.frameLocator(".demo-frame");
    await frame.locator('[data-example="billing"]').click();
    assert.match(
      await frame.locator("#message").inputValue(),
      /two completed charges/,
    );
    await ticket.waitForFunction(
      () =>
        document
          .querySelector(".demo-frame")
          .contentDocument.querySelector("#submit")?.disabled === false,
      undefined,
      { timeout: 10000 },
    );
    assert.equal(await frame.locator("#submit").isEnabled(), true);
    assert.equal(await frame.locator(".ticket-workspace").count(), 1);
  } finally {
    await browser.close();
  }
  fs.writeFileSync(
    ".local-reports/dashboard-read-verification.json",
    JSON.stringify({
      checkedAt: new Date().toISOString(),
      apiMatchesMySql: true,
      detailMatchesMySql: true,
      readOnlyMethods: true,
      noExecutionEndpoint: true,
      desktopMobile: true,
      ticketUiConnected: true,
      storedRuns: expected.runs.length,
    }),
  );
  console.log(
    "PASS actual SQL/API/display parity, read-only boundaries, desktop/mobile and connected ticket UI; no ticket writes.",
  );
});
