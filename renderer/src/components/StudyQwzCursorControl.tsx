import { useCallback, useEffect, useRef, useState } from "react";
import { inspectProjectQwzPinnedSample,
  type Math3DProject, type ProjectQwzPair, type StudyRecordV1 } from "@math3d/core";
import { verifyProjectQwzSample } from "../projects/qwzStudySample";
import { scientificCursorBus } from "./scientificCursor";

/** Publish only an importer-verified band sample after the curvature target is qualified. */
export function StudyQwzCursorControl({ project, pair, study, editable, onPin, onUnpin }: {
  project: Math3DProject; pair: ProjectQwzPair; study: StudyRecordV1;
  editable: boolean;
  onPin: (studyId: string, sampleIndex: number) => void;
  onUnpin: (studyId: string) => void;
}) {
  const pin = inspectProjectQwzPinnedSample(study, pair);
  const [index, setIndex] = useState(() => pin.status === "current" ? String(pin.sampleIndex) : "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [verifiedIndex, setVerifiedIndex] = useState<number | null>(null);
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
    {message && <p role="status" data-testid="project-study-qwz-cursor-status">{message}</p>}
  </div>;
}
