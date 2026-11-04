import type { DerivedProfileProvenance, Math3DProject, ScientificSelection } from "@math3d/core";

const selectionId = (item: ScientificSelection) => item.identity.kind === "authored" ?
  item.identity.id : `${item.identity.ownerDocumentId}:${item.identity.path}`;
const selectionSummary = (item: ScientificSelection) => {
  const { geometry, frame } = item;
  const axis = (index: number) => `${frame.axes[index]?.name ?? `axis ${index + 1}`}${
    frame.axes[index]?.unit ? ` (${frame.axes[index]!.unit})` : ""}`;
  switch (geometry.kind) {
    case "point": return `Point · ${geometry.position.map((value, index) => `${axis(index)} = ${value}`).join(" · ")}`;
    case "oriented-polyline": return `${geometry.closed ? "Closed" : "Open"} oriented polyline · ${geometry.vertices.length} vertices · ${geometry.direction}`;
    case "axis-line": return `Line · ${axis(geometry.varyingAxis)} ${geometry.extent[0]}…${geometry.extent[1]}`;
    case "orthogonal-plane": return `Plane · ${axis(geometry.normalAxis)} = ${geometry.coordinate}`;
    case "plane-region": return `Planar region · ${axis(geometry.normalAxis)} = ${geometry.coordinate}`;
    case "oriented-plane-region": return `Oriented plane · ${axis(geometry.normalAxis)} = ${geometry.coordinate} · ${geometry.normalSign > 0 ? "+" : "−"} normal`;
    case "oriented-box-region": return `Closed box · ${geometry.normal} normal`;
    case "trajectory-seed-recipe": return `Trajectory seeds · ${geometry.recipe.kind}`;
  }
};
const selectionGeometry = (item: ScientificSelection) => {
  const { geometry, frame } = item;
  const coordinate = (index: number, value: number) =>
    `${frame.axes[index]?.name ?? `axis ${index + 1}`} = ${value}${frame.axes[index]?.unit ?
      ` ${frame.axes[index]!.unit}` : ""}`;
  if (geometry.kind === "point") return geometry.position.map((value, index) =>
    coordinate(index, value)).join(" · ");
  if (geometry.kind === "oriented-polyline") return `${geometry.direction} through ${geometry.vertices.map(vertex =>
    `(${vertex.join(", ")})`).join(" → ")}${geometry.closed ? " → start" : ""}`;
  if (geometry.kind === "axis-line") return `Extent ${geometry.extent[0]}…${geometry.extent[1]}; ` +
    geometry.fixedCoordinates.flatMap((value, index) => value === null ? [] :
      [coordinate(index, value)]).join(" · ");
  if (geometry.kind === "oriented-box-region") return `${geometry.normal} boundary; bounds ` +
    geometry.bounds.map((bounds, index) => `${frame.axes[index]?.name ?? `axis ${index + 1}`} ${
      bounds[0]}…${bounds[1]}`).join(" · ");
  if (geometry.kind === "trajectory-seed-recipe") return `${geometry.recipe.kind} seed recipe`;
  const planeAxes = [0, 1, 2].filter(index => index !== geometry.normalAxis);
  return `${coordinate(geometry.normalAxis, geometry.coordinate)}; bounds ` +
    geometry.bounds.map((bounds, index) => `${frame.axes[planeAxes[index]!]?.name ??
      `axis ${planeAxes[index]! + 1}`} ${bounds[0]}…${bounds[1]}${
      frame.axes[planeAxes[index]!]?.unit ? ` ${frame.axes[planeAxes[index]!]!.unit}` : ""}`)
      .join(" · ") + (geometry.kind === "plane-region" && geometry.sampleAxis !== undefined ?
      `; sample axis ${frame.axes[geometry.sampleAxis]?.name ?? geometry.sampleAxis + 1}` : "");
};

