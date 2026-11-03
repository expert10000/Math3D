import { useEffect, useState } from "react";
import { algebraOperationsFor, type AlgebraObjectRef, type AlgebraRouteCapability,
  type Math3DProject } from "@math3d/core";
import { sageExecutionRegistry } from "../../services/sageOperationExecution";

type Props = { project: Math3DProject | null; target: AlgebraObjectRef | null };

export default function SageObjectOperations({ project, target }: Props) {
  const [routes, setRoutes] = useState<readonly AlgebraRouteCapability[]>([]);
  const [checking, setChecking] = useState(false);
  const refresh = async () => {
    setChecking(true);
    try {
      const probes = await Promise.all([sageExecutionRegistry.probeBackend("docker"),
        sageExecutionRegistry.probeBackend("private")]);
      setRoutes(probes.map((probe) => ({ backend: probe.backend as "docker" | "private",
        available: probe.health.available, operations: probe.operations.map((item) => item.operationType),
        reason: probe.health.available ? undefined : probe.health.status })));
    } finally { setChecking(false); }
  };
  useEffect(() => { void refresh(); }, []);
  if (!project || !target) return <section data-testid="cas-object-operations" role="status" style={{ fontSize: 12 }}>
    Select a saved structure to see compatible object operations.</section>;
  const operations = algebraOperationsFor(project, target, routes);
  const eligible = operations.filter((item) => item.eligible);
  const excluded = operations.filter((item) => !item.eligible);
  const runtimeLabel = (item: typeof operations[number]) => {
    if (item.readyBackend) return `Compatible · ${item.readyBackend} route ready`;
    if (!routes.length) return "Compatible · Checking Sage runtimes";
    const connected = routes.filter((route) => item.definition.backends.includes(route.backend) && route.available);
    return connected.length ? "Compatible · Operation not advertised by the connected worker"
      : `Compatible · ${item.definition.backends.join(" or ")} worker unavailable`;
  };
  return <section data-testid="cas-object-operations" style={{ display: "grid", gap: 8, fontSize: 12,
    border: "1px solid #dbe2ea", borderRadius: 8, padding: 10, marginBottom: 12 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
      <strong>Selected-object operations</strong>
      <button type="button" onClick={() => { void refresh(); }} disabled={checking} style={{ fontSize: 11 }}>Refresh</button>
    </div>
    <div style={{ color: "#64748b", fontSize: 11 }}>Compatibility uses the saved object kind and pinned parent. Services below accept independent exploratory inputs.</div>
    {routes.length > 0 && <div data-testid="cas-object-runtime-status" role="status" style={{ color: "#64748b", fontSize: 11 }}>
      {routes.map((route) => `${route.backend}: ${route.available ? "available" : route.reason ?? "unavailable"}`).join(" · ")}
    </div>}
    {eligible.length ? eligible.map((item) => <div key={item.definition.id} data-testid={`cas-object-operation-${item.definition.id}`}
      style={{ display: "grid", gap: 2, borderTop: "1px solid #e2e8f0", paddingTop: 6 }}>
      <strong>{item.definition.label}</strong>
      <span style={{ color: item.readyBackend ? "#16703b" : "#9a3412", fontSize: 11 }}>{runtimeLabel(item)}</span>
    </div>) : <div role="status" style={{ color: "#9a3412" }}>{operations[0]?.reason ?? "No compatible operation for this selection."}</div>}
    {excluded.length > 0 && <details><summary>{excluded.length} excluded by object kind, parent, or freshness</summary>
      <ul style={{ paddingLeft: 18, margin: "6px 0" }}>{excluded.map((item) => <li key={item.definition.id}>
        {item.definition.label}: {item.reason}</li>)}</ul>
    </details>}
    <div style={{ color: "#64748b", fontSize: 11 }}>Object-linked run controls and evidence will follow this registry. Use Services below for freeform calculations now.</div>
  </section>;
}
