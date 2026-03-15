import { app, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { PythonWorkerBackend, PythonWorkerStartupStatus } from "./pythonWorker";

export type PythonWorkerFailureCategory =
  | "worker-missing"
  | "startup-crash"
  | "dependency-load-failure"
  | "operation-timeout"
  | "unknown";

export type PythonWorkerDiagnosticsError = {
  category: PythonWorkerFailureCategory;
  code: string;
  message: string;
  detail: string;
  context: string;
  fatal: boolean;
  at: number;
};

export type PythonWorkerDiagnosticsSnapshot = {
  startupChecked: boolean;
  available: boolean;
  statusMessage: string;
  backend?: PythonWorkerBackend;
  version?: string;
  protocol?: string;
  command?: string;
  args?: string[];
  logPath: string;
  lastCheckAt: number;
  lastError?: PythonWorkerDiagnosticsError;
};

type MutableDiagnosticsState = PythonWorkerDiagnosticsSnapshot;

const fallbackLogPath = path.join(process.cwd(), "output", "logs", "python-worker-diagnostics.log");

const state: MutableDiagnosticsState = {
  startupChecked: false,
  available: false,
  statusMessage: "Python worker diagnostics pending.",
  logPath: fallbackLogPath,
  lastCheckAt: Date.now(),
};

let diagnosticsIpcRegistered = false;

function resolveLogPath(): string {
  try {
    const base = app.getPath("userData");
    if (base && typeof base === "string") {
      return path.join(base, "logs", "python-worker-diagnostics.log");
    }
  } catch {
    // fall back when app path is not yet available
  }
  return fallbackLogPath;
}

function syncLogPath(): string {
  state.logPath = resolveLogPath();
  return state.logPath;
}

function appendDiagnosticsLog(level: "info" | "warn" | "error", event: string, payload: Record<string, unknown>): void {
  const logPath = syncLogPath();
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...payload,
  });
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, line + "\n", "utf8");
  } catch {
    // diagnostics must never crash app flow
  }
}

function normalizeErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "");
  }
  return String(error ?? "");
}

function classifyFailureCategory(rawMessage: string, code?: string): PythonWorkerFailureCategory {
  const text = rawMessage.toLowerCase();
  const codeText = String(code ?? "").toLowerCase();
  if (text.includes("timeout for jobid") || codeText.includes("timeout")) {
    return "operation-timeout";
  }
  if (
    text.includes("bundled worker executable not found") ||
    text.includes("python worker entrypoint not found") ||
    (text.includes("not found") && text.includes("worker")) ||
    (text.includes("enoent") && text.includes("worker"))
  ) {
    return "worker-missing";
  }
  if (
    text.includes("no module named") ||
    text.includes("modulenotfounderror") ||
    text.includes("importerror") ||
    text.includes("dll load failed")
  ) {
    return "dependency-load-failure";
  }
  if (
    text.includes("exited with code") ||
    text.includes("startup failed") ||
    text.includes("spawn") ||
    codeText === "worker_startup_failed" ||
    codeText === "ping_failed"
  ) {
    return "startup-crash";
  }
  return "unknown";
}

function shortenDetail(value: string, max = 260): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max) + "...";
}

function buildActionableMessage(category: PythonWorkerFailureCategory, context: string): string {
  const logPath = syncLogPath();
  if (category === "worker-missing") {
    return `Python worker is missing (${context}). Reinstall app or rebuild installer. Log: ${logPath}`;
  }
  if (category === "startup-crash") {
    return `Python worker crashed during startup (${context}). Restart app and check worker log. Log: ${logPath}`;
  }
  if (category === "dependency-load-failure") {
    return `Python worker dependency load failed (${context}). Rebuild worker dependencies and check log. Log: ${logPath}`;
  }
  if (category === "operation-timeout") {
    return `Python worker operation timed out (${context}). Try lower resolution/smaller input, then retry. Log: ${logPath}`;
  }
  return `Python worker request failed (${context}). Check worker log for details. Log: ${logPath}`;
}

