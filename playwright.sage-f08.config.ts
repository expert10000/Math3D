import { defineConfig } from "@playwright/test";

// Opt-in release gate: real WSL Ubuntu Sage and the Docker Sage service are required.
export default defineConfig({
  testDir: "./tests",
  testMatch: [
    "**/sage-live-desktop/*.spec.ts",
    "**/e2e/sage-console-desktop.spec.ts",
    "**/e2e/workbook-sage-code.spec.ts",
  ],
  timeout: 360_000,
  workers: 1,
  reporter: "list",
  use: { actionTimeout: 30_000 },
});
