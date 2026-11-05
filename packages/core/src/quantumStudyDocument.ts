import { structuralHash } from "./documentIdentity";
import type { QuantumSceneDocument } from "./quantumSceneDocument";
import type { ValidationResult } from "./validation";

export type QuantumStudyDocument = Readonly<{
  format: "math3d.quantum-study/v1";
  id: string;
  title: string;
  source: Readonly<{ runId: string; resultSha256: string; model: string }>;
  panels: readonly Readonly<{ role: string; sceneFingerprint: string; selectedObjectId: string | null;
    sampleIndex: number | null }>[];
  layout: "columns" | "rows";
  templateId?: QuantumStudyTemplateId;
  link: Readonly<{ selection: "same-result-and-coordinate" }>;
}>;

export type QuantumStudyTemplateId = "qwz" | "ssh" | "rice-mele" | "hofstadter" | "hydrogen";
export const QUANTUM_STUDY_TEMPLATES: Readonly<Record<QuantumStudyTemplateId,
  Readonly<{ label: string; model: string; roles: readonly [string, string]; layout: "columns" | "rows" }>>> = {
  qwz: { label: "QWZ bands and curvature", model: "qwz", roles: ["curvature", "bands"], layout: "columns" },
  ssh: { label: "SSH chain and bands", model: "ssh", roles: ["chain", "bands"], layout: "columns" },
  "rice-mele": { label: "Rice–Mele pump and finite response", model: "rice_mele_pump", roles: ["periodic", "finite"], layout: "rows" },
  hofstadter: { label: "Hofstadter bulk and strip", model: "hofstadter", roles: ["bands", "strip"], layout: "columns" },
  hydrogen: { label: "Hydrogen density and phase", model: "hydrogenic", roles: ["density", "phase"], layout: "columns" },
};
function templateSceneRole(templateId: QuantumStudyTemplateId, document: QuantumSceneDocument): string | null {
  const ids = new Set(document.source.objects.map(object => object.id));
  const sceneId = document.source.sceneId;
  if (templateId === "hydrogen") return ids.size === 0 &&
    document.source.datasets.some(item => item.id === "psi-real") &&
    document.source.datasets.some(item => item.id === "psi-imaginary") ? "density" : null;
  if (templateId === "qwz") return ids.has("berry-curvature") ? "curvature" : ids.has("band-0") ? "bands" : null;
  if (templateId === "ssh") return ids.has("edge-density") ? "chain" : ids.has("band-0") ? "bands" : null;
  if (templateId === "rice-mele") return /-finite-pump$|-open-chain-pump$/.test(sceneId) ? "finite" :
    /-pump$/.test(sceneId) ? "periodic" : null;
  return /-hofstadter-strip$/.test(sceneId) ? "strip" : ids.has("band-0") ? "bands" : null;
}

const hash = /^[a-f0-9]{64}$/;
const token = /^[A-Za-z0-9_-]{1,100}$/;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