function isFatalCategory(category: PythonWorkerFailureCategory): boolean {
  return category !== "operation-timeout";
}

function updateStateFromStartupStatus(status: PythonWorkerStartupStatus): void {
  state.startupChecked = true;
  state.lastCheckAt = Date.now();
  if ("backend" in status && status.backend) {
    state.backend = status.backend;
  }
  if ("command" in status && status.command) {
    state.command = status.command;
  }
  if ("args" in status && Array.isArray(status.args)) {
    state.args = [...status.args];
  }
}

export function recordPythonWorkerStartup(status: PythonWorkerStartupStatus): void {
  updateStateFromStartupStatus(status);
  if (status.ok) {
    state.available = true;
    state.version = status.version;
    state.protocol = status.protocol;
    state.lastError = undefined;
    state.statusMessage = `Python worker available (${status.version}, ${status.protocol}).`;
    appendDiagnosticsLog("info", "startup-ok", {
      backend: status.backend,
      version: status.version,
      protocol: status.protocol,
      command: status.command,
      args: status.args,
    });
    return;
  }

  const raw = status.error?.message ?? "Python worker startup failed";
  const code = status.error?.code ?? "WORKER_STARTUP_FAILED";
  recordPythonWorkerFailure(raw, "startup", code);
}

export function recordPythonWorkerSuccess(fields?: {
  backend?: PythonWorkerBackend;
  version?: string;
  protocol?: string;
}): void {
  const wasAvailable = state.available;
  syncLogPath();
  state.startupChecked = true;
  state.available = true;
  state.lastCheckAt = Date.now();
  state.lastError = undefined;
  if (fields?.backend) state.backend = fields.backend;
  if (fields?.version) state.version = fields.version;
  if (fields?.protocol) state.protocol = fields.protocol;
  state.statusMessage = state.version
    ? `Python worker available (${state.version}${state.protocol ? `, ${state.protocol}` : ""}).`
    : "Python worker available.";

  if (!wasAvailable) {
    appendDiagnosticsLog("info", "worker-recovered", {
      backend: state.backend,
      version: state.version,
      protocol: state.protocol,
    });
  }
}

export function recordPythonWorkerFailure(
  error: unknown,
  context: string,
  code = "WORKER_ERROR"
): PythonWorkerDiagnosticsError {
  const rawMessage = normalizeErrorMessage(error) || "Python worker failure";
  const category = classifyFailureCategory(rawMessage, code);
  const fatal = isFatalCategory(category);
  const diagError: PythonWorkerDiagnosticsError = {
    category,
    code,
    message: buildActionableMessage(category, context),
    detail: shortenDetail(rawMessage),
    context,
    fatal,
    at: Date.now(),
  };

  syncLogPath();
  state.startupChecked = true;
  state.lastCheckAt = diagError.at;
  if (fatal) {
    state.available = false;
  }
  state.lastError = diagError;
  state.statusMessage = diagError.message;

  appendDiagnosticsLog("error", "worker-failure", {
    category: diagError.category,
    code: diagError.code,
    context: diagError.context,
    fatal: diagError.fatal,
    detail: diagError.detail,
  });

  return diagError;
}

export function getPythonWorkerDiagnosticsSnapshot(): PythonWorkerDiagnosticsSnapshot {
  syncLogPath();
  return {
    ...state,
    args: state.args ? [...state.args] : undefined,
    lastError: state.lastError ? { ...state.lastError } : undefined,
  };
}

export function registerPythonWorkerDiagnosticsIpc(): void {
  if (diagnosticsIpcRegistered) return;
  diagnosticsIpcRegistered = true;
  ipcMain.handle("python-worker:diagnostics:get", async (): Promise<PythonWorkerDiagnosticsSnapshot> => {
    return getPythonWorkerDiagnosticsSnapshot();
  });
}
