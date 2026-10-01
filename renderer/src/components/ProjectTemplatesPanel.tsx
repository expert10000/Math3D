import React, { useState } from "react";
import { MATH3D_PROJECT_TEMPLATES, type Math3DProjectTemplateId } from "@math3d/core";

export const ProjectTemplatesPanel: React.FC<{ onPreview: (id: Math3DProjectTemplateId) => void }> = ({ onPreview }) => {
  const [id, setId] = useState<Math3DProjectTemplateId>("catenary-study");
  const template = MATH3D_PROJECT_TEMPLATES.find((item) => item.id === id)!;
  return <section data-testid="project-templates" style={{ marginTop: 12, padding: 8, border: "1px solid #94a3b8", borderRadius: 6 }}>
    <label style={{ display: "grid", gap: 4 }}>Starter workflow
      <select data-testid="project-template-select" value={id} onChange={(event) => setId(event.target.value as Math3DProjectTemplateId)}>
        {MATH3D_PROJECT_TEMPLATES.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
      </select>
    </label>
    <p>{template.description}</p>
    <ol style={{ paddingLeft: 20 }}>{template.steps.map((step) => <li key={step}>{step}</li>)}</ol>
    <p>Each preview creates an independent project. Review it before saving or opening.</p>
    <button type="button" data-testid="project-template-preview" onClick={() => onPreview(id)}>Preview starter project</button>
  </section>;
};
