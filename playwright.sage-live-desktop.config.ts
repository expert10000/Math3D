import { defineConfig } from "@playwright/test";

// Explicit opt-in: requires SageMath in WSL Ubuntu and the real Docker service.
export default defineConfig({
  testDir: "./tests/sage-live-desktop",
  timeout: 360_000,
  workers: 1,
  reporter: "list",
  use: { actionTimeout: 30_000 },
});
