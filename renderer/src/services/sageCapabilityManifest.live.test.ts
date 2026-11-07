import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import { isLocalSageOperation } from "../integrations/sage/sageClient";
import { normalizeSageHealth, SAGE_OPERATIONS } from "../integrations/sage/sageSchemas";
import { createSageExecutionRegistry, validateSageCapabilityManifest } from "./sageOperationExecution";

it.skipIf(process.env.MATH3D_SAGE_LIVE !== "1")(
  "SAGE-F06 reports actual WSL and Docker versions with route-specific capabilities", async () => {
    const versionText = execFileSync("wsl.exe", ["-d", "Ubuntu", "--exec", "/usr/bin/sage", "--version"],
      { encoding: "utf8", timeout: 30_000 });
    const localVersion = /SageMath version (\d+\.\d+(?:\.\d+)?)/.exec(versionText)?.[1];
    expect(localVersion).toBeTruthy();
    const response = await fetch("http://127.0.0.1:8767/health");
    expect(response.status).toBe(200);
    const dockerHealth = normalizeSageHealth(await response.json());
    const localHealth = normalizeSageHealth({ status: versionText.trim(), engine: "sagemath",
      engineVersion: localVersion, available: true,
      operations: SAGE_OPERATIONS.filter(isLocalSageOperation) });
    const registry = createSageExecutionRegistry({ health: async (backend) =>
      backend === "local" ? localHealth : dockerHealth, consoleAvailable: () => false });
    const [local, docker] = await Promise.all([registry.probeBackend("local"), registry.probeBackend("docker")]);
    expect(local.manifest.sageVersion).toBe(localVersion);
    expect(docker.manifest.sageVersion).toBe(dockerHealth.engineVersion);
    expect(local.manifest.operations.find((item) => item.id === "sage.polynomial.factor")?.supported).toBe(true);
    expect(local.manifest.operations.find((item) => item.id === "sage.algebra.reconstruct"))
      .toMatchObject({ supported: false, reasonCode: "route-excluded" });
    expect(docker.manifest.operations.find((item) => item.id === "sage.algebra.reconstruct")?.supported).toBe(true);
    expect(validateSageCapabilityManifest(local.manifest, "local", localHealth)).toEqual(local.manifest);
    expect(validateSageCapabilityManifest(docker.manifest, "docker", dockerHealth)).toEqual(docker.manifest);
  }, 45_000);
