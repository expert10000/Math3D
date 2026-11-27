import React, { useState } from "react";
import { MATH3D_PLATFORM_DISCOVERY, SCIENTIFIC_CAPABILITY_REGISTRY, SCIENTIFIC_MODULES,
  resolveScientificOperationAvailability,
  type ScientificCapability, type ScientificEnvironment, type ScientificModule,
  type ScientificOperationDescriptor } from "@math3d/core";

const MODULE_LABELS: Record<ScientificModule, string> = {
  graph2d: "Graph 2D", graph3d: "Graph 3D", curve: "Curves", surface: "Surfaces",
  mesh: "Mesh", geometry: "Geometry", volume: "Volume", topology: "Topology",
  cas: "CAS / Algebra", "number-theory": "Number Theory", complex: "Complex Analysis",
  field: "Field Explorer", quantum: "Quantum",
};

export function scientificCapabilityGroups(module: ScientificModule, environment: ScientificEnvironment,
  implementations: readonly string[]) {
  const capabilities = SCIENTIFIC_CAPABILITY_REGISTRY.forModule(module);
  const operations = MATH3D_PLATFORM_DISCOVERY.list("scientific-operations")
    .filter((entry): entry is ScientificOperationDescriptor =>
      entry.kind === "scientific-operations" && (entry as ScientificOperationDescriptor).module === module);
  const available = operations.filter(operation =>
    resolveScientificOperationAvailability(operation.id, { environment, implementations }).available);
  const availableIds = new Set(available.flatMap(operation => operation.capabilityIds));
  return {
    available,
    registered: capabilities.filter(capability => capability.status === "operation-registered" &&
      !availableIds.has(capability.id)),
    planned: capabilities.filter(capability => capability.status === "catalogued"),
  };
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #c9d9ee", borderRadius: 10, padding: "10px 12px",
  background: "var(--math3d-panel-bg, #fff)", display: "grid", gap: 4,
};

function CapabilityCard({ capability }: { capability: ScientificCapability }) {
  return <div style={cardStyle} data-testid={`capability-${capability.id}`}>
    <strong>{capability.title}</strong>
    <small>{capability.id}</small>
    {capability.outputs.length > 0 && <small>Outputs: {capability.outputs.map(output =>
      `${output.name}${output.units ? ` (${output.units})` : ""}`).join(", ")}</small>}
  </div>;
}

export function ScientificCapabilitiesPanel({ initialModule, environment, implementations, onOpenOperation,
  onClose }: {
  initialModule: ScientificModule;
  environment: ScientificEnvironment;
  implementations: readonly string[];
  onOpenOperation: (id: string) => void;
  onClose: () => void;
}) {
  const [module, setModule] = useState(initialModule);
  const [query, setQuery] = useState("");
  const groups = scientificCapabilityGroups(module, environment, implementations);
  const matches = (item: { id: string; title: string }) =>
    `${item.id} ${item.title}`.toLowerCase().includes(query.trim().toLowerCase());
  const visibleAvailable = groups.available.filter(matches);
  const visibleRegistered = groups.registered.filter(matches);
  const visiblePlanned = groups.planned.filter(matches);
  return <section data-testid="scientific-capabilities-panel" aria-label="Scientific capabilities"
    style={{ border: "1px solid #aac9f5", borderRadius: 12, background: "#f6faff",
      padding: "12px 16px", display: "grid", gap: 12, maxHeight: "min(55vh, 540px)", overflow: "auto" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <strong>Scientific capabilities</strong>
      <label>Module <select data-testid="scientific-capabilities-module" value={module}
        onChange={event => setModule(event.target.value as ScientificModule)}>
        {SCIENTIFIC_MODULES.map(id => <option key={id} value={id}>{MODULE_LABELS[id]}</option>)}
      </select></label>
      <input aria-label="Search capabilities" placeholder="Search capabilities" value={query}
        onChange={event => setQuery(event.target.value)} />
      <button type="button" onClick={onClose} style={{ marginLeft: "auto" }}>Close</button>
    </div>
    <small>Availability reflects this running app. Registered operations need a verified host binding before they can run here.</small>
    <div style={{ display: "grid", gap: 8 }}>
      <strong>Available here ({visibleAvailable.length})</strong>
      {visibleAvailable.length === 0 && <span>No verified operation in this app for {MODULE_LABELS[module]}.</span>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 8 }}>
        {visibleAvailable.map(operation => <div key={operation.id} style={cardStyle}
          data-testid={`available-operation-${operation.id}`}>
          <strong>{operation.title}</strong><small>{operation.id}</small>
          <small>{operation.description}</small>
          <button type="button" onClick={() => onOpenOperation(operation.id)}>Open computation</button>
        </div>)}
      </div>
    </div>
    <div style={{ display: "grid", gap: 8 }}>
      <strong>Registered, not available here ({visibleRegistered.length})</strong>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 8 }}>
        {visibleRegistered.map(capability => <CapabilityCard key={capability.id} capability={capability} />)}
      </div>
    </div>
    <div style={{ display: "grid", gap: 8 }}>
      <strong>Planned ({visiblePlanned.length})</strong>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 8 }}>
        {visiblePlanned.map(capability => <CapabilityCard key={capability.id} capability={capability} />)}
      </div>
    </div>
  </section>;
}
