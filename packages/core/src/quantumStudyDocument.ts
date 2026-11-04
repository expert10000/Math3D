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
  link: Readonly<{ selection: "same-result-and-coordinate" }>;
}>;

const hash = /^[a-f0-9]{64}$/;
const token = /^[A-Za-z0-9_-]{1,100}$/;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

export function normalizeQuantumStudyDocument(value: unknown,
  documents: readonly QuantumSceneDocument[]): ValidationResult<QuantumStudyDocument> {
  if (!record(value) || Object.keys(value).sort().join() !== "format,id,layout,link,panels,source,title" ||
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
  const panels = value.panels as unknown[];
  const seen = new Set<string>();
  for (const panel of panels) {
    if (!record(panel) || Object.keys(panel).sort().join() !== "role,sampleIndex,sceneFingerprint,selectedObjectId" ||
        typeof panel.role !== "string" || !token.test(panel.role) ||
        typeof panel.sceneFingerprint !== "string" || !hash.test(panel.sceneFingerprint) || seen.has(panel.sceneFingerprint) ||
        !(panel.sampleIndex === null || Number.isSafeInteger(panel.sampleIndex) && Number(panel.sampleIndex) >= 0 && Number(panel.sampleIndex) <= 300000) ||
        !(panel.selectedObjectId === null || typeof panel.selectedObjectId === "string" && token.test(panel.selectedObjectId)))
      return { ok: false, errors: ["Invalid quantum study panel."] };
    seen.add(panel.sceneFingerprint);
    const document = documents.find(item => item.source.sceneFingerprint === panel.sceneFingerprint);
    if (!document || document.source.provenance.runId !== value.source.runId ||
        document.source.provenance.resultSha256 !== value.source.resultSha256 ||
        document.source.provenance.model !== value.source.model ||
        panel.selectedObjectId !== null && !document.source.objects.some(item => item.id === panel.selectedObjectId))
      return { ok: false, errors: ["Study panel source or selection is outside the declared result."] };
  }
  return { ok: true, value: value as QuantumStudyDocument };
}

export function createQuantumStudyDocument(title: string, source: QuantumStudyDocument["source"],
  panels: QuantumStudyDocument["panels"]): QuantumStudyDocument {
  return { format: "math3d.quantum-study/v1", id: structuralHash({ source, panels: panels.map(panel => panel.sceneFingerprint) }).slice(7),
    title, source, panels, layout: "columns", link: { selection: "same-result-and-coordinate" } };
}
