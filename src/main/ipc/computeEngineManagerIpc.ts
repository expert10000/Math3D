import { app, ipcMain, shell } from "electron";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

type EngineId = "sage" | "octave";
type EngineAction = "install" | "start" | "stop" | "update" | "logs" | "reset";

type EngineDefinition = {
  id: EngineId;
  label: string;
  serviceName: string;
  containerName: string;
  composePath: string;
  healthUrl: string;
};

type DockerState = {
  dockerAvailable: boolean;
  composeAvailable: boolean;
  dockerVersion?: string;
  composeVersion?: string;
  error?: string;
};

type EngineStatus = {
  id: EngineId;
  label: string;
  installed: boolean;
  running: boolean;
  healthy: boolean;
  statusText: string;
  containerName: string;
  healthUrl: string;
  version?: string;
  lastError?: string;
};

type ComputeEngineSnapshot = {
  native: {
    label: "Native Math3D";
    installed: true;
    statusText: "installed";
  };
  docker: DockerState;
  engines: EngineStatus[];
  checkedAt: number;
};

const rootDir = path.resolve(__dirname, "..", "..");
const repoRootCandidates = [
  process.cwd(),
  app.getAppPath(),
  path.resolve(rootDir, ".."),
  path.resolve(process.resourcesPath || "", "app"),
];

const firstExistingPath = (relativePath: string): string => {
  for (const base of repoRootCandidates) {
    const candidate = path.resolve(base, relativePath);
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.resolve(process.cwd(), relativePath);
};

const ENGINES: EngineDefinition[] = [
  {
    id: "sage",
    label: "SageMath Docker",
    serviceName: "sage-worker",
    containerName: "math3d-sage-worker",
    composePath: firstExistingPath("services/sage-worker/docker-compose.yml"),
    healthUrl: String(process.env.MATH3D_SAGE_SERVICE_URL || "http://127.0.0.1:8767").replace(/\/+$/, "") + "/health",
  },
  {
    id: "octave",
    label: "Octave Docker",
    serviceName: "octave-service",
    containerName: "math3d-octave-service",
    composePath: firstExistingPath("integrations/octave/docker/docker-compose.yml"),
    healthUrl: String(process.env.MATH3D_OCTAVE_SERVICE_URL || "http://127.0.0.1:8766").replace(/\/+$/, "") + "/health",
  },
];

const runCommand = (
  command: string,
  args: string[],
  options: { cwd?: string; timeoutMs?: number } = {}
): Promise<{ ok: boolean; stdout: string; stderr: string; exitCode: number | null }> => {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      windowsHide: true,
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      stderr += `\nTimed out after ${options.timeoutMs}ms.`;
      proc.kill();
    }, options.timeoutMs ?? 120_000);
    proc.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    proc.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    proc.on("error", (error) => {
      clearTimeout(timeout);
      resolve({ ok: false, stdout, stderr: stderr || String(error.message || error), exitCode: null });
    });
    proc.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ ok: code === 0, stdout, stderr, exitCode: code });
    });
  });
};

const trimOutput = (value: string): string => value.trim().replace(/\s+/g, " ");

const detectDocker = async (): Promise<DockerState> => {
  const docker = await runCommand("docker", ["version", "--format", "{{.Server.Version}}"], { timeoutMs: 15_000 });
  if (!docker.ok) {
    return {
      dockerAvailable: false,
      composeAvailable: false,
      error: trimOutput(docker.stderr || docker.stdout || "Docker is not available."),
    };
  }
  const compose = await runCommand("docker", ["compose", "version", "--short"], { timeoutMs: 15_000 });
  return {
    dockerAvailable: true,
    composeAvailable: compose.ok,
    dockerVersion: trimOutput(docker.stdout),
    composeVersion: compose.ok ? trimOutput(compose.stdout) : undefined,
    error: compose.ok ? undefined : trimOutput(compose.stderr || compose.stdout || "Docker Compose is not available."),
  };
};

const inspectContainer = async (engine: EngineDefinition): Promise<{ installed: boolean; running: boolean; statusText: string }> => {
  const result = await runCommand(
    "docker",
    ["ps", "-a", "--filter", `name=^/${engine.containerName}$`, "--format", "{{.Status}}"],
    { timeoutMs: 15_000 }
  );
  if (!result.ok) {
    return { installed: false, running: false, statusText: trimOutput(result.stderr || "container status unavailable") };
  }
  const statusText = trimOutput(result.stdout);
  return {
    installed: !!statusText,
    running: /^up\b/i.test(statusText),
    statusText: statusText || "not installed",
  };
};

