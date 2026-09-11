import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.RELAYDESK_URL || "http://127.0.0.1:4177/relaydesk/",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: process.env.RELAYDESK_URL
    ? undefined
    : [
        {
          command: "npm run preview",
          url: "http://127.0.0.1:4177/relaydesk/",
          reuseExistingServer: false,
        },
        {
          command: "node tests/browser-engine.mjs",
          url: "http://127.0.0.1:3012/api/state",
          reuseExistingServer: false,
        },
      ],
  reporter: "list",
});
