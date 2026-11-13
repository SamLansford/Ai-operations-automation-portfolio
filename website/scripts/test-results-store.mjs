import path from "node:path";
import mysql from "mysql2/promise";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
export const DATABASE = "ai_support_portfolio_test_results";
export const CATEGORIES = [
  "Input validation",
  "AI output validation",
  "Authentication and authorization",
  "Duplicate protection and idempotency",
  "MySQL persistence and transactions",
  "Concurrency",
  "Error handling and timeouts",
  "Audit logging",
  "Browser functionality",
  "Session isolation and security",
];
export const digest = (value) =>
  createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
export function currentFingerprint() {
  const files = [
    "../.github/workflows/website-tests.yml",
    "src/render.mjs",
    "src/demo/app.mjs",
    "scripts/serve.mjs",
    "scripts/local-demo-proxy.mjs",
    "scripts/test-results-store.mjs",
    "scripts/test-result-adapters.mjs",
    "src/assets/reliability.mjs",
    "tests/website.spec.mjs",
    "tests/test-results.test.mjs",
    "tests/results-live-read.mjs",
    "src/assets/style.css",
    "src/demo/style.css",
    "scripts/collect-test-results.mjs",
    "scripts/result-recording.mjs",
    "scripts/run-recorded-tests.mjs",
    "scripts/start-local.mjs",
    "scripts/reliability-api.mjs",
    "scripts/security-headers.mjs",
    "src/projects.mjs",
    "db/test-results.sql",
    "package-lock.json",
    "playwright.config.mjs",
  ];
  return digest(
    files.map((file) => [
      file,
      fs.existsSync(new URL("../" + file, import.meta.url))
        ? digest(
            fs.readFileSync(new URL("../" + file, import.meta.url), "utf8"),
          )
        : null,
    ]),
  );
}
export async function connection(role = "reader") {
  const cfg = JSON.parse(
    fs.readFileSync(
      new URL("../.env.results-" + role + ".json", import.meta.url),
      "utf8",
    ),
  );
  if (
    cfg.host !== "127.0.0.1" ||
    cfg.database !== DATABASE ||
    cfg.user !==
      (role === "reader" ? "portfolio_test_reader" : "portfolio_test_writer")
  )
    throw Error("RESULTS_CONFIG_INVALID");
  const decoded = spawnSync(
    path.join(
      process.env.SystemRoot || "C:\\Windows",
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe",
    ),
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Import-Module ($PSHOME+'\\Modules\\Microsoft.PowerShell.Security\\Microsoft.PowerShell.Security.psd1') -ErrorAction Stop;$s=ConvertTo-SecureString ([Console]::In.ReadToEnd());$p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s);try{[Console]::Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($p))}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p)}",
    ],
    {
      input: cfg.protectedPassword,
      encoding: "utf8",
      windowsHide: true,
      timeout: 5000,
      maxBuffer: 16384,
    },
  );
  if (decoded.status !== 0 || !decoded.stdout)
    throw Error("RESULTS_CREDENTIAL_UNAVAILABLE");
  const { protectedPassword, ...options } = cfg;
  return mysql.createConnection({
    ...options,
    password: decoded.stdout,
    connectTimeout: 3000,
    dateStrings: true,
    timezone: "Z",
    multipleStatements: false,
  });
}
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export const validId = (id) => typeof id === "string" && UUID.test(id);
const safeText = (text, max) =>
  typeof text === "string" &&
  text.length <= max &&
  !/password\s*[:=]|authorization\s*[:=]|bearer\s+\S+|api[_-]?key\s*[:=]|secret\s*[:=]|cookie\s*[:=]|token\s*[:=]|[A-Z]:[\\/]|https?:|@/i.test(
    text,
  )
    ? text
    : undefined;
const timestamp = (x) =>
  x == null
    ? null
    : typeof x === "string" &&
        /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(x) &&
        !isNaN(Date.parse(x)) &&
        new Date(x).toISOString().slice(0, 19) === x.slice(0, 19)
      ? new Date(x).toISOString()
      : undefined;
const duration = (x) =>
  x == null
    ? null
    : Number.isFinite(x) && x >= 0 && x <= 86400000
      ? x
      : undefined;