const readHealth = async (engine: EngineDefinition): Promise<{ healthy: boolean; version?: string; error?: string }> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(engine.healthUrl, { signal: controller.signal });
    const payload = (await response.json().catch(() => null)) as any;
    if (!response.ok) {
      return { healthy: false, error: `HTTP ${response.status}` };
    }
    const status = String(payload?.status || "");
    const engineName = typeof payload?.engine === "string" ? payload.engine : undefined;
    return {
      healthy: status === "ok" || payload?.available === true,
      version: engineName,
    };
  } catch (error) {
    return { healthy: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
};

const buildEngineStatus = async (engine: EngineDefinition, docker: DockerState): Promise<EngineStatus> => {
  if (!docker.dockerAvailable || !docker.composeAvailable) {
    return {
      id: engine.id,
      label: engine.label,
      installed: false,
      running: false,
      healthy: false,
      statusText: "Docker unavailable",
      containerName: engine.containerName,
      healthUrl: engine.healthUrl,
      lastError: docker.error,
    };
  }
  const container = await inspectContainer(engine);
  const health = container.running ? await readHealth(engine) : { healthy: false, error: undefined };
  return {
    id: engine.id,
    label: engine.label,
    installed: container.installed,
    running: container.running,
    healthy: health.healthy,
    statusText: health.healthy ? "available" : container.statusText,
    containerName: engine.containerName,
    healthUrl: engine.healthUrl,
    version: health.version,
    lastError: health.error,
  };
};

const snapshot = async (): Promise<ComputeEngineSnapshot> => {
  const docker = await detectDocker();
  return {
    native: {
      label: "Native Math3D",
      installed: true,
      statusText: "installed",
    },
    docker,
    engines: await Promise.all(ENGINES.map((engine) => buildEngineStatus(engine, docker))),
    checkedAt: Date.now(),
  };
};

const engineById = (id: unknown): EngineDefinition => {
  const engine = ENGINES.find((item) => item.id === id);
  if (!engine) throw new Error(`Unknown compute engine: ${String(id)}`);
  return engine;
};

const composeArgsFor = (engine: EngineDefinition, action: EngineAction): string[] => {
  const base = ["compose", "-f", engine.composePath];
  if (action === "install" || action === "start") return [...base, "up", "--build", "-d"];
  if (action === "update") return [...base, "up", "--build", "--pull", "always", "-d"];
  if (action === "stop") return [...base, "stop"];
  if (action === "reset") return [...base, "down"];
  if (action === "logs") return [...base, "logs", "--tail", "160", engine.serviceName];
  return base;
};

const runEngineAction = async (id: unknown, action: EngineAction) => {
  const docker = await detectDocker();
  if (!docker.dockerAvailable || !docker.composeAvailable) {
    return {
      ok: false,
      engineId: id,
      action,
      error: docker.error || "Docker and Docker Compose are required.",
      snapshot: await snapshot(),
    };
  }
  const engine = engineById(id);
  const result = await runCommand("docker", composeArgsFor(engine, action), {
    cwd: path.dirname(engine.composePath),
    timeoutMs: action === "logs" ? 30_000 : 600_000,
  });
  return {
    ok: result.ok,
    engineId: engine.id,
    action,
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.ok ? undefined : trimOutput(result.stderr || result.stdout || "Docker command failed."),
    snapshot: await snapshot(),
  };
};

export function registerComputeEngineManagerIpc(): void {
  ipcMain.handle("compute-engines:get-status", async () => snapshot());
  ipcMain.handle("compute-engines:run-action", async (_evt, req: { engineId?: EngineId; action?: EngineAction }) => {
    const action = req?.action;
    if (!action || !["install", "start", "stop", "update", "logs", "reset"].includes(action)) {
      throw new Error(`Unsupported compute engine action: ${String(action)}`);
    }
    return runEngineAction(req?.engineId, action);
  });
  ipcMain.handle("compute-engines:open-docker-guide", async () => {
    await shell.openExternal("https://docs.docker.com/desktop/");
    return { ok: true };
  });
}
