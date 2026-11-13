// Flush trusted local evidence before starting the read-only portfolio server.
import { spawnSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const cli = fileURLToPath(
  new URL("./collect-test-results.mjs", import.meta.url),
);
spawnSync(process.execPath, [cli, "retry"], {
  stdio: "inherit",
  windowsHide: true,
});
const child = spawn(
  process.execPath,
  [
    fileURLToPath(new URL("./serve.mjs", import.meta.url)),
    ...process.argv.slice(2),
  ],
  { stdio: "inherit", windowsHide: true },
);
child.on("exit", (code) => {
  process.exitCode = code || 0;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
