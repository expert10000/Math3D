import React, { useState } from "react";
import { MATH3D_PROJECT_TEMPLATES, type Math3DProjectTemplateId } from "@math3d/core";

import { NOTEBOOK_STARTERS, type NotebookStarterId } from "../projects/notebookStarters";
import type { ProjectLibraryEntry } from "../projects/projectLibrary";
export type ProjectStarterId = Math3DProjectTemplateId | NotebookStarterId;
const starters = [...MATH3D_PROJECT_TEMPLATES, ...NOTEBOOK_STARTERS.map(item => ({ ...item, steps: ["Find its Workbook and Notes in Projects → Contents."] }))];

export const PROJECT_STARTER_MODULES: Record<ProjectStarterId, readonly string[]> = {
  "catenary-study": ["Graph", "Curve", "Surface", "Notes"],
  "derivative-study": ["Graph", "Curve", "Analysis"],
  "spline-surface-lab": ["Curve", "Surface"],
  "curve-construction-study": ["Curve", "Surface"],
  "scene-topology-study": ["Geometry", "Topology"],
  "geometry-note-pins": ["Geometry", "Notes"],
  "catenoid-evidence": ["Surface", "Mesh", "Workbook", "Notes"],
  "edge-path-evidence": ["Mesh", "Analysis", "Workbook", "Notes"],
  "graph-derivative-notebook": ["Graph", "Curve", "Analysis", "Workbook", "Notes"],
  "curve-construction-notebook": ["Curve", "Surface", "Workbook", "Notes"],
};

