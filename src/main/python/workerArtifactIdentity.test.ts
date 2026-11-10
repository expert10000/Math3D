import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { identifyWorkerArtifact } from "./workerArtifactIdentity";

describe("installed Python worker identity", () => {
  it("hashes the actual packaged worker and distinguishes an override", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "math3d-worker-identity-"));
    try {
      const resourcesPath = path.join(root, "resources");
      const packagedDir = path.join(resourcesPath, "python-worker");
      fs.mkdirSync(packagedDir, { recursive: true });
      const command = path.join(packagedDir, "worker.exe");
      fs.writeFileSync(command, "worker-bytes");
      const identity = await identifyWorkerArtifact({ backend: "bundled-exe", command, packaged: true, resourcesPath, packageVersion: "2.0.0" });
      expect(identity).toEqual({ packaged: true, launchOrigin: "packaged-resource", packageVersion: "2.0.0",
        artifactSha256: createHash("sha256").update("worker-bytes").digest("hex") });
      const override = path.join(root, "worker.exe");
      fs.writeFileSync(override, "different-worker");
      expect((await identifyWorkerArtifact({ backend: "bundled-exe", command: override, packaged: true, resourcesPath, packageVersion: "2.0.0" })).launchOrigin).toBe("override");
      const sibling = path.join(packagedDir, "helper.exe");
      fs.writeFileSync(sibling, "helper");
      expect((await identifyWorkerArtifact({ backend: "bundled-exe", command: sibling, packaged: true, resourcesPath, packageVersion: "2.0.0" })).launchOrigin).toBe("override");
      fs.rmSync(command);
      fs.symlinkSync(override, command, "file");
      expect((await identifyWorkerArtifact({ backend: "bundled-exe", command, packaged: true, resourcesPath, packageVersion: "2.0.0" })).launchOrigin).toBe("override");
      expect((await identifyWorkerArtifact({ backend: "python-script", command: "python", packaged: false, resourcesPath, packageVersion: null })).launchOrigin).toBe("source-script");
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});
