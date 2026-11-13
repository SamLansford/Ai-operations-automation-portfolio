import fs from "node:fs";
import path from "node:path";
import { recordRun, retryPending } from "../scripts/result-recording.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  normalizeRun,
  insertRun,
  connection,
  listRuns,
  getRun,
  digest,
  currentFingerprint,
} from "../scripts/test-results-store.mjs";
import { adapt } from "../scripts/test-result-adapters.mjs";
const fixture = () => ({
  runId: randomUUID(),
  suite: "Isolated collector verification",
  environment: "LOCAL",
  dependencyMode: "ISOLATED",
  provenance: "CAPTURED",
  artifactDigest: digest("fixture"),
  observedAt: "2026-11-12T00:00:00.000Z",
  fingerprint: currentFingerprint(),
  results: ["PASS", "FAIL", "SKIP", "ERROR"].map((outcome) => ({
    name: "Fixture " + outcome,
    outcome,
    categories: ["Input validation"],
    errorCode: outcome === "FAIL" ? "ASSERTION_FAILED" : null,
    evidence: {
      http: [200],
      password: "must-not-store",
      rawLog: "must-not-store",
    },
  })),
});
test("Normalization preserves four outcomes and removes private evidence", () => {
  const r = normalizeRun(fixture());
  assert.deepEqual(
    r.results.map((x) => x.outcome),
    ["PASS", "FAIL", "SKIP", "ERROR"],
  );
  assert.equal(r.outcome, "ERROR");
  assert.deepEqual(r.results[0].evidence, { http: [200] });
});
test("Reject sensitive names and invalid timestamps", () => {
  const f = fixture();
  f.results[0].name = "password=must-not-store";
  assert.throws(() => normalizeRun(f), /INVALID_RESULT/);
  f.results[0].name = "Valid check";
  f.observedAt = "yesterday";
  assert.throws(() => normalizeRun(f), /INVALID_TIMING/);
});
test("Historical structural import retains original date and unknown fingerprint", () => {
  const r = adapt(
    "structural",
    JSON.stringify({
      generatedAt: "2020-01-01T00:00:00.000Z",
      results: [{ name: "Example input check", status: "failed" }],
    }),
  );
  assert.equal(r.observedAt, "2020-01-01T00:00:00.000Z");
  assert.equal(r.fingerprint, null);
  assert.equal(r.results[0].outcome, "FAIL");
  assert.equal(r.durationMs, null);
});
test("Missing historical date is rejected, not fabricated", () =>
  assert.throws(
    () =>
      adapt(
        "structural",
        JSON.stringify({
          results: [{ name: "Example check", status: "passed" }],
        }),
      ),
    /SOURCE_MISSING_DATE/,
  ));
test("Browser timeout, skip and runner error remain visible", () => {
  const r = adapt(
    "playwright",
    JSON.stringify({
      stats: { startTime: "2020-01-01T00:00:00.000Z", duration: 100 },
      suites: [
        {
          specs: [
            {
              title: "Timed check",
              tests: [
                {
                  projectName: "fixture",
                  results: [{ status: "timedOut", duration: 10 }],
                },
              ],
            },
            {
              title: "Skipped check",
              tests: [
                {
                  projectName: "fixture",
                  results: [{ status: "skipped", duration: 0 }],
                },
              ],
            },
          ],
        },
      ],
      errors: [{}],
    }),
  );
  assert.deepEqual(
    r.results.map((x) => x.outcome),
    ["ERROR", "SKIP", "ERROR"],
  );
});
test(
  "MySQL append-only ingestion, duplicate/conflict, parity and permission isolation",
  { skip: process.env.RESULTS_DB_TEST !== "1" },
  async () => {
    const writer = await connection("writer"),
      reader = await connection();
    await writer.beginTransaction();
    const tx = {
      execute: (...args) => writer.execute(...args),
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
    };
    try {
      const f = fixture();
      const first = await insertRun(f, tx);
      assert.equal(first.replayed, false);
      assert.equal((await insertRun(f, tx)).replayed, true);
      const changed = structuredClone(f);
      changed.results[0].name = "Changed case";
      await assert.rejects(() => insertRun(changed, tx), /IMPORT_CONFLICT/);
      const detail = await getRun(f.runId, tx);
      assert.deepEqual(detail.counts, { PASS: 1, FAIL: 1, SKIP: 1, ERROR: 1 });
      assert.equal(detail.freshness, "CURRENT");
      assert.equal(detail.results.length, 4);
      assert.equal(await getRun(randomUUID(), tx), null);
      const changedFingerprint = fixture();
      changedFingerprint.fingerprint = "0".repeat(64);
      await insertRun(changedFingerprint, tx);
      assert.equal(
        (await getRun(changedFingerprint.runId, tx)).freshness,
        "STALE",
      );
      assert.ok(
        (await listRuns({ limit: 50 }, tx)).runs.some(
          (r) => r.runId === f.runId,
        ),
      );
      for (const db of [reader, writer]) {
        for (const schema of [
          "ai_support_portfolio",
          "ai_support_portfolio_demo",
        ])
          for (const table of ["tickets", "ticket_audit"])
            await assert.rejects(
              () =>
                db.query("SELECT * FROM " + schema + "." + table + " LIMIT 0"),
              (e) =>
                e.code === "ER_TABLEACCESS_DENIED_ERROR" ||
                e.code === "ER_DBACCESS_DENIED_ERROR",
            );
        for (const table of ["test_runs", "test_results"])
          for (const verb of ["UPDATE", "DELETE"])
            await assert.rejects(
              () =>
                db.query(
                  verb === "UPDATE"
                    ? "UPDATE " + table + " SET run_id=run_id WHERE 1=0"
                    : "DELETE FROM " + table + " WHERE 1=0",
                ),
              (e) => e.code === "ER_TABLEACCESS_DENIED_ERROR",
            );
      }
      await assert.rejects(
        () => reader.query("INSERT INTO test_runs(run_id) VALUES ('denied')"),
        (e) => e.code === "ER_TABLEACCESS_DENIED_ERROR",
      );
    } finally {
      await writer.rollback();
      await writer.end();
      await reader.end();
    }
  },
);

