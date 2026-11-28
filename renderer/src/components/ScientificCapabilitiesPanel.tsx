import React, { useState } from "react";
import { MATH3D_PLATFORM_DISCOVERY, SCIENTIFIC_CAPABILITY_REGISTRY, SCIENTIFIC_MODULES,
  resolveScientificOperationAvailability,
  scientificParameterFields,
  scientificWorkflowNode,
  type ScientificCapability, type ScientificEnvironment, type ScientificModule,
  type ScientificOperationDescriptor } from "@math3d/core";
import { MODULE_WORKSPACE_ENTRY, MODULE_WORKSPACE_FEATURES,
  type ModuleWorkspaceFeature } from "./moduleWorkspaceFeatures";

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
    workspaceFeatures: MODULE_WORKSPACE_FEATURES[module],
    available,
    unavailableOperations: operations.filter(operation => !available.some(item => item.id === operation.id)),
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
  onOpenWorkspace, onClose }: {
  initialModule: ScientificModule;
  environment: ScientificEnvironment;
  implementations: readonly string[];
  onOpenOperation: (id: string) => void;
  onOpenWorkspace: (module: ScientificModule, group: ModuleWorkspaceFeature["group"] | "All") => void;
  onClose: () => void;
}) {
  const [module, setModule] = useState(initialModule);
  const [query, setQuery] = useState("");
  const [featureGroup, setFeatureGroup] = useState<ModuleWorkspaceFeature["group"] | "All">("All");
  const groups = scientificCapabilityGroups(module, environment, implementations);
  const matches = (item: { id: string; title: string; detail?: string; group?: string }) =>
    `${item.id} ${item.title} ${item.detail ?? ""} ${item.group ?? ""}`
      .toLowerCase().includes(query.trim().toLowerCase());
  const visibleAvailable = groups.available.filter(matches);
  const groupOrder: readonly ModuleWorkspaceFeature["group"][] =
    ["Create", "Edit", "View", "Analyze", "Export", "Study"];
  const matchingWorkspace = groups.workspaceFeatures.filter(matches);
  const visibleWorkspace = matchingWorkspace.filter(item =>
    featureGroup === "All" || item.group === featureGroup);
  const visibleUnavailableOperations = groups.unavailableOperations.filter(matches);
  const visibleRegistered = groups.registered.filter(matches);
  const visiblePlanned = groups.planned.filter(matches);
  return <section data-testid="scientific-capabilities-panel" aria-label="Scientific capabilities"
    style={{ border: "1px solid #aac9f5", borderRadius: 12, background: "#f6faff",
      padding: "12px 16px", display: "grid", gap: 12, maxHeight: "min(55vh, 540px)", overflow: "auto" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <strong>Scientific capabilities</strong>
      <label>Module <select data-testid="scientific-capabilities-module" value={module}
        onChange={event => { setModule(event.target.value as ScientificModule); setFeatureGroup("All"); }}>
        {SCIENTIFIC_MODULES.map(id => <option key={id} value={id}>{MODULE_LABELS[id]}</option>)}
      </select></label>
      <input aria-label="Search capabilities" placeholder="Search capabilities" value={query}
        onChange={event => setQuery(event.target.value)} />
      <button type="button" onClick={onClose} style={{ marginLeft: "auto" }}>Close</button>
    </div>
    <small>Workspace entries describe existing tools and registered analysis kinds. A tool may need a compatible source or runtime; a registered kind is not necessarily an executable operation. Verified operations are listed separately below.</small>
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <strong>In Math3D ({visibleWorkspace.length})</strong>
        <span>{MODULE_WORKSPACE_ENTRY[module]}</span>
        {visibleWorkspace.length > 0 && module !== "graph3d" &&
          <button type="button" onClick={() => onOpenWorkspace(module, featureGroup)}>
            {module === "field" ? "Open Graphs" : module === "quantum" ? "Open verified examples" : "Open workspace"}
          </button>}
      </div>
      {visibleWorkspace.length === 0 && <span>{matchingWorkspace.length === 0
        ? "No dedicated workspace feature is recorded for this module in this build. Check registered and planned capabilities below."
        : "No feature in this group matches the search."}</span>}
      {matchingWorkspace.length > 0 && <div aria-label="Feature groups" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {(["All", ...groupOrder] as const).map(group => {
          const count = group === "All" ? matchingWorkspace.length :
            matchingWorkspace.filter(item => item.group === group).length;
          return count > 0 && <button key={group} type="button" aria-pressed={featureGroup === group}
            onClick={() => setFeatureGroup(group)}>{group} ({count})</button>;
        })}
      </div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 8 }}>
        {visibleWorkspace.map(feature => <div key={feature.id} style={cardStyle}
          data-testid={`workspace-feature-${feature.id}`}>
          <strong>{feature.title}</strong>
          <small>{feature.group} · {feature.id}</small>
          <small>{feature.detail}</small>
        </div>)}
      </div>
    </div>
    <div style={{ display: "grid", gap: 8 }}>
      <strong>Available here ({visibleAvailable.length})</strong>
      {visibleAvailable.length === 0 && <span>No verified operation in this app for {MODULE_LABELS[module]}.</span>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 8 }}>
        {visibleAvailable.map(operation => <div key={operation.id} style={cardStyle}
          data-testid={`available-operation-${operation.id}`}>
          <strong>{operation.title}</strong><small>{operation.id}</small>
          <small>{operation.description}</small>
          {scientificParameterFields(operation).length > 0 && <small>Parameters: {scientificParameterFields(operation)
            .map(field => `${field.name}${field.schema.default === undefined ? "" : `=${field.schema.default}`}`)
            .join(", ")}</small>}
          {scientificWorkflowNode(operation, { environment, implementations }) &&
            <small>Workflow node: operation.{operation.id}</small>}
          <button type="button" onClick={() => onOpenOperation(operation.id)}>Open computation</button>
        </div>)}
      </div>
    </div>
    <div style={{ display: "grid", gap: 8 }}>
      <strong>Registered operations, unavailable here ({visibleUnavailableOperations.length})</strong>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 8 }}>
        {visibleUnavailableOperations.map(operation => <div key={operation.id} style={cardStyle}
          data-testid={`unavailable-operation-${operation.id}`}>
          <strong>{operation.title}</strong><small>{operation.id}</small>
          <small>{operation.schemaCompleteness === "complete" ? "Complete contract" : "Operation-specific contract pending"}</small>
          <small>{resolveScientificOperationAvailability(operation.id,
            { environment, implementations }).reason}</small>
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
