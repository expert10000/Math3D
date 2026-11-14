import { defineConfig } from "@playwright/test";

// Run only the four release journeys against the executable verified by the installer gate.
export default defineConfig({
  testDir: "./tests",
  testMatch: [
    "**/project-surface-ridge-publication.spec.ts",
    "**/quantum-qi08-study-handoff.spec.ts",
    "**/casLocusJourney.spec.ts",
    "**/casDockerIdealJourney.spec.ts",
    "**/project-field-flagship-journey.spec.ts",
  ],
  timeout: 360_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: process.env.MATH3D_RELEASE20_JOURNEY_REPORT ||
    "test-results/release20-journeys-playwright.json" }]],
  outputDir: "test-results/release20-journeys-playwright",
  use: { trace: "retain-on-failure", screenshot: "only-on-failure", video: "retain-on-failure" },
});