export const StarterArtwork: React.FC<{ id: ProjectStarterId }> = ({ id }) => <svg viewBox="0 0 320 152" aria-hidden="true" focusable="false">
  <defs><pattern id={`project-grid-${id}`} width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#dce6f3" strokeWidth="1" /></pattern></defs>
  <rect width="320" height="152" fill="#f5f9ff" /><rect width="320" height="152" fill={`url(#project-grid-${id})`} />
  {id === "catenary-study" && <><path d="M22 22 C62 128 111 105 160 102 C209 105 258 128 298 22" fill="none" stroke="#2563eb" strokeWidth="5" /><path d="M40 130H280" stroke="#8093af" strokeWidth="2" /><ellipse cx="160" cy="93" rx="53" ry="17" fill="none" stroke="#c77d21" strokeWidth="2" strokeDasharray="5 5" /></>}
  {id === "catenoid-evidence" && <><path d="M86 26C130 56 130 96 86 126L234 126C190 96 190 56 234 26Z" fill="#dbeafe" fillOpacity=".55" />
    <g fill="none" stroke="#70a5d7" strokeWidth="1.5"><ellipse cx="160" cy="26" rx="74" ry="17" /><ellipse cx="160" cy="51" rx="48" ry="12" /><ellipse cx="160" cy="76" rx="35" ry="9" /><ellipse cx="160" cy="101" rx="48" ry="12" /><ellipse cx="160" cy="126" rx="74" ry="17" /><path d="M108 14C142 50 142 100 108 138M135 10C153 50 153 102 135 142M185 10C167 50 167 102 185 142M212 14C178 50 178 100 212 138" /></g>
    <path d="M86 26C138 61 138 91 86 126M234 26C182 61 182 91 234 126" fill="none" stroke="#2563eb" strokeWidth="3" /></>}
  {id === "edge-path-evidence" && <><path d="M45 120L100 30H268L238 120Z" fill="#eaf3ff" stroke="#70a5d7" strokeWidth="2" />
    <path d="M63 90H248M81 60H258M156 30L109 120M212 30L174 120M45 120L156 30M109 120L212 30M174 120L268 30" fill="none" stroke="#93b5dc" strokeWidth="1.5" />
    <path d="M45 120L126 90L175 60L268 30" fill="none" stroke="#d97706" strokeWidth="5" strokeLinejoin="round" />
    {[ [45,120], [126,90], [175,60], [268,30] ].map(([x,y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="6" fill="#d97706" stroke="#fff" strokeWidth="2" />)}</>}
  {(id === "derivative-study" || id === "graph-derivative-notebook") && <><path d="M20 20 Q160 185 300 20" fill="none" stroke="#2563eb" strokeWidth="5" /><path d="M38 143L280 39" stroke="#db2777" strokeWidth="3" strokeDasharray="8 5" /><circle cx="210" cy="78" r="6" fill="#db2777" /></>}
  {id === "spline-surface-lab" && <><path d="M30 116 C88 12 148 137 205 42 S268 50 294 100" fill="none" stroke="#2563eb" strokeWidth="5" /><path d="M38 60Q150 0 280 60M38 91Q150 31 280 91M38 122Q150 62 280 122M86 35Q116 85 86 130M160 27Q190 82 160 122M234 35Q264 85 234 130" fill="none" stroke="#70a5d7" strokeWidth="2" /></>}
  {(id === "curve-construction-study" || id === "curve-construction-notebook") && <><path d="M48 120L82 78L115 103L151 40" fill="none" stroke="#2563eb" strokeWidth="5" /><path d="M151 40C194 20 248 32 264 72C247 119 194 130 151 104" fill="#dbeafe" stroke="#3984c9" strokeWidth="2" /><path d="M151 40C176 81 176 83 151 104M190 31C216 73 216 96 190 119M230 42C255 76 255 91 230 107" fill="none" stroke="#70a5d7" strokeWidth="2" /></>}
  {id === "scene-topology-study" && <><path d="M48 116L154 27L273 116Z" fill="#eaf3ff" stroke="#2563eb" strokeWidth="4" /><path d="M48 116L273 116M154 27L154 116" stroke="#93b5dc" strokeWidth="2" /><circle cx="48" cy="116" r="7" fill="#2563eb" /><circle cx="154" cy="27" r="7" fill="#2563eb" /><circle cx="273" cy="116" r="7" fill="#2563eb" /><circle cx="154" cy="116" r="7" fill="#e69b22" /></>}
  {id === "geometry-note-pins" && <><path d="M40 60L88 35L137 60L88 84Z" fill="#7c95ce" /><path d="M40 60V112L88 136V84Z" fill="#526daa" /><path d="M88 84V136L137 112V60Z" fill="#647fb7" /><circle cx="229" cy="85" r="47" fill="#2fa895" stroke="#178774" strokeWidth="3" /><circle cx="88" cy="35" r="8" fill="#f59e0b" stroke="#fff" strokeWidth="3" /><circle cx="229" cy="38" r="8" fill="#f59e0b" stroke="#fff" strokeWidth="3" /></>}
</svg>;

export const ProjectTemplatesPanel: React.FC<{ onPreview: (id: ProjectStarterId) => void; onOpen: (id: ProjectStarterId) => void; onNewCopy: (id: ProjectStarterId) => void; copies: Partial<Record<ProjectStarterId, ProjectLibraryEntry>>; busy: boolean; query?: string; moduleFilter?: string }> = ({ onPreview, onOpen, onNewCopy, copies, busy, query = "", moduleFilter = "All modules" }) => {
  const [id, setId] = useState<ProjectStarterId>("catenary-study");
  const matches = starters.filter(item => (moduleFilter === "All modules" || PROJECT_STARTER_MODULES[item.id].includes(moduleFilter)) &&
    `${item.title} ${item.description} ${PROJECT_STARTER_MODULES[item.id].join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()));
  const selected = matches.find(item => item.id === id) ?? matches[0];
  return <section data-testid="project-templates" className="project-starters">
    <div className="project-starters-heading"><div><h3>Starter projects <span className="project-gallery-count">{matches.length}</span></h3><p>Open creates your first copy, then resumes it. New copy starts a separate project.</p></div>
      <div className="project-starter-picker"><label>Choose starter
        <select data-testid="project-template-select" disabled={!selected} value={selected?.id ?? ""} onChange={(event) => setId(event.target.value as ProjectStarterId)}>
          {matches.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select></label>
        <button type="button" data-testid="project-template-preview" disabled={busy || !selected} onClick={() => { if (selected) onPreview(selected.id); }}>Preview selected</button>
      </div>
    </div>
    {!matches.length && <p className="project-gallery-empty">No starters match. Try another search or module.</p>}
    <div className="project-starter-grid">{matches.map((item) => <article key={item.id} className="project-starter-card" data-testid={`project-template-card-${item.id}`}>
      <div className="project-starter-art"><StarterArtwork id={item.id} /></div>
      <div className="project-starter-body"><div className="project-starter-modules">{PROJECT_STARTER_MODULES[item.id].map((module) => <span key={module}>{module}</span>)}</div>
        <h4>{item.title}</h4><p>{item.description}</p><small>{item.steps[0]}</small>
        <small data-testid={`project-template-copy-${item.id}`}>{copies[item.id] ? `Open resumes “${copies[item.id]!.title}”.` : "Open creates your first saved copy."}</small>
        <div className="project-starter-actions"><button type="button" data-testid={`project-template-open-${item.id}`} disabled={busy} onClick={() => onOpen(item.id)}>Open</button>
          <button type="button" data-testid={`project-template-card-preview-${item.id}`} disabled={busy} onClick={() => { setId(item.id); onPreview(item.id); }}>Preview</button>
          {copies[item.id] && <button type="button" data-testid={`project-template-new-copy-${item.id}`} disabled={busy} onClick={() => onNewCopy(item.id)}>New copy</button>}</div>
      </div>
    </article>)}</div>
  </section>;
};
