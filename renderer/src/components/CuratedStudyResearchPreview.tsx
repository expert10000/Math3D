import React from "react";
import type { Math3DProject } from "@math3d/core";
import { curatedStudyResearchPreview } from "../projects/curatedStudyPreview";
import type { VerifiedProjectResources } from "../projects/projectResources";

export const CuratedStudyResearchPreview: React.FC<{ project: Math3DProject; resources?: VerifiedProjectResources }> =
  ({ project, resources }) => {
    const evidence = curatedStudyResearchPreview(project, resources);
    return <section data-testid="curated-study-research-preview" aria-label="Saved research evidence">
      <h3>Saved research evidence</h3>
      <p>Read-only status for this saved Project generation. Open a supported host to edit its documents.</p>
      <strong>Study sources ({evidence.studies.length})</strong>
      <ul>{evidence.studies.map(item => <li key={`${item.studyId}:${item.documentId}`}>
        {item.title} · {item.documentId} · {item.status}: {item.reason}</li>)}</ul>
      <strong>Workbook citations ({evidence.citations.length})</strong>
      <ul>{evidence.citations.map((item, index) => <li key={`${item.workbookId}:${index}`}>
        {item.title} · {item.status}: {item.reason}</li>)}</ul>
      <strong>Notes ({evidence.notes.length})</strong>
      <ul>{evidence.notes.map(item => <li key={item.id}>{item.title} · {item.status}: {item.reason}</li>)}</ul>
    </section>;
  };
