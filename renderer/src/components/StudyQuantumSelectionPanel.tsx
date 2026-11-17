import { useEffect, useState } from "react";
import type { Math3DProject, StudyRecordV1 } from "@math3d/core";
import { downloadStudyBlob } from "../projects/studyComparisonExport";
import { pinQuantumStudySample, quantumStudyRecord, quantumStudySelectionEvidence } from "../projects/quantumStudySelection";

type Role = "density" | "phase" | "chain" | "bands";
type Evidence = Awaited<ReturnType<typeof quantumStudySelectionEvidence>>;

/** Saved coordinates are shown only after reopening every exact source bundle. */
export function StudyQuantumSelectionPanel({ project, study, editable, onPin }: {
  project: Math3DProject; study: StudyRecordV1; editable: boolean;
  onPin: (studyId: string, role: Role, index: number, objectId: string | null) => void;
}) {
  const record = quantumStudyRecord(project, study);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [chainIndex, setChainIndex] = useState(0);
  const [bandIndex, setBandIndex] = useState(0);
  useEffect(() => {
    if (!record) { setEvidence(null); return; }
    let active = true;
    setEvidence(null);
    setBusy(true);
    void quantumStudySelectionEvidence(project, study).then(result => {
      if (active) { setEvidence(result); setBusy(false); }
    }).catch(cause => {
      if (active) { setEvidence(null); setError(String((cause as Error).message)); setBusy(false); }
    });
    return () => { active = false; };
  }, [project, study]);
  if (!record) return null;
  const pin = async (role: "chain" | "bands", index: number, objectId: string) => {
    if (!Number.isSafeInteger(index) || index < 0) { setError("Enter a nonnegative sample index."); return; }
    setError(""); setBusy(true);
    try {
      const candidate = pinQuantumStudySample(project, study, role, index, objectId);
      const checked = await quantumStudySelectionEvidence(candidate, study);
      if (!(role in checked.values)) throw new TypeError(checked.omissions.join(" ") || "Sample unavailable.");
      onPin(study.id, role, index, objectId);
    } catch (cause) { setError(`Selection withheld: ${String((cause as Error).message)}`); }
    finally { setBusy(false); }
  };
  const exportEvidence = async () => {
    setError(""); setBusy(true);
    try {
      const checked = await quantumStudySelectionEvidence(project, study);
      setEvidence(checked);
      downloadStudyBlob(new Blob([JSON.stringify(checked, null, 2)], { type: "application/json" }),
        `math3d-${record.templateId}-study-evidence.json`);
    } catch (cause) { setError(`Evidence export failed: ${String((cause as Error).message)}`); }
    finally { setBusy(false); }
  };
  return <section data-testid="project-study-quantum-selection" aria-label="Saved quantum Study selection">
    <h6>Saved selection and evidence</h6>
    {record.templateId === "hydrogen" ? <p>Click a grid point in either density or phase preview. The same exact grid point is saved for both panes when you save the Project.</p> :
      <div>
        <p>Chain and band samples are independent source qualified selections. No edge or bulk classification is inferred.</p>
        {(["chain", "bands"] as const).map(role => {
          const panel = record.panels.find(item => item.role === role);
          const scene = project.workspace.entries.find(entry => entry.checkpoint.format === "math3d.quantum-scene-document" &&
            entry.checkpoint.source.sceneFingerprint === panel?.sceneFingerprint)?.checkpoint;
          const objectId = role === "chain" ? "edge-density" : "band-0";
          const object = scene?.format === "math3d.quantum-scene-document" ? scene.source.objects.find(item => item.id === objectId) : null;
          const index = role === "chain" ? chainIndex : bandIndex;
          return <label key={role}>{role === "chain" ? "Chain site" : "Band sample"}{" "}
            <input type="number" min={0} step={1} value={index} data-testid={`project-study-${role}-index`}
              onChange={event => (role === "chain" ? setChainIndex : setBandIndex)(Number(event.target.value))} />{" "}
            <button type="button" disabled={!editable || busy || !object} data-testid={`project-study-pin-${role}`}
              onClick={() => void pin(role, index, objectId)}>Save {role} sample</button>{" "}
            {panel?.sampleIndex === null ? "No saved sample" : `Saved index ${panel?.sampleIndex}`}
          </label>;
        })}
      </div>}
    {busy && <p role="status">Verifying exact source bundles…</p>}
    {error && <p role="alert">{error}</p>}
    {evidence && <div data-testid="project-study-quantum-evidence">
      <p>Run {evidence.runId} · result SHA-256 {evidence.resultSha256}</p>
      {evidence.sources.map(source => <p key={source.role}>{source.role} saved source fingerprint {source.sceneFingerprint} ·
        saved datasets {source.datasets.map(dataset => `${dataset.id}: ${dataset.sha256} (${dataset.unit})`).join("; ")}</p>)}
      {Object.entries(evidence.values).map(([role, value]) => <p key={role} data-testid={`project-study-value-${role}`}>
        <strong>{role}</strong> · {JSON.stringify(value)}</p>)}
      {evidence.omissions.map((reason, index) => <p key={index} role="status" data-testid="project-study-evidence-omission">
        Omitted: {reason}</p>)}
    </div>}
    <button type="button" disabled={busy} data-testid="project-study-export-quantum-evidence"
      onClick={() => void exportEvidence()}>Export verified evidence JSON</button>
  </section>;
}
