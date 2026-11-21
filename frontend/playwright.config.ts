import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 90000,
  workers: 1,
  use: { baseURL: process.env.EDITOR_BASE_URL || "http://localhost:3000", browserName: "chromium", headless: true, trace: "retain-on-failure" },
  outputDir: "/tmp/sea-editor-test-results",
  reporter: "list",
});
