import { digest } from "./test-results-store.mjs";
export function categories(name) {
  const tags = [];
  const rules = [
    [
      "Input validation",
      /input|payload|short|contact|identity|malformed|metadata|json/i,
    ],
    ["AI output validation", /classif|model|category|ai output/i],
    [
      "Authentication and authorization",
      /auth|csrf|permission|credential|token/i,
    ],
    [
      "Duplicate protection and idempotency",
      /duplicat|replay|retry|conflict|idempoten/i,
    ],
    [
      "MySQL persistence and transactions",
      /mysql|persist|database|rollback|transaction|saved/i,
    ],
    ["Concurrency", /concurren|parallel|at once/i],
    [
      "Error handling and timeouts",
      /error|timeout|unavailable|failure|offline/i,
    ],
    ["Audit logging", /audit|timeline/i],
    [
      "Browser functionality",
      /browser|navigation|layout|keyboard|page|card|controls|form|filter|responsive/i,
    ],
    [
      "Session isolation and security",
      /session|scope|sanitiz|private|security|isolation|boundar/i,
    ],
  ];
  for (const [label, pattern] of rules)
    if (pattern.test(name)) tags.push(label);
  return tags;
}
const outcome = (x) =>
  ({
    passed: "PASS",
    failed: "FAIL",
    skipped: "SKIP",
    timedOut: "ERROR",
    interrupted: "ERROR",
  })[x] || "ERROR";
