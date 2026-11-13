import { recordRun, retryPending } from "./result-recording.mjs";
// Private operator CLI. No HTTP ingestion and no arbitrary runner commands.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { adapt } from "./test-result-adapters.mjs";
import { currentFingerprint } from "./test-results-store.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
try {
  const [action, kind, file] = process.argv.slice(2);
  if (action === "retry") {
    console.log(JSON.stringify(await retryPending()));
    process.exit(0);
  }
  let run;
  if (action === "import") {
    if (
      ![
        "structural",
        "playwright",
        "tap",
        "live-demo",
        "live-reliability",
        "live-workspace",
      ].includes(kind) ||
      !file
    )
      throw Error("INVALID_IMPORT_ARGUMENTS");
    const full = path.resolve(file);
    if (fs.statSync(full).size > 8000000) throw Error("ARTIFACT_TOO_LARGE");
    run = adapt(kind, fs.readFileSync(full, "utf8"));
    if (kind === "tap")
      throw Error("HISTORICAL_TAP_REQUIRES_ORIGINAL_TIMESTAMPS");
  } else if (action === "capture") {
    const jobs = {
      structural: [
        ["scripts/check-site.mjs"],
        "structural",
        ".local-reports/structure.json",
      ],
      browser: [
        ["node_modules/@playwright/test/cli.js", "test"],
        "playwright",
        ".local-reports/browser.json",
      ],
      bridge: [
        ["--test", "--test-reporter=tap", "tests/local-demo-proxy.test.mjs"],
        "tap",
        null,
      ],
      collector: [
        ["--test", "--test-reporter=tap", "tests/test-results.test.mjs"],
        "tap",
        null,
      ],
    };
    jobs["results-read"] = [
      ["--test", "--test-reporter=tap", "tests/results-live-read.mjs"],
      "tap",
      null,
    ];
    jobs["backend"] = [
      [
        "../01-ai-support-ticket-system/tests/demo-api.test.mjs",
      ],
      "console",
      null,
    ];
    jobs["lookup"] = [
      [
        "--test",
        "--test-reporter=tap",
        "../01-ai-support-ticket-system/tests/demo-lookup.test.mjs",
      ],
      "tap",
      null,
    ];
    jobs['submission-history'] = [['--test','--test-reporter=tap','../01-ai-support-ticket-system/tests/demo-submission-history.test.mjs'],'tap',null];
    jobs['escalation-policy']=[['--test','--test-reporter=tap','../01-ai-support-ticket-system/tests/escalation-policy.test.mjs','../01-ai-support-ticket-system/tests/policy-workflow.test.mjs'],'tap',null];
    jobs['validation-service']=[['--test','--test-reporter=tap','tests/safe-validation.test.mjs'],'tap',null];
    const job = jobs[kind];
    if (!job) throw Error("RUNNER_NOT_ALLOWLISTED");
    const fingerprint = currentFingerprint(),
      startedAt = new Date().toISOString();
    const before =
      job[2] && fs.existsSync(job[2]) ? fs.readFileSync(job[2], "utf8") : null;
    const p = spawnSync(process.execPath, job[0], {
      cwd: root,
      encoding: "utf8",
      timeout: 120000,
      windowsHide: true,
      maxBuffer: 8000000,
    });
    const completedAt = new Date().toISOString();
    let text =
      job[2] && fs.existsSync(job[2])
        ? fs.readFileSync(job[2], "utf8")
        : p.stdout || "";
    if (job[2] && text === before) text = "";
    try {
      run = adapt(
        job[1],
        text,
        process.env.GITHUB_ACTIONS === "true" ? "CI" : "LOCAL",
      );
    } catch {
      run = {
        runId: randomUUID(),
        suite: "Allowlisted runner " + kind,
        environment: "LOCAL",
        dependencyMode: "ISOLATED",
        artifactDigest: (await import("./test-results-store.mjs")).digest(text),
        limitations: [],
        results: [
          {
            name: "Runner completion",
            outcome: "ERROR",
            errorCode: "RUNNER_ERROR",
            categories: ["Error handling and timeouts"],
          },
        ],
      };
    }
    if(kind==='submission-history'){run.suite='Submission history isolated HTTP checks';run.dependencyMode='MOCKED';run.limitations.push('In-memory store and automation fixtures; no MySQL or n8n execution.');}
    if(kind==='escalation-policy'){run.suite='DEMO escalation policy and workflow logic';run.dependencyMode='ISOLATED';run.limitations.push('Pure JavaScript and workflow-node VM tests; no real model, webhook or SQL execution.');}
    if(kind==='validation-service'){run.suite='Safe Validation service security verification';run.dependencyMode='ISOLATED';run.limitations.push('Local API/controller fixtures and isolated child processes. No actual ticket or workflow operations.');}
    if (kind === "lookup") {
      run.suite = "Isolated session lookup checks";
      run.dependencyMode = "MOCKED";
    }
    if (kind === "results-read") {
      run.suite = "Actual read-only dashboard verification";
      run.dependencyMode = "REAL_INTEGRATION";
      run.limitations.push(
        "Results MySQL/API and connected ticket UI checked without ticket writes.",
      );
    }
    if (kind === "collector") {
      const databaseTest = process.env.RESULTS_DB_TEST === "1";
      run.suite = "Collector validation checks";
      run.dependencyMode = databaseTest ? "REAL_INTEGRATION" : "ISOLATED";
      run.limitations.push(
        databaseTest
          ? "Includes isolated unit checks and rollback-only results-database verification; no ticket writes."
          : "Database verification requires explicit local opt-in; skipped is not PASS.",
      );
      for (const result of run.results)
        result.evidence = {
          scope: result.name.startsWith("MySQL ")
            ? "RESULTS_MYSQL"
            : "ISOLATED",
        };
    }

    if (
      p.status !== 0 &&
      !run.results.some((r) => ["FAIL", "ERROR"].includes(r.outcome))
    )
      run.results.push({
        name: "Runner completion",
        outcome: "ERROR",
        errorCode: p.error?.code === "ETIMEDOUT" ? "TIMEOUT" : "RUNNER_ERROR",
        categories: ["Error handling and timeouts"],
      });
    Object.assign(run, {
      runId: randomUUID(),
      provenance: "CAPTURED",
      startedAt,
      completedAt,
      observedAt: completedAt,
      durationMs: Date.parse(completedAt) - Date.parse(startedAt),
      fingerprint,
      limitations: run.limitations.filter(
        (x) => !x.startsWith("Imported recorded"),
      ),
    });
    const rev = spawnSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      windowsHide: true,
    });
    run.revision = rev.status === 0 ? rev.stdout.trim() : null;
    run.dirty =
      rev.status === 0
        ? !!spawnSync("git", ["status", "--porcelain"], {
            encoding: "utf8",
            windowsHide: true,
          }).stdout.trim()
        : null;
  } else
    throw Error(
      "Use import ADAPTER FILE or capture structural|browser|bridge|collector",
    );
  const result = await recordRun(run);
  console.log(
    JSON.stringify({
      ...result,
      suite: run.suite,
      checks: run.results.length,
      counts: Object.fromEntries(
        ["PASS", "FAIL", "SKIP", "ERROR"].map((status) => [
          status,
          run.results.filter((r) => r.outcome === status).length,
        ]),
      ),
    }),
  );
  if (run.results.some((r) => ["FAIL", "ERROR"].includes(r.outcome)))
    process.exitCode = 1;
} catch (e) {
  console.error(
    [
      "IMPORT_CONFLICT",
      "INVALID_RUN",
      "INVALID_RESULT",
      "INVALID_TIMING",
      "INVALID_RESULTS",
      "SOURCE_MISSING_DATE_OR_CASES",
      "UNKNOWN_ADAPTER",
      "RUNNER_NOT_ALLOWLISTED",
      "HISTORICAL_TAP_REQUIRES_ORIGINAL_TIMESTAMPS",
    ].includes(e.message)
      ? e.message
      : "COLLECTION_FAILED: no private diagnostics printed",
  );
  process.exitCode = 1;
}
