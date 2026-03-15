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
  backend?: "python-script" | "bundled-exe";
  version?: string;
  protocol?: string;
  command?: string;
  args?: string[];
  logPath: string;
  lastCheckAt: number;
  lastError?: PythonWorkerDiagnosticsError;
};

const fallbackSnapshot = (message: string): PythonWorkerDiagnosticsSnapshot => ({
  startupChecked: true,
  available: false,
  statusMessage: message,
  logPath: "",
  lastCheckAt: Date.now(),
  lastError: {
    category: "unknown",
    code: "DIAGNOSTICS_IPC_UNAVAILABLE",
    message,
    detail: message,
    context: "renderer",
    fatal: true,
    at: Date.now(),
  },
});

export async function getPythonWorkerDiagnostics(): Promise<PythonWorkerDiagnosticsSnapshot> {
  const api = (window as any).pythonWorkerDiagnostics;
  if (!api?.getStatus) {
    return fallbackSnapshot("Python worker diagnostics IPC unavailable.");
  }
  try {
    const status = await api.getStatus();
    if (!status || typeof status !== "object") {
      return fallbackSnapshot("Invalid python worker diagnostics response.");
    }
    return status as PythonWorkerDiagnosticsSnapshot;
  } catch (error: any) {
    const message = error?.message ?? String(error ?? "Failed to read python worker diagnostics.");
    return fallbackSnapshot(message);
  }
}