/** Read-only Project object index. Native details/links keep it operable without custom tree keys. */
export function FieldExplorerProjectHierarchy({ project, activeSourceId, activeSourceTitle,
  profiles, onInspectProfile, onOpenSourceControls }: { project?: Math3DProject | null; activeSourceId: string;
  activeSourceTitle: string; profiles: readonly DerivedProfileProvenance[];
  onInspectProfile?: (id: string) => void; onOpenSourceControls?: () => void }) {
  const sources = project?.workspace.entries.filter(entry => entry.module === "vector3d" ||
    entry.module === "field") ?? [];
  const activeIsSaved = sources.some(entry => entry.expected.id === activeSourceId);
  const derived = project?.workspace.derivedFields ?? [];
  const selections = project?.workspace.scientificSelections?.filter(item =>
    (item.source?.kind === "document" && item.source.documentId === activeSourceId) ||
    (item.identity.kind === "authored" && item.identity.migratedFrom?.ownerDocumentId === activeSourceId)) ?? [];
  const results = project?.workspace.results.filter(item =>
    item.provenance.source.documentId === activeSourceId) ?? [];
  const activeProfiles = profiles.filter(item => item.source.documentId === activeSourceId);
  const profileById = new Map(activeProfiles.map(item => [item.profileId, item]));
  const sourceControls = onOpenSourceControls ? <button type="button" onClick={onOpenSourceControls}>
    Open field controls</button> : <a href="#field-explorer-source-controls">Source controls</a>;
  return <nav className="field-explorer-project-hierarchy" aria-label="Field Explorer Project objects"
    data-testid="field-explorer-project-hierarchy">
    <h4>Project objects</h4>
    <details open><summary>Sources ({sources.length + (activeIsSaved ? 0 : 1)})</summary>
      <ul>{sources.map(entry => <li key={entry.expected.id}
        aria-current={entry.expected.id === activeSourceId ? "true" : undefined}>
        <strong>{project?.metadata.documents?.[entry.expected.id]?.title ??
          (entry.checkpoint.format === "math3d.vector-field3d-document" ||
            entry.checkpoint.format === "math3d.scientific-field-document" ?
            entry.checkpoint.metadata.title : entry.module)}</strong>
        <small>{entry.module} · revision {entry.expected.revision}</small>
        <code>{entry.expected.id}</code>
        {entry.expected.id === activeSourceId && sourceControls}
      </li>)}{!activeIsSaved && <li aria-current="true"><strong>{activeSourceTitle}</strong>
        <small>Session source; save a Project to retain it.</small>{sourceControls}</li>}</ul>
    </details>
    <details open><summary>Derived ({derived.length})</summary>
      {derived.length ? <ul>{derived.map(item => {
        const profile = profileById.get(item.identity.id);
        return <li key={item.identity.id}>
          <strong>{item.metadata.title}</strong><small>{item.operation.kind} · revision {item.identity.revision}</small>
          <code>{item.identity.id}</code>
          {profile && <><small role="status">{profile.status === "current" ?
            `${profile.availableRows} profile samples available` : `Values withheld: ${profile.reason}`}</small>
            {onInspectProfile && <button type="button" onClick={() => onInspectProfile(item.identity.id)}>
              Inspect profile provenance</button>}</>}
        </li>;
      })}</ul> : <p>No saved derived fields.</p>}
    </details>
    <details open><summary>Selections ({selections.length})</summary>
      {selections.length ? <ul>{selections.map(item => <li key={selectionId(item)}>
        <details data-selection-id={selectionId(item)}><summary>{selectionSummary(item)}</summary>
          <code>{selectionId(item)}</code>
          <small>{selectionGeometry(item)}</small>
          {item.source?.kind === "document" && item.source.checkpoint &&
            <small>Source revision {item.source.checkpoint.revision} · {item.source.checkpoint.structuralHash}</small>}
          {item.source?.kind === "document" && item.source.checkpoint === null &&
            <small>No source-generation pin was saved for this selection.</small>}
        </details>
      </li>)}</ul> : <p>No saved selections for this source.</p>}
    </details>
    <details open><summary>Results ({results.length + activeProfiles.length})</summary>
      {results.length || activeProfiles.length ? <ul>
        {activeProfiles.map(item => <li key={item.profileId}><strong>{item.title}</strong>
          <small>Profile · {item.status === "current" ? "current" : `values withheld: ${item.reason}`}</small>
          {onInspectProfile && <button type="button" onClick={() => onInspectProfile(item.profileId)}>
            Inspect profile provenance</button>}</li>)}
        {results.map(item => <li key={item.resultId}><strong>{item.provenance.operation.type}</strong>
          <small>Saved result authority: {item.status}; source revision {item.provenance.source.revision}</small>
          <code>{item.resultId}</code></li>)}
      </ul> : <p>No saved results for this source.</p>}
    </details>
  </nav>;
}
