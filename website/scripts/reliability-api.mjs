import { listRuns, getRun } from "./test-results-store.mjs";
const rates = new Map();
let active = 0;
export async function handleReliability(req, res, port) {
  const send = (status, body) => {
    const text = JSON.stringify(body);
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(text);
  };
  if (req.headers.host !== "127.0.0.1:" + port)
    return send(403, { error: "REQUEST_NOT_ALLOWED" });
  if (req.headers.origin && req.headers.origin !== "http://127.0.0.1:" + port)
    return send(403, { error: "REQUEST_NOT_ALLOWED" });
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return send(405, { error: "READ_ONLY_API" });
  }
  const url = new URL(req.url, "http://local");
  let action;
  if (url.pathname === "/api/reliability/runs") {
    if (
      [...url.searchParams.keys()].some(
        (x) => !["limit", "cursor", "needsReview"].includes(x),
      )
    )
      return send(400, { error: "INVALID_QUERY" });
    const value = url.searchParams.get("limit");
    if (value !== null && !/^\d{1,2}$/.test(value))
      return send(400, { error: "INVALID_QUERY" });
    if (
      url.searchParams.has("needsReview") &&
      url.searchParams.get("needsReview") !== "1"
    )
      return send(400, { error: "INVALID_QUERY" });
    action = () =>
      listRuns({
        limit: value === null ? 20 : Number(value),
        cursor: url.searchParams.get("cursor"),
        needsReview: url.searchParams.get("needsReview") === "1",
      });
  } else if (
    /^\/api\/reliability\/runs\/[a-f0-9-]+$/i.test(url.pathname) &&
    !url.search
  )
    action = () => getRun(url.pathname.split("/").at(-1));
  else return send(404, { error: "NOT_FOUND" });
  const now = Date.now();
  for (const [k, v] of rates) if (v.until < now) rates.delete(k);
  const ip = req.socket.remoteAddress;
  const rate = rates.get(ip) || { count: 0, until: now + 60000 };
  rates.set(ip, rate);
  if (++rate.count > 120 || active >= 4) {
    res.setHeader("Retry-After", "5");
    return send(429, { error: "READ_LIMIT_REACHED" });
  }
  active++;
  try {
    const result = await action();
    if (!result) return send(404, { error: "RUN_NOT_FOUND" });
    if (Buffer.byteLength(JSON.stringify(result)) > 750000)
      return send(503, { error: "RESULT_TOO_LARGE" });
    send(200, result);
  } catch (e) {
    send(e.message === "INVALID_QUERY" ? 400 : 503, {
      error:
        e.message === "INVALID_QUERY" ? "INVALID_QUERY" : "RESULTS_UNAVAILABLE",
    });
  } finally {
    active--;
  }
}