export function normalizeRun(input) {
  if (
    !input ||
    !validId(input.runId) ||
    !safeText(input.suite, 160) ||
    !["LOCAL", "CI"].includes(input.environment) ||
    !["ISOLATED", "MOCKED", "REAL_INTEGRATION", "CONTROLLED_FAULT"].includes(
      input.dependencyMode,
    ) ||
    !["CAPTURED", "HISTORICAL_IMPORT"].includes(input.provenance) ||
    !/^[a-f0-9]{64}$/.test(input.artifactDigest)
  )
    throw Error("INVALID_RUN");
  if (
    !Array.isArray(input.results) ||
    input.results.length < 1 ||
    input.results.length > 500
  )
    throw Error("INVALID_RESULTS");
  const results = input.results.map((r, index) => {
    if (
      !safeText(r.name, 240) ||
      !["PASS", "FAIL", "SKIP", "ERROR"].includes(r.outcome) ||
      duration(r.durationMs) === undefined
    )
      throw Error("INVALID_RESULT");
    const categories = Array.isArray(r.categories)
      ? [...new Set(r.categories)].filter((c) => CATEGORIES.includes(c))
      : [];
    const evidence = {};
    for (const key of [
      "http",
      "execution",
      "audits",
      "persistedAudits",
      "replayEqual",
      "originalUnchanged",
      "protectedWorkflowsUnchanged",
      "reloadVerified",
      "eventsVisible",
    ]) {
      const v = r.evidence?.[key];
      if (
        typeof v === "boolean" ||
        (Number.isFinite(v) && v >= 0 && v <= 999999999)
      )
        evidence[key] = v;
      else if (
        key === "http" &&
        Array.isArray(v) &&
        v.length <= 4 &&
        v.every((x) => Number.isInteger(x) && x >= 100 && x <= 599)
      )
        evidence[key] = v;
      else if (
        key === "execution" &&
        typeof v === "string" &&
        /^\d{1,12}$/.test(v)
      )
        evidence[key] = v;
    }
    if (
      ["ISOLATED", "MOCKED", "RESULTS_MYSQL", "DEMO_INTEGRATION"].includes(
        r.evidence?.scope,
      )
    )
      evidence.scope = r.evidence.scope;
    return {
      caseKey: digest([input.suite, r.name, index]),
      name: r.name,
      outcome: r.outcome,
      categories,
      durationMs: duration(r.durationMs),
      errorCode: [
        "ASSERTION_FAILED",
        "TIMEOUT",
        "RUNNER_ERROR",
        "INTERRUPTED",
        "SKIPPED",
      ].includes(r.errorCode)
        ? r.errorCode
        : null,
      evidence,
    };
  });
  const run = {
    runId: input.runId,
    suite: input.suite,
    environment: input.environment,
    dependencyMode: input.dependencyMode,
    provenance: input.provenance,
    startedAt: timestamp(input.startedAt),
    completedAt: timestamp(input.completedAt),
    observedAt: timestamp(input.observedAt),
    durationMs: duration(input.durationMs),
    revision:
      typeof input.revision === "string" &&
      /^[a-f0-9]{7,64}$/.test(input.revision)
        ? input.revision
        : null,
    dirty: typeof input.dirty === "boolean" ? input.dirty : null,
    fingerprint:
      typeof input.fingerprint === "string" &&
      /^[a-f0-9]{64}$/.test(input.fingerprint)
        ? input.fingerprint
        : null,
    artifactDigest: input.artifactDigest,
    limitations: Array.isArray(input.limitations)
      ? input.limitations
          .map((x) => safeText(x, 240))
          .filter(Boolean)
          .slice(0, 8)
      : [],
    results,
  };
  if (
    [run.startedAt, run.completedAt, run.observedAt, run.durationMs].includes(
      undefined,
    )
  )
    throw Error("INVALID_TIMING");
  run.outcome = results.some((x) => x.outcome === "ERROR")
    ? "ERROR"
    : results.some((x) => x.outcome === "FAIL")
      ? "FAIL"
      : results.every((x) => x.outcome === "SKIP")
        ? "SKIP"
        : "PASS";
  return run;
}
const sqlTime = (x) => (x ? x.replace("T", " ").replace("Z", "") : null);
export async function insertRun(input, db) {
  const run = normalizeRun(input),
    payload = digest(run);
  let owned = false;
  if (!db) {
    db = await connection("writer");
    owned = true;
  }
  try {
    await db.beginTransaction();
    try {
      await db.execute(
        "INSERT INTO test_runs (run_id,suite,environment,dependency_mode,provenance,started_at,completed_at,observed_at,duration_ms,revision,dirty,fingerprint,artifact_digest,payload_digest,limitations,outcome,collector_version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [
          run.runId,
          run.suite,
          run.environment,
          run.dependencyMode,
          run.provenance,
          sqlTime(run.startedAt),
          sqlTime(run.completedAt),
          sqlTime(run.observedAt),
          run.durationMs,
          run.revision,
          run.dirty,
          run.fingerprint,
          run.artifactDigest,
          payload,
          JSON.stringify(run.limitations),
          run.outcome,
          "1",
        ],
      );
    } catch (e) {
      if (e.code !== "ER_DUP_ENTRY") throw e;
      await db.rollback();
      const [rows] = await db.execute(
        "SELECT payload_digest FROM test_runs WHERE run_id=?",
        [run.runId],
      );
      if (rows[0]?.payload_digest !== payload) throw Error("IMPORT_CONFLICT");
      return { runId: run.runId, replayed: true };
    }
    for (const r of run.results)
      await db.execute(
        "INSERT INTO test_results (run_id,case_key,name,outcome,categories,duration_ms,error_code,evidence) VALUES (?,?,?,?,?,?,?,?)",
        [
          run.runId,
          r.caseKey,
          r.name,
          r.outcome,
          JSON.stringify(r.categories),
          r.durationMs,
          r.errorCode,
          JSON.stringify(r.evidence),
        ],
      );
    await db.commit();
    return { runId: run.runId, replayed: false };
  } catch (e) {
    await db.rollback();
    throw e;
  } finally {
    if (owned) await db.end();
  }
}
const parse = (x) => (typeof x === "string" ? JSON.parse(x) : x);
function publicRun(r) {
  return {
    runId: r.run_id,
    suite: r.suite,
    environment: r.environment,
    dependencyMode: r.dependency_mode,
    provenance: r.provenance,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    observedAt: r.observed_at,
    durationMs: r.duration_ms,
    revision: r.revision,
    dirty: r.dirty,
    fingerprint: r.fingerprint,
    artifactDigest: r.artifact_digest,
    freshness: r.fingerprint
      ? r.fingerprint === currentFingerprint()
        ? "CURRENT"
        : "STALE"
      : "UNKNOWN",
    limitations: parse(r.limitations),
    outcome: r.outcome,
    counts: {
      PASS: Number(r.pass_count || 0),
      FAIL: Number(r.fail_count || 0),
      SKIP: Number(r.skip_count || 0),
      ERROR: Number(r.error_count || 0),
    },
  };
}
const baseSelect =
  "SELECT r.*,SUM(t.outcome='PASS') pass_count,SUM(t.outcome='FAIL') fail_count,SUM(t.outcome='SKIP') skip_count,SUM(t.outcome='ERROR') error_count FROM test_runs r JOIN test_results t ON t.run_id=r.run_id";
