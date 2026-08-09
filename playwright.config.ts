import { defineConfig, devices } from "@playwright/test";

const dashboardReporter: [string, Record<string, unknown>] = [
  "./reporters/dashboard-reporter.ts",
  {
    projectName: "Hub de Leitura",
    environment: process.env.TEST_ENV ?? (process.env.CI ? "CI" : "Local"),
  },
];

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }], dashboardReporter]
    : [["list"], ["html", { open: "never" }], dashboardReporter],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // "on" gravava vídeo de 100% dos testes, mas só se assiste o dos que
    // falharam — em suítes grandes isso é a origem de relatórios de ~1 GB.
    // retain-on-failure grava e descarta no final quando o teste passa.
    video: { mode: "retain-on-failure", size: { width: 800, height: 450 } },
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  expect: {
    timeout: 10_000,
  },
  webServer: {
    command: "npm run e2e:server",
    url: "http://localhost:3000/api/health",
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium",
      testIgnore: /.*\.setup\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
