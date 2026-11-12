import { useCallback, useEffect, useRef, useState } from "react";
import { inspectProjectQwzPinnedSample,
  type Math3DProject, type ProjectQwzPair, type StudyRecordV1 } from "@math3d/core";
import { verifyProjectQwzSample } from "../projects/qwzStudySample";
import { buildQwzStudyEvidence, qwzStudyEvidenceCsv } from "../projects/qwzStudyEvidence";
import { resultPublicationJson } from "../results/resultPublication";
import { QWZ_BAND_PROFILE_OPERATION } from "../projects/qwzBandProfile";
import { scientificCursorBus } from "./scientificCursor";

/** Publish only an importer-verified band sample after the curvature target is qualified. */
export function StudyQwzCursorControl({ project, pair, study, editable, onPin, onUnpin,
  onDeriveProfile, onOpenGraphProfile }: {
  project: Math3DProject; pair: ProjectQwzPair; study: StudyRecordV1;
  editable: boolean;
  onPin: (studyId: string, sampleIndex: number) => void;
  onUnpin: (studyId: string) => void;
  onDeriveProfile?: (studyId: string, pathIndices?: readonly number[]) => Promise<{ graphId: string; resultId: string }>;
  onOpenGraphProfile?: (graphId: string) => void;
}) {
  const pin = inspectProjectQwzPinnedSample(study, pair);
  const profileResult = [...project.workspace.results].reverse().find(item =>
    item.provenance.operation.type === QWZ_BAND_PROFILE_OPERATION &&
    (item.provenance.operation.parameters as Record<string, unknown>).studyId === study.id);
  const profileGraphId = (profileResult?.provenance.operation.parameters as
    Record<string, unknown> | undefined)?.graphDocumentId;
  const profileGraph = typeof profileGraphId === "string" ? project.workspace.entries.find(entry =>
    entry.module === "graph2d" && entry.expected.id === profileGraphId) : null;
  const [index, setIndex] = useState(() => pin.status === "current" ? String(pin.sampleIndex) : "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [verifiedIndex, setVerifiedIndex] = useState<number | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [pathText, setPathText] = useState("");
  const generation = useRef(0);
  const restoredPin = useRef<string | null>(null);
  useEffect(() => () => { generation.current++; }, [project, pair.curvature.identity.id, pair.bands.identity.id]);
  const share = useCallback(async (sampleIndex: number) => {
    setVerifiedIndex(null);
    if (!Number.isSafeInteger(sampleIndex) || sampleIndex < 0) {
      setMessage("Choose a nonnegative saved band sample index."); return;
    }
    const token = ++generation.current;
    setBusy(true); setMessage("Verifying exact QWZ samples…");
    try {
      const { band, target, projection } = await verifyProjectQwzSample(project, pair, sampleIndex);
      if (generation.current !== token) return;
      scientificCursorBus.publish({ runId: band.runId, resultSha256: band.resultSha256,
        datasetId: band.coordinateDatasetId, reciprocalPoint: { k: [band.k[0], band.k[1]],
          basisId: `qwz:${band.kUnit}`, bandId: band.bandId, sampleIndex: band.sampleIndex },
        originViewId: pair.bands.source.sceneFingerprint });
      setVerifiedIndex(sampleIndex);
      setMessage(`Band ${band.bandLabel} at k=(${band.k[0]}, ${band.k[1]}) ${band.kUnit}: ${band.energy} ${band.energyUnit}. ` +
        `Berry curvature ${target.value} ${target.valueUnit} at target sample ${target.sampleIndex}; ` +
        `offset ${projection.distance} ${band.kUnit}` +
        (projection.candidateCount > 1 ? `; ${projection.candidateCount} equally near samples, lowest index selected.` : "."));
    } catch (error) { if (generation.current === token) setMessage(`QWZ k link withheld: ${(error as Error).message}`); }
    finally { if (generation.current === token) setBusy(false); }
  }, [project, pair]);
  useEffect(() => {
    const key = `${study.id}:${study.pinnedSelectionIds.join("|")}`;
    if (restoredPin.current === key) return;
    restoredPin.current = key;
    if (pin.status === "current") {
      setIndex(String(pin.sampleIndex));
      if (verifiedIndex !== pin.sampleIndex) void share(pin.sampleIndex);
    } else if (pin.status === "withheld") {
      setVerifiedIndex(null); setMessage(`Pinned QWZ k withheld: ${pin.reason}`);
    }
  }, [study.id, study.pinnedSelectionIds, pin.status === "current" ? pin.sampleIndex : null,
    pin.status === "withheld" ? pin.reason : null, share, verifiedIndex]);
  const exportEvidence = async (format: "json" | "csv" | "receipt") => {
    setExportBusy(true); setExportMessage("Rechecking both QWZ sources for publication…");
    try {
      const evidence = await buildQwzStudyEvidence(project, study);
      const content = format === "json" ? JSON.stringify(evidence, null, 2) + "\n" :
        format === "csv" ? qwzStudyEvidenceCsv(evidence) : resultPublicationJson(evidence.publication);
      const url = URL.createObjectURL(new Blob([content],
        { type: format === "csv" ? "text/csv;charset=utf-8" : "application/json" }));
      const link = document.createElement("a");
      link.href = url; link.download = `qwz-study-${study.id.slice(0, 12)}.${format === "receipt" ? "publication" : "evidence"}.${format === "csv" ? "csv" : "json"}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportMessage(evidence.verification.status === "verified" ?
        "Verified QWZ evidence exported." : "QWZ evidence exported with withheld quantities and omissions.");
    } catch (error) { setExportMessage(`QWZ evidence export failed: ${(error as Error).message}`); }
    finally { setExportBusy(false); }
  };
  return <div data-testid="project-study-qwz-cursor-control">
    <label>Band sample index <input type="number" min={0} step={1} value={index}
      onChange={event => { setIndex(event.target.value); setVerifiedIndex(null); }} /></label>
    <button type="button" data-testid="project-study-share-qwz-k" disabled={busy}
      onClick={() => { void share(index.trim() === "" ? NaN : Number(index)); }}>Share verified k</button>
    {editable && verifiedIndex !== null && (pin.status !== "current" || pin.sampleIndex !== verifiedIndex) && <button type="button"
      data-testid="project-study-pin-qwz-k" onClick={() => onPin(study.id, verifiedIndex)}>
      {pin.status === "current" ? "Update pinned k" : "Pin k in Study"}</button>}
    {editable && pin.status !== "none" && <button type="button" data-testid="project-study-unpin-qwz-k"
      onClick={() => { setVerifiedIndex(null); onUnpin(study.id); }}>Remove pinned k</button>}
    {pin.status === "current" && <p data-testid="project-study-qwz-pin-status">Pinned band sample {pin.sampleIndex}; source verified on open.</p>}
    {editable && pin.status === "current" && onDeriveProfile && <button type="button"
      data-testid="project-study-derive-qwz-profile" disabled={profileBusy}
      onClick={() => { setProfileBusy(true); setProfileMessage("Rechecking QWZ sources and band path…");
        void onDeriveProfile(study.id).then(({ graphId }) =>
          setProfileMessage(`Saved band profile in Graph ${graphId}. Save Project to retain it.`))
          .catch(error => setProfileMessage(`QWZ profile withheld: ${(error as Error).message}`))
          .finally(() => setProfileBusy(false)); }}>Derive reciprocal band profile in Graph</button>}
    {editable && pin.status === "current" && onDeriveProfile && <div>
      <label>Authored producer sample path (comma-separated indices)
        <input data-testid="project-study-qwz-path-indices" value={pathText}
          placeholder={`${pin.sampleIndex}, ${pin.sampleIndex + 1}`}
          onChange={event => setPathText(event.target.value)} /></label>
      <button type="button" data-testid="project-study-publish-qwz-path" disabled={profileBusy || !pathText.trim()}
        onClick={() => {
          const tokens = pathText.split(",").map(value => value.trim());
          if (tokens.length < 2 || tokens.length > 65 || tokens.some(value => !/^\d+$/.test(value))) {
            setProfileMessage("Choose 2–65 comma-separated nonnegative producer sample indices."); return;
          }
          const indices = tokens.map(Number);
          setProfileBusy(true); setProfileMessage("Verifying every authored producer sample and both source bundles…");
          void onDeriveProfile(study.id, indices).then(({ graphId }) =>
            setProfileMessage(`Authored reciprocal path saved in Graph ${graphId}. Save Project to retain its sidecar.`))
            .catch(error => setProfileMessage(`QWZ path withheld: ${(error as Error).message}`))
            .finally(() => setProfileBusy(false));
        }}>Publish authored reciprocal path in Graph</button>
    </div>}
    {profileMessage && <p role="status" data-testid="project-study-qwz-profile-status">{profileMessage}</p>}
    {profileResult && profileGraph && <div data-testid="project-study-qwz-saved-profile">
      <span>Saved reciprocal band profile · {String((profileResult.summary as Record<string, unknown>).rowCount)} producer samples · {String((profileResult.summary as Record<string, unknown>).pathType ?? "section")}</span>
      {onOpenGraphProfile && <button type="button" data-testid="project-study-open-qwz-graph"
        onClick={() => onOpenGraphProfile(profileGraph.expected.id)}>Open profile in Graph</button>}
    </div>}
    {message && <p role="status" data-testid="project-study-qwz-cursor-status">{message}</p>}
    <button type="button" data-testid="project-study-export-qwz-evidence" disabled={exportBusy}
      onClick={() => { void exportEvidence("json"); }}>Export Study evidence JSON</button>
    <button type="button" data-testid="project-study-export-qwz-evidence-csv" disabled={exportBusy}
      onClick={() => { void exportEvidence("csv"); }}>Export Study evidence CSV</button>
    <button type="button" data-testid="project-study-export-qwz-receipt" disabled={exportBusy}
      onClick={() => { void exportEvidence("receipt"); }}>Export common receipt JSON</button>
    {exportMessage && <p role="status" data-testid="project-study-qwz-export-status">{exportMessage}</p>}
  </div>;
}