test("Failed and errored checks survive unavailable database without private diagnostics", async () => {
  const directory = path.resolve(
    ".local-reports/outbox-test-fixture-" + randomUUID(),
  );
  const input = fixture();
  const r = await recordRun(input, {
    directory,
    deliver: async () => {
      throw Error("password=must-not-store");
    },
  });
  assert.equal(r.persistence, "LOCAL_PENDING");
  const saved = JSON.parse(
    fs.readFileSync(path.join(directory, input.runId + ".json")),
  );
  assert.deepEqual(
    saved.results.map((x) => x.outcome),
    ["PASS", "FAIL", "SKIP", "ERROR"],
  );
  assert.ok(!JSON.stringify(saved).includes("must-not-store"));
  let calls = 0;
  const delivered = await retryPending({
    directory,
    deliver: async (run) => {
      calls++;
      return { runId: run.runId, replayed: false };
    },
  });
  assert.equal(delivered.delivered, 1);
  await retryPending({
    directory,
    deliver: async () => {
      calls++;
    },
  });
  assert.equal(calls, 1);
});
test("Conflicting local capture cannot overwrite the first stored evidence", async () => {
  const directory = path.resolve(
      ".local-reports/outbox-conflict-fixture-" + randomUUID(),
    ),
    input = fixture();
  await recordRun(input, {
    directory,
    deliver: async () => {
      throw Error("offline");
    },
  });
  const before = fs.readFileSync(
    path.join(directory, input.runId + ".json"),
    "utf8",
  );
  input.results[0].name = "Changed test name";
  await assert.rejects(
    () => recordRun(input, { directory, deliver: async () => {} }),
    /LOCAL_RUN_CONFLICT/,
  );
  assert.equal(
    fs.readFileSync(path.join(directory, input.runId + ".json"), "utf8"),
    before,
  );
});
test("Nested Node reporter records leaf checks including failures, not parent totals", () => {
  const r = adapt(
    "tap",
    "# Subtest: parent\n    ok 1 - child pass\n    not ok 2 - child fail\nnot ok 1 - parent\n",
  );
  assert.deepEqual(
    r.results.map((x) => [x.name, x.outcome]),
    [
      ["child pass", "PASS"],
      ["child fail", "FAIL"],
    ],
  );
});
test(
  "Credential loading is independent of terminal PATH and module path",
  { skip: process.env.RESULTS_DB_TEST !== "1" },
  async () => {
    const oldPath = process.env.PATH,
      oldModule = process.env.PSModulePath;
    try {
      process.env.PATH = "C:\\Windows\\System32;C:\\Windows";
      process.env.PSModulePath = "C:\\not-a-module-directory";
      const db = await connection();
      await db.query("SELECT 1");
      await db.end();
    } finally {
      process.env.PATH = oldPath;
      if (oldModule === undefined) delete process.env.PSModulePath;
      else process.env.PSModulePath = oldModule;
    }
  },
);

test('Runner exceptions and timeouts are ERROR with duration while assertions remain FAIL',()=>{const text='not ok 1 - unexpected exception\n  ---\n  duration_ms: 12\n  failureType: testCodeFailure\n  ...\nnot ok 2 - assertion mismatch\n  ---\n  failureType: testCodeFailure\n  code: ERR_ASSERTION\n  ...\nnot ok 3 - deadline\n  ---\n  failureType: testTimeoutFailure\n  ...\n';const run=adapt('tap',text);assert.deepEqual(run.results.map(r=>r.outcome),['ERROR','FAIL','ERROR']);assert.equal(run.results[0].durationMs,12);assert.equal(run.results[2].errorCode,'TIMEOUT');});
