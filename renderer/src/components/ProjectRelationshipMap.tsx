import React, { useState } from "react";
import type { DocumentRelation, KernelWorkspaceModule, Math3DProject, ScientificSourceGeneration } from "@math3d/core";

type Props = {
  project: Math3DProject;
  titles: ReadonlyMap<string, string>;
  canOpen: (id: string, module: KernelWorkspaceModule) => boolean;
  onOpen: (id: string, module: KernelWorkspaceModule) => void;
  preview: boolean;
};

const displayModule = (module: KernelWorkspaceModule) => module === "graph2d" ? "Graph" : module[0].toUpperCase() + module.slice(1);
const displayOperation = (operation: string) => operation.replace(/[._-]+/g, " ");

export const ProjectRelationshipMap: React.FC<Props> = ({ project, titles, canOpen, onOpen, preview }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const entries = new Map<string, (typeof project.workspace.entries)[number]>(project.workspace.entries.map(entry => [entry.expected.id, entry]));
  const selected = project.workspace.relations.find(relation => relation.relationId === selectedId) ?? null;
  const documentNode = (id: string, key: string) => {
    const entry = entries.get(id), title = titles.get(id) ?? "Missing document";
    return <button type="button" key={key} className="project-relation-node" data-testid={`project-relation-node-${key}`}
      disabled={preview || !entry || !canOpen(id, entry.module)}
      title={entry ? `Open ${title}` : `Document ${id} is not in this Project`}
      onClick={() => { if (entry) onOpen(id, entry.module); }}>
      <strong>{title}</strong><small>{entry ? displayModule(entry.module) : "Unavailable document"}</small>
    </button>;
  };
  const targetNode = (relation: DocumentRelation) => relation.target.type === "document"
    ? documentNode(relation.target.generation.documentId, `${relation.relationId}-target`)
    : <span className="project-relation-node project-relation-record-target"><strong>{relation.target.type === "result" ? "Analysis result" : "Artifact"}</strong>
      <small>{relation.target.type === "result" ? relation.target.resultId : relation.target.artifactId}</small></span>;
  const generation = (source: ScientificSourceGeneration, label: string) => <div key={`${label}:${source.documentId}`}>
    <dt>{label}: {titles.get(source.documentId) ?? "Unavailable document"}</dt>
    <dd>Revision {source.revision} · generation {source.generation}<small>{source.structuralHash}</small></dd>
  </div>;
  return <section className="project-relationship-map project-dashboard-card" aria-label="Project relationship map" data-testid="project-relationship-map">
    <div className="project-dashboard-card-heading"><h4>Document relationships</h4><span>{project.workspace.relations.length} recorded</span></div>
    <p className="project-relationship-hint">Each arrow is a recorded Project relationship. Select an arrow to see how its target was made.</p>
    <ol>{project.workspace.relations.map(relation => <li key={relation.relationId} className="project-relation-row" data-testid={`project-relation-row-${relation.relationId}`}>
      <div className="project-relation-sources">{relation.sources.map((source, index) => documentNode(source.documentId, `${relation.relationId}-source-${index}`))}</div>
      <button type="button" className="project-relation-edge" data-testid={`project-relation-edge-${relation.relationId}`}
        aria-label={`Inspect ${relation.operation} relationship`} aria-pressed={selected?.relationId === relation.relationId}
        onClick={() => setSelectedId(current => current === relation.relationId ? null : relation.relationId)}>
        <span aria-hidden="true">→</span><span>{displayOperation(relation.operation)}</span><span aria-hidden="true">→</span>
      </button>
      <div className="project-relation-target">{targetNode(relation)}</div>
    </li>)}</ol>
    {!project.workspace.relations.length && <p className="project-relationship-empty">No document relationships are recorded for this Project.</p>}
    {selected && <aside className="project-relation-detail" aria-label="Selected relationship" data-testid="project-relation-detail">
      <div className="project-relation-detail-heading"><h5>Recorded relationship</h5><button type="button" aria-label="Close relationship details" onClick={() => setSelectedId(null)}>×</button></div>
      <dl><div><dt>Kind</dt><dd>{selected.kind}</dd></div><div><dt>Operation</dt><dd>{selected.operation}</dd></div>
        {selected.sources.map((source, index) => generation(source, `Source ${index + 1}`))}
        {selected.target.type === "document" ? generation(selected.target.generation, "Target") : <div><dt>Target</dt><dd>{selected.target.type === "result" ? `Analysis result ${selected.target.resultId}` : `Artifact ${selected.target.artifactId}`}</dd></div>}
        {selected.tool && <div><dt>Tool</dt><dd>{selected.tool.name} {selected.tool.version}</dd></div>}
      </dl>
    </aside>}
  </section>;
};
