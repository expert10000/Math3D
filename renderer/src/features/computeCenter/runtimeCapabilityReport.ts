import type { ScientificBackendCapabilitySnapshot } from "@math3d/kernel";
import type { PythonWorkerDiagnosticsSnapshot } from "../../services/pythonWorkerDiagnosticsClient";
import type { SageBackend, SageRuntimeProbe } from "../../services/sageOperationExecution";

export type RuntimeState = "ready" | "limited" | "unavailable" | "checking";
export type RuntimeRoute = Readonly<{
  id: string;
  label: string;
  group: "local" | "sage" | "broker" | "manager";
  state: RuntimeState;
  detail: string;
  version: string | null;
  transport: string | null;
  operationCount: number | null;
}>;
export type RuntimeCapabilityReport = Readonly<{ routes: readonly RuntimeRoute[]; checkedAt: number }>;
export type RuntimeProbeResult = Readonly<{ probe?: SageRuntimeProbe; error?: string }>;
export type RuntimeReportInputs = Readonly<{
  webWorker: boolean;
  python: PythonWorkerDiagnosticsSnapshot | null;
  cgal: { ok: boolean; error?: string } | null;
  vtkBridge: boolean;
  engines: ComputeEngineSnapshot | null;
  broker: readonly ScientificBackendCapabilitySnapshot[];
  sage: Partial<Record<SageBackend, RuntimeProbeResult>>;
  checkedAt: number;
}>;

const route = (id: string, label: string, group: RuntimeRoute["group"], state: RuntimeState,
  detail: string, version: string | null = null, transport: string | null = null,
  operationCount: number | null = null): RuntimeRoute =>
  ({ id, label, group, state, detail, version, transport, operationCount });

/** A route is ready only when its own live probe says so. Manager health is not Sage route health. */
export function buildRuntimeCapabilityReport(input: RuntimeReportInputs): RuntimeCapabilityReport {
  const python = input.python;
  const local: RuntimeRoute[] = [
    route("javascript", "JavaScript", "local", "ready", "Local renderer"),
    route("web-worker", "Web Worker", "local", input.webWorker ? "ready" : "unavailable",
      input.webWorker ? "Browser worker available" : "Web Worker unavailable"),
    route("python", "Python worker", "local", !python || !python.startupChecked ? "checking" :
      python.available ? "ready" : "unavailable", python?.statusMessage ?? "Checking worker diagnostics",
      python?.version ?? null, python?.backend ?? null),
    route("vtk", "VTK bridge", "local", !input.vtkBridge ? "unavailable" :
      !python || !python.startupChecked ? "checking" : python.available ? "ready" : "unavailable",
      !input.vtkBridge ? "VTK bridge unavailable" : python?.available ?
        "VTK bridge and Python worker available" : "Python worker unavailable",
      python?.version ?? null, python?.backend ?? null),
    route("cgal", "CGAL", "local", !input.cgal ? "checking" : input.cgal.ok ? "ready" : "unavailable",
      !input.cgal ? "Checking CGAL health" : input.cgal.ok ? "Health check passed" :
        input.cgal.error ?? "CGAL unavailable"),
  ];
  const sage = (["local", "docker", "private"] as const).map((backend) => {
    const result = input.sage[backend];
    const probe = result?.probe;
    const mismatch = probe && (probe.backend !== backend || probe.backendId !== probe.manifest.backendId ||
      probe.backendVersion !== probe.manifest.adapterVersion ||
      (probe.health.engineVersion ?? null) !== probe.manifest.sageVersion);
    const healthy = probe?.health.available === true && probe.manifest.availability === "available" && !mismatch;
    const state: RuntimeState = !result ? "checking" : !healthy ? "unavailable" :
      probe.operations.length ? "ready" : "limited";
    const detail = result?.error ?? (probe ? mismatch ?
      "Route identity or version differs from its capability manifest" : !healthy ?
      probe.manifest.unavailableReason ?? probe.health.status :
      probe.operations.length ? `${probe.operations.length} advertised operation(s)` :
        "Healthy route; no operations advertised" : "Checking route health");
    return route(`sage-${backend}`, backend === "local" ? "Sage Local WSL" :
      backend === "docker" ? "Sage Docker" : "Sage private gateway", "sage", state,
    detail, probe?.health.engineVersion ?? null, probe?.transport ?? null,
    probe?.operations.length ?? null);
  });
  const broker = input.broker.map((item) => route(`broker-${item.backendId}`, item.backendId,
    "broker", item.availability === "available" ? item.operations.length ? "ready" : "limited" : "unavailable",
    item.availability === "available" ? item.operations.length ?
      `${item.operations.length} advertised operation(s)` : "No operations advertised" :
      item.unavailableReason ?? "Backend unavailable", item.backendVersion, item.transport,
    item.operations.length));
  const manager = input.engines ? input.engines.engines.map((engine) => route(
    `manager-${engine.id}`, `${engine.label} managed service`, "manager",
    engine.healthy ? "ready" : engine.running ? "limited" : "unavailable",
    engine.statusText, engine.version ?? null, "Docker manager")) : [];
  return { routes: [...local, ...sage, ...broker, ...manager], checkedAt: input.checkedAt };
}