function idFrom(text) {
  const h = digest(text);
  return (
    h.slice(0, 8) +
    "-" +
    h.slice(8, 12) +
    "-4" +
    h.slice(13, 16) +
    "-a" +
    h.slice(17, 20) +
    "-" +
    h.slice(20, 32)
  );
}
export function adapt(kind, text, environment = "LOCAL") {
  const artifactDigest = digest(text);
  const base = {
    runId: idFrom(kind + artifactDigest),
    suite: "",
    environment,
    dependencyMode: "ISOLATED",
    provenance: "HISTORICAL_IMPORT",
    startedAt: null,
    completedAt: null,
    observedAt: null,
    durationMs: null,
    revision: null,
    dirty: null,
    fingerprint: null,
    artifactDigest,
    limitations: [
      "Imported recorded evidence; tested source fingerprint was not captured.",
    ],
    results: [],
  };
  const add = (name, status, evidence = {}, durationMs = null) =>
    base.results.push({
      name,
      outcome: status,
      categories: categories(name),
      durationMs,
      errorCode:
        status === "FAIL"
          ? "ASSERTION_FAILED"
          : status === "ERROR"
            ? "RUNNER_ERROR"
            : status === "SKIP"
              ? "SKIPPED"
              : null,
      evidence,
    });
  if (kind === "tap") {
    base.suite = "Local bridge security";
    base.dependencyMode = "MOCKED";
    const nodes = [];let current=null;
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^(\s*)(not )?ok \d+ - (.+?)(?: # (SKIP|TODO).*)?$/);
      if (!m){if(current){const duration=line.match(/^\s+duration_ms:\s*([\d.]+)/);if(duration)current.duration=Number(duration[1]);const failure=line.match(/^\s+failureType:\s*['"]?(testCodeFailure|testTimeoutFailure|cancelledByParent)/);if(failure)current.failure=failure[1];if(/^\s+code:\s*['"]?ERR_ASSERTION/.test(line))current.assertion=true;}continue;}
      const depth = m[1].length,
        children = [];
      while (nodes.length && nodes.at(-1).depth > depth)
        children.unshift(nodes.pop());
      current={
        depth,
        name: m[3],
        status: m[4] ? "SKIP" : m[2] ? "FAIL" : "PASS",
        children,
      };nodes.push(current);
    }
    function leaves(list) {
      for (const item of list)
        if (item.children.length) leaves(item.children);
        else {const status=item.status==='FAIL'&&item.failure&&!item.assertion?'ERROR':item.status;add(item.name,status,{},item.duration??null);if(status==='ERROR')base.results.at(-1).errorCode=item.failure==='testTimeoutFailure'?'TIMEOUT':item.failure==='cancelledByParent'?'INTERRUPTED':'RUNNER_ERROR';}
    }
    leaves(nodes);
    if (!base.results.length) throw Error("NO_ATTRIBUTABLE_CASES");
    return base;
  }
  if (kind === "console") {
    base.suite = "Isolated demo backend checks";
    base.dependencyMode = "MOCKED";
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^(PASS|FAIL|SKIP|ERROR) (.+)$/);
      if (m) add(m[2], m[1]);
    }
    if (!base.results.length) throw Error("NO_ATTRIBUTABLE_CASES");
    return base;
  }
  const data = JSON.parse(text);
  if (kind === "structural") {
    base.suite = "Static website checks";
    base.observedAt = data.generatedAt;
    if (!Array.isArray(data.results)) throw Error("INVALID_SOURCE");
    for (const r of data.results) add(r.name, outcome(r.status));
    base.limitations.push(
      "Original start time and duration were not recorded.",
    );
  } else if (kind === "playwright") {
    base.suite = "Website browser checks";
    base.dependencyMode = "MOCKED";
    base.startedAt = data.stats?.startTime;
    base.durationMs = data.stats?.duration;
    base.completedAt =
      base.startedAt && Number.isFinite(base.durationMs)
        ? new Date(Date.parse(base.startedAt) + base.durationMs).toISOString()
        : null;
    base.observedAt = base.completedAt || base.startedAt;
    function visit(s) {
      for (const spec of s.specs || [])
        for (const t of spec.tests || []) {
          const r = t.results?.at(-1);
          add(
            spec.title + " [" + t.projectName + "]",
            outcome(r?.status),
            {},
            r?.duration ?? null,
          );
          if(r?.status==='timedOut')base.results.at(-1).errorCode='TIMEOUT';
          if(r?.status==='interrupted')base.results.at(-1).errorCode='INTERRUPTED';
        }
      for (const child of s.suites || []) visit(child);
    }
    for (const s of data.suites || []) visit(s);
    for (const e of data.errors || [])
      add("Browser runner completion", "ERROR");
    base.limitations.push(
      "Embedded API responses use explicit fixtures. No production reliability claim.",
    );
  } else if (
    ["live-demo", "live-reliability", "live-workspace"].includes(kind)
  ) {
    base.suite = {
      "live-demo": "Recorded embedded demo integration",
      "live-reliability": "Recorded reliability integration",
      "live-workspace": "Recorded ticket workspace integration",
    }[kind];
    base.dependencyMode = "REAL_INTEGRATION";
    base.observedAt = data.checkedAt;
    base.limitations.push(
      "Only receipt-backed assertions imported; start time, duration and revision unavailable.",
    );
    if (kind === "live-reliability") {
      for (const r of data.results || []) {
        const codes = r.replies.map((x) => x.http);
        let ok;
        if (r.kind === "parallel" || r.kind === "retry")
          ok =
            codes.length === 2 &&
            codes.every((c) => c === 200) &&
            r.replies[0].ticketRef === r.replies[1].ticketRef;
        else if (r.kind === "conflict")
          ok = codes.includes(200) && codes.includes(409);
        else
          ok =
            codes.length === 1 && codes[0] === (r.kind === "csrf" ? 403 : 400);
        add("Real " + r.kind + " request check", ok ? "PASS" : "FAIL", {
          http: codes,
        });
      }
      for (const r of data.database || [])
        add(
          "Persisted ticket audit " + r.execution,
          r.audits === 2 &&
            r.events === "TICKET_CREATED,AI_CLASSIFICATION_ACCEPTED"
            ? "PASS"
            : "FAIL",
          { execution: r.execution, audits: r.audits },
        );
      base.limitations.push(
        "Backend coalescing is not proof of a MySQL lock race.",
      );
    } else {
      if (kind === "live-demo") {
        add(
          "Real classification response",
          data.status === "AUTO_ROUTED" && data.category === "BILLING"
            ? "PASS"
            : "FAIL",
          { http: data.http },
        );
        if (typeof data.replayEqual === "boolean")
          add("Identical retry response", data.replayEqual ? "PASS" : "FAIL", {
            replayEqual: data.replayEqual,
          });
      }
      if (kind === "live-workspace") {
        add(
          "Real ticket submission",
          data.submissionHttp === 200 ? "PASS" : "FAIL",
          { http: [data.submissionHttp] },
        );
        add(
          "Cross-session lookup denied",
          data.crossSessionHttp === 404 ? "PASS" : "FAIL",
          { http: [data.crossSessionHttp] },
        );
        add(
          "Arbitrary stored ID rejected",
          data.arbitraryIdHttp === 400 ? "PASS" : "FAIL",
          { http: [data.arbitraryIdHttp] },
        );
        if (typeof data.reloadVerified === "boolean")
          add("Saved ticket reload", data.reloadVerified ? "PASS" : "FAIL", {
            reloadVerified: data.reloadVerified,
          });
        if (data.unauthLookupHttp)
          add(
            "Unauthenticated lookup denied",
            data.unauthLookupHttp === 403 ? "PASS" : "FAIL",
            { http: [data.unauthLookupHttp] },
          );
      }
      const n = data.audits ?? data.persistedAudits;
      if (n != null)
        add("Persisted ticket audit", n === 2 ? "PASS" : "FAIL", {
          audits: n,
          execution: data.execution,
        });
    }
    for (const key of ["originalUnchanged", "protectedWorkflowsUnchanged"])
      if (typeof data[key] === "boolean")
        add(
          key === "originalUnchanged"
            ? "Original records preserved"
            : "Protected workflows preserved",
          data[key] ? "PASS" : "FAIL",
          { [key]: data[key] },
        );
  } else throw Error("UNKNOWN_ADAPTER");
  if (!base.observedAt || !base.results.length)
    throw Error("SOURCE_MISSING_DATE_OR_CASES");
  return base;
}
