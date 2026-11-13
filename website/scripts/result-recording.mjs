// Durable sanitized local outbox. No server-side ingestion or test execution endpoint.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeRun,
  insertRun,
  digest,
  validId,
} from "./test-results-store.mjs";
export const outbox = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.local-reports/results-outbox",
);
export async function recordRun(
  input,
  { directory = outbox, deliver = insertRun } = {},
) {
  const run = normalizeRun(input);
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, run.runId + ".json"),
    text = JSON.stringify(run, null, 2);
  if (fs.existsSync(file)) {
    if (digest(fs.readFileSync(file, "utf8")) !== digest(text))
      throw Error("LOCAL_RUN_CONFLICT");
  } else fs.writeFileSync(file, text, { flag: "wx" });
  try {
    const result = await deliver(run);
    fs.writeFileSync(
      path.join(directory, run.runId + ".receipt.json"),
      JSON.stringify({
        runId: run.runId,
        state: "DELIVERED",
        payloadDigest: digest(run),
        deliveredAt: new Date().toISOString(),
      }),
    );
    return { ...result, persistence: "MYSQL" };
  } catch (e) {
    const error =
      e.message === "IMPORT_CONFLICT"
        ? "IMPORT_CONFLICT"
        : "RESULTS_UNAVAILABLE";
    return {
      runId: run.runId,
      replayed: false,
      persistence: "LOCAL_PENDING",
      error,
    };
  }
}
export async function retryPending({
  directory = outbox,
  deliver = insertRun,
} = {}) {
  const result = { delivered: 0, pending: 0, conflicts: 0 };
  if (!fs.existsSync(directory)) return result;
  for (const name of fs
    .readdirSync(directory)
    .filter((n) => n.endsWith(".json") && !n.endsWith(".receipt.json"))) {
    const id = name.slice(0, -5);
    if (!validId(id)) continue;
    if (fs.existsSync(path.join(directory, id + ".receipt.json"))) continue;
    const stored = JSON.parse(
      fs.readFileSync(path.join(directory, name), "utf8"),
    );
    const r = await recordRun(stored, { directory, deliver });
    if (r.persistence === "MYSQL") result.delivered++;
    else {
      result.pending++;
      if (r.error === "IMPORT_CONFLICT") result.conflicts++;
      else break;
    }
  }
  return result;
}
