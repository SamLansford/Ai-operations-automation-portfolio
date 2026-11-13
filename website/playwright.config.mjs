import { defineConfig } from "@playwright/test";
const testPort=process.env.SAFE_VALIDATION_WORKER==='1'?4175:4174;
export default defineConfig({
  testDir: "tests",
  testMatch: "website.spec.mjs",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 20000,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: ".local-reports/browser.json" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:"+testPort,
    launchOptions: process.env.SAFE_VALIDATION_WORKER==='1'?{args:['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1','--disable-background-networking','--renderer-process-limit=1','--disable-extensions']}:undefined,
    serviceWorkers: process.env.SAFE_VALIDATION_WORKER==='1'?'block':'allow',
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  webServer: {
    command: "node scripts/serve.mjs",
    url: "http://127.0.0.1:"+testPort,
    env: { PORT: String(testPort) },
    reuseExistingServer: false,
  },
  projects: [
    {
      name: "desktop",
      use: { browserName: "chromium", viewport: { width: 1440, height: 1000 } },
    },

  ],
});
