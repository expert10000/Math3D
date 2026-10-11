import React from "react";
import type { KernelWorkspaceModule, Math3DProject, ScientificSourceGeneration } from "@math3d/core";

type Props = {
  project: Math3DProject;
  savedAt?: number;
  titles: ReadonlyMap<string, string>;
  canOpen: (id: string, module: KernelWorkspaceModule) => boolean;
  onOpen: (id: string, module: KernelWorkspaceModule) => void;
};

/** The Project format stores current revisions and relations, but no event dates for them. */
export const ProjectActivityTimeline: React.FC<Props> = ({ project, savedAt, titles, canOpen, onOpen }) => {
  const entries = new Map<string, (typeof project.workspace.entries)[number]>(project.workspace.entries.map(entry => [entry.expected.id, entry]));
  const documentLink = (id: string, label: string) => {
    const entry = entries.get(id);
    return entry && canOpen(id, entry.module)
      ? <button type="button" onClick={() => onOpen(id, entry.module)}>{label}</button>
      : <span>{label}</span>;
  };
  const generationLabel = (source: ScientificSourceGeneration) =>
    `${titles.get(source.documentId) ?? source.documentId} · r${source.revision} · generation ${source.generation}`;
  return <div className="project-activity" data-testid="project-activity-timeline">
    <p className="project-workspace-section-hint">The latest library save has a time. Revisions and derivations are retained as a snapshot without event dates or a reliable chronological order.</p>
    <section className="project-activity-group" aria-label="Dated save">
      <h4>Latest saved copy</h4>
      {savedAt === undefined ? <p>No library save recorded for this Project.</p> :
        <ol><li data-testid="project-activity-save"><time dateTime={new Date(savedAt).toISOString()}>{new Date(savedAt).toLocaleString()}</time><strong>Project saved</strong><span>Latest save recorded by this device.</span></li></ol>}
    </section>
    <section className="project-activity-group" aria-label="Recorded revisions">
      <h4>Current revisions <small>Dates unavailable</small></h4>
      <ol>
        <li data-testid="project-activity-project-revision"><strong>Project · revision {project.identity.revision}</strong><span>Current Project snapshot.</span></li>
        {project.workspace.entries.map(entry => <li key={entry.expected.id} data-testid={`project-activity-document-${entry.expected.id}`}>
          <strong>{documentLink(entry.expected.id, titles.get(entry.expected.id) ?? entry.expected.id)} · revision {entry.expected.revision}</strong>
          <span>{entry.module === "graph2d" ? "Graph" : entry.module} document · current recorded revision</span>
        </li>)}
      </ol>
    </section>
    <section className="project-activity-group" aria-label="Recorded derivations">
      <h4>Recorded derivations <small>Dates and order unavailable</small></h4>
      {project.workspace.relations.length ? <ol>{project.workspace.relations.map(relation => <li key={relation.relationId} data-testid={`project-activity-relation-${relation.relationId}`}>
        <strong>{relation.operation.replace(/[._-]+/g, " ")}</strong>
        <span>{relation.kind} · captured {relation.sources.length === 1 ? "source" : "sources"}</span>
        <div className="project-activity-links">
          {relation.sources.map((source, index) => <React.Fragment key={`${source.documentId}:${index}`}>{index > 0 && <span aria-hidden="true">+</span>}{documentLink(source.documentId, generationLabel(source))}</React.Fragment>)}
          <span aria-hidden="true">→</span>
          {relation.target.type === "document"
            ? documentLink(relation.target.generation.documentId, generationLabel(relation.target.generation))
            : <span>{relation.target.type === "result" ? `Result ${relation.target.resultId}` : `Artifact ${relation.target.artifactId}`}</span>}
        </div>
      </li>)}</ol> : <p>No derivations recorded.</p>}
    </section>
  </div>;
};
