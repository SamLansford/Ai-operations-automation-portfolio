// Operator-only fixed suites. Preserve later results even if an earlier suite fails.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const cli = fileURLToPath(
  new URL("./collect-test-results.mjs", import.meta.url),
);
let failed = false;
for (const suite of ["structural", "bridge", "collector"]) {
  const p = spawnSync(process.execPath, [cli, "capture", suite], {
    stdio: "inherit",
    windowsHide: true,
  });
  if (p.status !== 0) failed = true;
}
if (failed) process.exitCode = 1;
