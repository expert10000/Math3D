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
  cliAvailable: boolean;
  dockerAvailable: boolean;
  composeAvailable: boolean;
  command?: string;
  clientVersion?: string;
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
    const env = { ...process.env };
    if (path.isAbsolute(command)) {
      // Docker starts helpers such as docker-credential-desktop by name.
      // Give them the CLI directory even when Electron inherited an older PATH.
      const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") || "PATH";
      env[pathKey] = `${path.dirname(command)}${path.delimiter}${env[pathKey] || ""}`;
    }
    const proc = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      windowsHide: true,
      shell: false,
      env,
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

const dockerCommandCandidates = (): string[] => {
  const candidates = [process.env.MATH3D_DOCKER_CLI, "docker"];
  if (process.platform === "win32") {
    if (process.env.LOCALAPPDATA) {
      candidates.push(path.join(process.env.LOCALAPPDATA, "Programs", "DockerDesktop", "resources", "bin", "docker.exe"));
    }
    if (process.env.ProgramFiles) {
      candidates.push(path.join(process.env.ProgramFiles, "Docker", "Docker", "resources", "bin", "docker.exe"));
    }
  }
  return [...new Set(candidates.filter((candidate): candidate is string => !!candidate))];
};

const detectDocker = async (): Promise<DockerState> => {
  let command: string | undefined;
  let clientVersion: string | undefined;
  let lastError = "Docker CLI is not available.";
  for (const candidate of dockerCommandCandidates()) {
    if (path.isAbsolute(candidate) && !fs.existsSync(candidate)) continue;
    const client = await runCommand(candidate, ["--version"], { timeoutMs: 15_000 });
    if (client.ok) {
      command = candidate;
      clientVersion = trimOutput(client.stdout);
      break;
    }
    lastError = trimOutput(client.stderr || client.stdout || lastError);
  }
  if (!command) return { cliAvailable: false, dockerAvailable: false, composeAvailable: false, error: lastError };
  const [compose, server] = await Promise.all([
    runCommand(command, ["compose", "version", "--short"], { timeoutMs: 15_000 }),
    runCommand(command, ["version", "--format", "{{.Server.Version}}"], { timeoutMs: 15_000 }),
  ]);
  return {
    cliAvailable: true,
    dockerAvailable: server.ok,
    composeAvailable: compose.ok,
    command,
    clientVersion,
    dockerVersion: server.ok ? trimOutput(server.stdout) : undefined,
    composeVersion: compose.ok ? trimOutput(compose.stdout) : undefined,
    error: !compose.ok
      ? trimOutput(compose.stderr || compose.stdout || "Docker Compose is not available.")
      : !server.ok ? trimOutput(server.stderr || server.stdout || "Docker daemon is not available.") : undefined,
  };
};

const inspectContainer = async (engine: EngineDefinition, command: string): Promise<{ installed: boolean; running: boolean; statusText: string }> => {
  const result = await runCommand(
    command,
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
  // A service may be reachable even when Electron cannot find the Docker CLI.
  // Its health is independent of whether this process can manage its container.
  const health = await readHealth(engine);
  if (!docker.dockerAvailable || !docker.composeAvailable) {
    return {
      id: engine.id,
      label: engine.label,
      installed: false,
      running: health.healthy,
      healthy: health.healthy,
      statusText: health.healthy ? "available" : docker.cliAvailable ? "Docker daemon unavailable" : "Docker CLI unavailable",
      containerName: engine.containerName,
      healthUrl: engine.healthUrl,
      version: health.version,
      lastError: health.healthy ? docker.error : health.error || docker.error,
    };
  }
  const container = await inspectContainer(engine, docker.command!);
  return {
    id: engine.id,
    label: engine.label,
    installed: container.installed,
    running: container.running || health.healthy,
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

const dockerArgsFor = (engine: EngineDefinition, action: EngineAction): string[] => {
  const base = ["compose", "-f", engine.composePath];
  if (action === "install") return [...base, "up", "--build", "-d"];
  if (action === "start") return ["start", engine.containerName];
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
  const result = await runCommand(docker.command!, dockerArgsFor(engine, action), {
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