export async function listRuns(
  { limit = 20, cursor = null, needsReview = false } = {},
  db,
) {
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    (cursor && !validId(cursor))
  )
    throw Error("INVALID_QUERY");
  let owned = false;
  if (!db) {
    db = await connection();
    owned = true;
  }
  try {
    const params = [];
    let where = needsReview ? " WHERE r.outcome IN ('FAIL','ERROR')" : "";
    if (cursor) {
      const [row] = await db.execute(
        "SELECT COALESCE(observed_at,completed_at,started_at,ingested_at) stamp FROM test_runs WHERE run_id=?",
        [cursor],
      );
      if (!row.length) throw Error("INVALID_QUERY");
      where +=
        (where ? " AND " : " WHERE ") +
        "(COALESCE(r.observed_at,r.completed_at,r.started_at,r.ingested_at),r.run_id) < (?,?)";
      params.push(row[0].stamp, cursor);
    }
    const [rows] = await db.execute(
      baseSelect +
        where +
        " GROUP BY r.run_id ORDER BY COALESCE(r.observed_at,r.completed_at,r.started_at,r.ingested_at) DESC,r.run_id DESC LIMIT " +
        limit,
      params,
    );
    return {
      runs: rows.map(publicRun),
      nextCursor: rows.length === limit ? rows.at(-1).run_id : null,
      categories: CATEGORIES,
    };
  } finally {
    if (owned) await db.end();
  }
}
export async function getRun(id, db) {
  if (!validId(id)) throw Error("INVALID_QUERY");
  let owned = false;
  if (!db) {
    db = await connection();
    owned = true;
  }
  try {
    const [runs] = await db.execute(
      baseSelect + " WHERE r.run_id=? GROUP BY r.run_id",
      [id],
    );
    if (!runs.length) return null;
    const [rows] = await db.execute(
      "SELECT name,outcome,categories,duration_ms,error_code,evidence FROM test_results WHERE run_id=? ORDER BY case_key LIMIT 500",
      [id],
    );
    return {
      ...publicRun(runs[0]),
      results: rows.map((r) => ({
        name: r.name,
        outcome: r.outcome,
        categories: parse(r.categories),
        durationMs: r.duration_ms,
        errorCode: r.error_code,
        evidence: parse(r.evidence),
      })),
    };
  } finally {
    if (owned) await db.end();
  }
}
