import base from "./playwright.projects.config";
import { defineConfig } from "@playwright/test";
export default defineConfig({ ...base, testMatch: "projectMobileSurfaces.spec.ts", outputDir: "test-results/projects-surfaces-web" });