export function normalizeQuantumStudyDocument(value: unknown,
  documents: readonly QuantumSceneDocument[]): ValidationResult<QuantumStudyDocument> {
  if (!record(value) || Object.keys(value).some(key => !["format", "id", "title", "source", "panels", "layout", "link", "templateId"].includes(key)) ||
      !["format", "id", "title", "source", "panels", "layout", "link"].every(key => key in value) ||
      value.format !== "math3d.quantum-study/v1" || typeof value.id !== "string" || !token.test(value.id) ||
      typeof value.title !== "string" || !value.title.trim() || value.title.length > 160 ||
      !["columns", "rows"].includes(String(value.layout)) || !record(value.link) ||
      Object.keys(value.link).join() !== "selection" || value.link.selection !== "same-result-and-coordinate" ||
      !record(value.source) || Object.keys(value.source).sort().join() !== "model,resultSha256,runId" ||
      typeof value.source.runId !== "string" || !token.test(value.source.runId) ||
      typeof value.source.model !== "string" || !token.test(value.source.model) ||
      typeof value.source.resultSha256 !== "string" || !hash.test(value.source.resultSha256) ||
      !Array.isArray(value.panels) || value.panels.length < 2 || value.panels.length > 8)
    return { ok: false, errors: ["Invalid quantum study document."] };
  const template = value.templateId === undefined ? null : QUANTUM_STUDY_TEMPLATES[value.templateId as QuantumStudyTemplateId];
  if (value.templateId !== undefined && (!template || template.model !== value.source.model ||
      value.panels.length !== template.roles.length ||
      value.panels.some((panel: unknown, index: number) => !record(panel) || panel.role !== template.roles[index])))
    return { ok: false, errors: ["Study template roles or source model disagree."] };
  const panels = value.panels as unknown[];
  const seen = new Set<string>();
  for (const panel of panels) {
    if (!record(panel) || Object.keys(panel).sort().join() !== "role,sampleIndex,sceneFingerprint,selectedObjectId" ||
        typeof panel.role !== "string" || !token.test(panel.role) ||
        typeof panel.sceneFingerprint !== "string" || !hash.test(panel.sceneFingerprint) ||
        (seen.has(panel.sceneFingerprint) && value.templateId !== "hydrogen") ||
        !(panel.sampleIndex === null || Number.isSafeInteger(panel.sampleIndex) && Number(panel.sampleIndex) >= 0 && Number(panel.sampleIndex) <= 1000000) ||
        !(panel.selectedObjectId === null || typeof panel.selectedObjectId === "string" && token.test(panel.selectedObjectId)))
      return { ok: false, errors: ["Invalid quantum study panel."] };
    seen.add(panel.sceneFingerprint);
    const document = documents.find(item => item.source.sceneFingerprint === panel.sceneFingerprint);
    if (!document || document.source.provenance.runId !== value.source.runId ||
        document.source.provenance.resultSha256 !== value.source.resultSha256 ||
        document.source.provenance.model !== value.source.model ||
        panel.selectedObjectId !== null && !document.source.objects.some(item => item.id === panel.selectedObjectId))
      return { ok: false, errors: ["Study panel source or selection is outside the declared result."] };
    if (template && templateSceneRole(value.templateId as QuantumStudyTemplateId, document) !==
        (value.templateId === "hydrogen" ? "density" : panel.role))
      return { ok: false, errors: ["Study panel does not match its template view role."] };
  }
  return { ok: true, value: value as QuantumStudyDocument };
}

export function createQuantumStudyDocument(title: string, source: QuantumStudyDocument["source"],
  panels: QuantumStudyDocument["panels"], templateId?: QuantumStudyTemplateId): QuantumStudyDocument {
  return { format: "math3d.quantum-study/v1", id: structuralHash({ source, panels: panels.map(panel => panel.sceneFingerprint), templateId: templateId ?? null }).slice(7),
    title, source, panels, layout: templateId ? QUANTUM_STUDY_TEMPLATES[templateId].layout : "columns",
    ...(templateId ? { templateId } : {}), link: { selection: "same-result-and-coordinate" } };
}

/** Pick template views from one exact result; only panel placement and labels are created. */
export function createQuantumStudyFromTemplate(templateId: QuantumStudyTemplateId,
  anchor: QuantumSceneDocument, documents: readonly QuantumSceneDocument[]): QuantumStudyDocument {
  const template = QUANTUM_STUDY_TEMPLATES[templateId];
  if (anchor.source.provenance.model !== template.model) throw new TypeError("Template model differs from the source scene");
  const provenance = anchor.source.provenance;
  const siblings = documents.filter(document => document.source.provenance.model === provenance.model &&
    document.source.provenance.runId === provenance.runId &&
    document.source.provenance.resultSha256 === provenance.resultSha256);
  const selected = template.roles.map(panelRole => {
    const document = templateId === "hydrogen" ? siblings.find(item => templateSceneRole(templateId, item) === "density") :
      siblings.find(item => templateSceneRole(templateId, item) === panelRole);
    if (!document) throw new TypeError(`Missing verified ${panelRole} template scene`);
    return document;
  });
  if (templateId !== "hydrogen" && selected[0].source.sceneFingerprint === selected[1].source.sceneFingerprint)
    throw new TypeError("Template needs two distinct verified scene views");
  const study = createQuantumStudyDocument(`${template.label} · ${provenance.runId}`,
    { model: provenance.model, runId: provenance.runId, resultSha256: provenance.resultSha256 },
    selected.map((document, index) => ({ role: template.roles[index],
      sceneFingerprint: document.source.sceneFingerprint, selectedObjectId: null, sampleIndex: null })), templateId);
  const checked = normalizeQuantumStudyDocument(study, siblings);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  return checked.value;
}
