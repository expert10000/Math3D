import { useEffect, useRef, useState } from "react";
import { createTemporalFieldSourceDocument, projectTemporalFieldSourceStatus,
  sampleTemporalFieldProbe, sampleTemporalFieldSlice, computeTemporalPathline,
  projectTemporalPathlineStatus, computeTemporalStreakline,
  projectTemporalStreaklineStatus, computeTemporalSpectrum,
  projectTemporalSpectrumStatus, type CurveDocument, type AnalysisResultEnvelope,
  type TemporalSpectrumResult, type TemporalSpectrumRecipe,
  type Math3DProject, type TemporalFieldSourceDocument, type VerifiedTemporalTransfers,
  type VectorField3DDocument, type VectorField3DIsosurface,
  type VectorField3DClipBounds } from "@math3d/core";
import { loadVerifiedVectorFieldTransfer } from "./loadVerifiedVectorFieldTransfer";
import { runTemporalMovingIsosurfaces, type TemporalMovingIsosurfaceFrame } from
  "./runTemporalMovingIsosurfaces";
import { playTemporalMovingIsosurfaces, temporalSurfaceResidentBytes } from
  "./playTemporalMovingIsosurfaces";
import { validateTemporalSurfacePair } from "./validateTemporalSurfacePair";

export function VectorField3DTimeSourcePanel({ document, project, onSave, onSavePathline,
  onSaveStreakline, onSaveSpectrum, onOpenSpectrum, onPromoteMovingIsosurface,
  onPreviewMovingIsosurface }: {
  document: VectorField3DDocument; project: Math3DProject | null | undefined;
  onSave?: (temporal: TemporalFieldSourceDocument, transfers?: VerifiedTemporalTransfers) => void;
  onSavePathline?: (curve: CurveDocument, transfers?: VerifiedTemporalTransfers) => void;
  onSaveStreakline?: (curve: CurveDocument, transfers?: VerifiedTemporalTransfers) => void;
  onSaveSpectrum?: (result: AnalysisResultEnvelope,
    transfers?: VerifiedTemporalTransfers) => void;
  onOpenSpectrum?: (result: AnalysisResultEnvelope) => void;
  onPromoteMovingIsosurface?: (field: VectorField3DDocument,
    surface: VectorField3DIsosurface, temporal: TemporalFieldSourceDocument,
    time: number) => void;
  onPreviewMovingIsosurface?: (surface: VectorField3DIsosurface | null) => void;
}) {
  const [secondId, setSecondId] = useState("");
  const [laterTime, setLaterTime] = useState(1);
  const [interpolation, setInterpolation] = useState<"none" | "linear">("none");
  const [sampleTime, setSampleTime] = useState(0.5);
  const [sampleId, setSampleId] = useState("");
  const [sampleMessage, setSampleMessage] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pathlineBusy, setPathlineBusy] = useState(false);
  const [pathlineProgress, setPathlineProgress] = useState("");
  const cancelPathline = useRef(false);
  const [streaklineBusy, setStreaklineBusy] = useState(false);
  const [streaklineProgress, setStreaklineProgress] = useState("");
  const [releaseCount, setReleaseCount] = useState(8);
  const [releaseEndFraction, setReleaseEndFraction] = useState(0.5);
  const [stepsPerParticle, setStepsPerParticle] = useState(32);
  const [physicalSeed, setPhysicalSeed] = useState<[number, number, number]>(() =>
    document.source.axes.map((axis, index) => axis.min +
      (axis.max - axis.min) * (index === 0 ? .75 : .5)) as [number, number, number]);
  const cancelStreakline = useRef(false);
  const [movingLevel, setMovingLevel] = useState(1);
  const [movingBusy, setMovingBusy] = useState(false);
  const [movingProgress, setMovingProgress] = useState("");
  const [movingFrames, setMovingFrames] = useState<readonly TemporalMovingIsosurfaceFrame[]>([]);
  const movingAbort = useRef<AbortController | null>(null);
  const movingTemporal = useRef<TemporalFieldSourceDocument | null>(null);
  const playbackAbort = useRef<AbortController | null>(null);
  const playbackTransfers = useRef<VerifiedTemporalTransfers | undefined>(undefined);
  const [playbackBusy, setPlaybackBusy] = useState(false);
  const [playbackStatus, setPlaybackStatus] = useState("");
  const [interpolateSurfaces, setInterpolateSurfaces] = useState(false);
  const [spectrumComponent, setSpectrumComponent] = useState<"magnitude" | "x" | "y" | "z">("magnitude");
  const [spectrumCount, setSpectrumCount] = useState<16 | 32 | 64>(32);
  const [spectrumWindow, setSpectrumWindow] = useState<"rectangular" | "hann">("hann");
  const [spectrumBusy, setSpectrumBusy] = useState(false);
  const [spectrumProgress, setSpectrumProgress] = useState("");
  const [spectrumView, setSpectrumView] = useState<TemporalSpectrumResult | null>(null);
  const [spectrumTransfers, setSpectrumTransfers] = useState<VerifiedTemporalTransfers | undefined>();
  const cancelSpectrum = useRef(false);
  const projectRef = useRef(project);
  projectRef.current = project;
  useEffect(() => () => { playbackAbort.current?.abort(); movingAbort.current?.abort();
    onPreviewMovingIsosurface?.(null); }, [onPreviewMovingIsosurface]);
  useEffect(() => {
    const temporal = movingTemporal.current;
    if (!project || !temporal || !playbackTransfers.current) return;
    const status = projectTemporalFieldSourceStatus(project, temporal,
      playbackTransfers.current);
    if (status.status !== "current") {
      playbackAbort.current?.abort(); onPreviewMovingIsosurface?.(null);
      setPlaybackStatus(`Playback withheld: ${status.reason}.`);
    }
  }, [project, onPreviewMovingIsosurface]);
  useEffect(() => {
    const withhold = () => {
      if (!movingTemporal.current) return;
      playbackAbort.current?.abort(); playbackTransfers.current = undefined;
      onPreviewMovingIsosurface?.(null);
      setPlaybackStatus("Playback withheld until the pinned frames are verified again.");
    };
    window.addEventListener("focus", withhold);
    return () => window.removeEventListener("focus", withhold);
  }, [onPreviewMovingIsosurface]);
  const candidates = project?.workspace.entries.filter(item => item.module === "vector3d" &&
    item.expected.id !== document.identity.id) ?? [];
  const saved = project?.workspace.timeSources?.filter(item => item.source.frames.some(frame =>
    frame.documentId === document.identity.id)) ?? [];
  const pathlines = project?.workspace.entries.filter(item => item.module === "curve" &&
    item.checkpoint.format === "math3d.curve-document" &&
    item.checkpoint.source.definition.familyId === "vector3d.temporal-pathline" &&
    saved.some(source => source.identity.id ===
      (item.checkpoint as CurveDocument).source.definition.sourceIds?.[0])) ?? [];
  const streaklines = project?.workspace.entries.filter(item => item.module === "curve" &&
    item.checkpoint.format === "math3d.curve-document" &&
    item.checkpoint.source.definition.familyId === "vector3d.temporal-streakline" &&
    saved.some(source => source.identity.id ===
      (item.checkpoint as CurveDocument).source.definition.sourceIds?.[0])) ?? [];
  const spectra = project?.workspace.results.filter(item =>
    item.provenance.operation.type === "vector3d.temporal-spectrum" &&
    saved.some(source => source.identity.id ===
      (item.provenance.operation.parameters.temporal as { id?: string } | undefined)?.id)) ?? [];
  const loadTransfers = async (ids: readonly string[]): Promise<VerifiedTemporalTransfers> => {
    const transfers = new Map();
    for (const id of ids) {
      const frame = project?.workspace.entries.find(item => item.module === "vector3d" &&
        item.expected.id === id)?.checkpoint;
      if (frame?.format !== "math3d.vector-field3d-document")
        throw new TypeError("A saved temporal frame is missing.");
      if (frame.source.field.kind === "scientific-bundle")
        transfers.set(id, await loadVerifiedVectorFieldTransfer(frame));
    }
    return transfers;
  };
  const save = async () => {
    setError(""); setMessage("");
    try {
      if (!project || !onSave) throw new TypeError("Open a saved Project first.");
      const first = project.workspace.entries.find(item => item.module === "vector3d" &&
        item.expected.id === document.identity.id);
      if (!first || first.expected.revision !== document.identity.revision ||
          first.expected.structuralHash !== document.identity.structuralHash)
        throw new TypeError("Save the current vector source in the Project first.");
      const transfers = await loadTransfers([document.identity.id, secondId]);
      const temporal = createTemporalFieldSourceDocument(project, [
        { time: 0, documentId: document.identity.id },
        { time: laterTime, documentId: secondId }],
      { stableKey: { first: document.identity.id, second: secondId, time: laterTime,
          interpolation },
        title: `${document.metadata.title} · two times`, timeUnit: document.source.timeUnit,
        interpolation, transfers });
      onSave(temporal, transfers);
      setMessage(`Saved ${interpolation} time source ${temporal.identity.id}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const runPathline = async () => {
    setError(""); setMessage(""); setPathlineProgress("");
    cancelPathline.current = false;
    setPathlineBusy(true);
    try {
      if (!project || !sampleId || !onSavePathline)
        throw new TypeError("Choose a saved temporal source in a Project.");
      const temporal = saved.find(item => item.identity.id === sampleId)!;
      const transfers = await loadTransfers(temporal.source.frames.map(frame => frame.documentId));
      const firstTime = temporal.source.frames[0]!.time;
      const lastTime = temporal.source.frames.at(-1)!.time;
      const seed = document.source.axes.map(axis => (axis.min + axis.max) / 2) as
        [number, number, number];
      const curve = await computeTemporalPathline(project, temporal,
        { seed, startTime: firstTime, endTime: lastTime,
          maxSteps: 64, method: "fixed-rk4" },
        { transfers, shouldCancel: () => cancelPathline.current,
          currentProject: () => projectRef.current ?? project,
          onProgress: (completed, total) => setPathlineProgress(`${completed}/${total} steps`),
          verifyBeforePublish: async () => loadTransfers(temporal.source.frames.map(frame =>
            frame.documentId)) });
      onSavePathline(curve, transfers);
      setMessage(`Saved physical pathline ${curve.metadata.title}; ` +
        `${curve.source.definition.settings?.stopReason} after ` +
        `${curve.source.definition.settings?.acceptedSteps} steps.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setPathlineBusy(false); }
  };
  const runStreakline = async () => {
    setError(""); setMessage(""); setStreaklineProgress("");
    cancelStreakline.current = false; setStreaklineBusy(true);
    try {
      if (!project || !sampleId || !onSaveStreakline)
        throw new TypeError("Choose a saved temporal source in a Project.");
      const temporal = saved.find(item => item.identity.id === sampleId)!;
      const frameIds = temporal.source.frames.map(frame => frame.documentId);
      const transfers = await loadTransfers(frameIds);
      const firstTime = temporal.source.frames[0]!.time;
      const lastTime = temporal.source.frames.at(-1)!.time;
      const curve = await computeTemporalStreakline(project, temporal,
        { seed: physicalSeed, releaseStart: firstTime,
          releaseEnd: firstTime + (lastTime - firstTime) * releaseEndFraction,
          observationTime: lastTime, releaseCount, stepsPerParticle,
          method: "fixed-rk4" },
        { transfers, shouldCancel: () => cancelStreakline.current,
          currentProject: () => projectRef.current ?? project,
          onProgress: (done, total) => setStreaklineProgress(`${done}/${total} steps`),
          verifyBeforePublish: async () => loadTransfers(frameIds) });
      onSaveStreakline(curve, transfers);
      setMessage(`Saved ${curve.metadata.title}: ${curve.source.definition.pointCount} verified releases.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setStreaklineBusy(false); }
  };
  const runMoving = async () => {
    setError(""); setMessage(""); setMovingProgress(""); setMovingFrames([]);
    playbackAbort.current?.abort(); setPlaybackStatus("");
    playbackTransfers.current = undefined;
    onPreviewMovingIsosurface?.(null);
    movingTemporal.current = null;
    const controller = new AbortController(); movingAbort.current = controller;
    setMovingBusy(true);
    try {
      if (!project || !sampleId || !onPromoteMovingIsosurface)
        throw new TypeError("Choose a saved temporal source in a Project.");
      const temporal = saved.find(item => item.identity.id === sampleId)!;
      const bounds = document.source.axes.map(axis => [axis.min, axis.max]) as
        unknown as VectorField3DClipBounds;
      const frames = await runTemporalMovingIsosurfaces(project, temporal,
        { level: movingLevel, clipBounds: bounds,
          triangleBudgetPerFrame: 20_000, timeBudgetMs: 60_000 },
        { signal: controller.signal,
          currentProject: () => projectRef.current ?? project,
          loadTransfers: () => loadTransfers(temporal.source.frames.map(frame => frame.documentId)),
          onProgress: (done, total) => setMovingProgress(`${done}/${total} frames`) });
      if (controller.signal.aborted) throw new Error("Moving isosurfaces cancelled.");
      movingTemporal.current = temporal; setMovingFrames(frames);
      setMessage(`Extracted ${frames.length} verified time frames. Choose one to save as a Mesh.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { movingAbort.current = null; setMovingBusy(false); }
  };
  const playMoving = async () => {
    setError(""); setPlaybackStatus("");
    const controller = new AbortController(); playbackAbort.current = controller;
    setPlaybackBusy(true);
    try {
      const temporal = movingTemporal.current, current = projectRef.current;
      if (!temporal || !current || movingFrames.length < 2)
        throw new TypeError("Extract the pinned frames before playback.");
      await playTemporalMovingIsosurfaces(current, temporal, movingFrames, {
        signal: controller.signal, currentProject: () => projectRef.current ?? current,
        loadTransfers: async () => { const transfers = await loadTransfers(
          temporal.source.frames.map(frame => frame.documentId));
          playbackTransfers.current = transfers; return transfers; },
        intervalMs: 500, timeBudgetMs: 10_000,
        memoryBudgetBytes: 64 * 1024 * 1024,
        interpolate: interpolateSurfaces,
        onInterpolated: (surface, from, to) => {
          onPreviewMovingIsosurface?.(surface);
          setPlaybackStatus(`Validated midpoint between ${from} and ${to} ` +
            `${temporal.source.timeAxis.unit}; preview only.`);
        },
        onInterpolationUnavailable: (index, reason) =>
          setPlaybackStatus(`Frames ${index + 1}–${index + 2}: exact playback; ${reason}`),
        onFrame: (frame, index) => {
          onPreviewMovingIsosurface?.(frame.surface);
          setPlaybackStatus(`Frame ${index + 1}/${movingFrames.length}: ${frame.time} ` +
            `${temporal.source.timeAxis.unit}; ${frame.surface.triangleCount} triangles.`);
        } });
    } catch (cause) { onPreviewMovingIsosurface?.(null);
      setPlaybackStatus("Playback withheld.");
      setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { playbackAbort.current = null; setPlaybackBusy(false); }
  };
  const promoteMoving = async (frame: TemporalMovingIsosurfaceFrame) => {
    setError("");
    try {
      const temporal = movingTemporal.current, current = projectRef.current;
      if (!temporal || !current || !onPromoteMovingIsosurface)
        throw new TypeError("The moving isosurface recipe is unavailable.");
      const transfers = await loadTransfers(temporal.source.frames.map(item => item.documentId));
      const status = projectTemporalFieldSourceStatus(current, temporal, transfers);
      if (status.status !== "current")
        throw new TypeError(`Moving isosurface source withheld: ${status.reason}.`);
      if (!temporal.source.frames.some(item => item.time === frame.time &&
          item.documentId === frame.field.identity.id &&
          item.structuralHash === frame.field.identity.structuralHash))
        throw new TypeError("The selected frame changed.");
      onPromoteMovingIsosurface(frame.field, frame.surface, temporal, frame.time);
      setMessage(`Saved Mesh from verified frame at ${frame.time} ${temporal.source.timeAxis.unit}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const runSpectrum = async () => {
    setError(""); setMessage(""); setSpectrumProgress(""); setSpectrumView(null);
    setSpectrumTransfers(undefined); cancelSpectrum.current = false; setSpectrumBusy(true);
    try {
      if (!project || !sampleId || !onSaveSpectrum)
        throw new TypeError("Choose a saved temporal source in a Project.");
      const temporal = saved.find(item => item.identity.id === sampleId)!;
      const frameIds = temporal.source.frames.map(frame => frame.documentId);
      const transfers = await loadTransfers(frameIds);
      const result = await computeTemporalSpectrum(project, temporal,
        { position: physicalSeed, component: spectrumComponent,
          startTime: temporal.source.frames[0]!.time,
          endTime: temporal.source.frames.at(-1)!.time,
          sampleCount: spectrumCount, window: spectrumWindow, detrend: "mean" },
        { transfers, shouldCancel: () => cancelSpectrum.current,
          currentProject: () => projectRef.current ?? project,
          onProgress: (done, total) => setSpectrumProgress(`${done}/${total} samples`),
          verifyBeforePublish: async () => loadTransfers(frameIds) });
      onSaveSpectrum(result.publication, transfers);
      setSpectrumView(result); setSpectrumTransfers(transfers);
      setMessage(`Saved ${result.samples.length}-sample temporal spectrum.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setSpectrumBusy(false); }
  };
  const showSavedSpectrum = async (result: AnalysisResultEnvelope) => {
    setError(""); setSpectrumView(null); setSpectrumTransfers(undefined);
    try {
      const temporalId = (result.provenance.operation.parameters.temporal as
        { id?: string } | undefined)?.id;
      const temporal = saved.find(item => item.identity.id === temporalId);
      if (!temporal || !projectRef.current)
        throw new TypeError("Saved temporal source is missing.");
      const transfers = await loadTransfers(temporal.source.frames.map(frame => frame.documentId));
      const status = projectTemporalSpectrumStatus(projectRef.current, result, transfers);
      if (status.status !== "current")
        throw new TypeError(`Temporal spectrum values withheld: ${status.reason}.`);
      const recipe = result.provenance.operation.parameters.recipe as unknown as
        TemporalSpectrumRecipe;
      const computed = await computeTemporalSpectrum(projectRef.current, temporal, recipe,
        { transfers, currentProject: () => projectRef.current!,
          verifyBeforePublish: async () => loadTransfers(temporal.source.frames.map(frame =>
            frame.documentId)) });
      if (computed.publication.resultId !== result.resultId)
        throw new TypeError("The saved temporal spectrum recipe changed.");
      setSpectrumView(computed); setSpectrumTransfers(transfers);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const spectrumStatus = spectrumView && project ?
    projectTemporalSpectrumStatus(project, spectrumView.publication, spectrumTransfers) : null;
  const powerBins = spectrumStatus?.status === "current" ? spectrumView?.psd ?? [] : [];
  const maxPower = Math.max(0, ...powerBins.map(item => item.density));
  const powerPath = powerBins.map((item, index) =>
    `${index ? "L" : "M"}${index * 300 / Math.max(1, powerBins.length - 1)},` +
    `${80 - item.density * 76 / (maxPower || 1)}`).join(" ");
  return <section aria-label="Temporal source contract" data-testid="gf22-time-source">
    <h5>Temporal source contract</h5>
    <p>Pin two saved Cartesian snapshots at physical times. Scientific frames are verified
      against their source bytes before sampling. Linear interpolation applies inside the common domain.</p>
    <label>Later frame <select value={secondId} onChange={event => setSecondId(event.target.value)}>
      <option value="">Choose saved source</option>
      {candidates.map(item => <option key={item.expected.id} value={item.expected.id}>
        {(item.checkpoint as VectorField3DDocument).metadata.title} · revision {item.expected.revision}</option>)}
    </select></label>
    <label>Later time ({document.source.timeUnit}) <input type="number" min="0.000001" max="1000000000"
      step="any" value={laterTime} onChange={event => setLaterTime(Number(event.target.value))} /></label>
    <label>Time interpolation <select value={interpolation} onChange={event =>
      setInterpolation(event.target.value as "none" | "linear")}>
      <option value="none">Exact frames only</option><option value="linear">Linear between frames</option>
    </select></label>
    <button type="button" disabled={!secondId || !onSave} onClick={() => void save()}>Save temporal source</button>
    {saved.length > 0 && <><label>Saved source <select data-testid="gf25-saved-time-source-select"
      value={sampleId} onChange={event =>
      setSampleId(event.target.value)}><option value="">Choose time source</option>
      {saved.map(item => <option key={item.identity.id} value={item.identity.id}>
        {item.metadata.title} · {item.source.timeAxis.interpolation}</option>)}</select></label>
      <label>Sample time <input type="number" step="any" value={sampleTime}
        onChange={event => setSampleTime(Number(event.target.value))} /></label>
      <button type="button" disabled={!sampleId} onClick={() => void (async () => {
        setError(""); setSampleMessage("");
        try {
          const item = saved.find(source => source.identity.id === sampleId)!;
          const transfers = await loadTransfers(item.source.frames.map(frame => frame.documentId));
          const point = document.source.axes.map(axis => (axis.min + axis.max) / 2) as
            [number, number, number];
          const probe = sampleTemporalFieldProbe(project!, item, sampleTime, point, transfers);
          const slice = sampleTemporalFieldSlice(project!, item, sampleTime, 2, point[2], 9, transfers);
          setSampleMessage(`Probe |v| = ${probe.magnitude} ${probe.componentUnit}; ` +
            `z-slice ${slice.shape.join(" × ")} verified samples at ` +
            `${sampleTime} ${probe.timeUnit}.`);
        } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
      })()}>Sample temporal probe and slice</button>
      <button type="button" data-testid="gf28-run-pathline"
        disabled={!sampleId || !onSavePathline || pathlineBusy}
        onClick={() => void runPathline()}>Run and save pathline</button>
      {pathlineBusy && <button type="button" onClick={() => { cancelPathline.current = true; }}>
        Cancel pathline</button>}
      {pathlineProgress && <p role="status">Pathline {pathlineProgress}</p>}
      <div data-testid="gf29-streakline-controls">
        {document.source.axes.map((axis, index) =>
          <label key={axis.role}>Seed {axis.label} ({axis.unit})
            <input type="number" step="any" value={physicalSeed[index]}
              onChange={event => setPhysicalSeed(current => current.map((value, at) =>
                at === index ? Number(event.target.value) : value) as [number, number, number])} />
          </label>)}
        <label>Release count <input type="number" min="2" max="16" step="1"
          value={releaseCount} onChange={event => setReleaseCount(Number(event.target.value))} /></label>
        <label>Release end (fraction of time span) <input type="number" min="0.01" max="0.99"
          step="0.01" value={releaseEndFraction}
          onChange={event => setReleaseEndFraction(Number(event.target.value))} /></label>
        <label>Steps per particle <input type="number" min="2" max="64" step="1"
          value={stepsPerParticle} onChange={event => setStepsPerParticle(Number(event.target.value))} /></label>
        <button type="button" data-testid="gf29-run-streakline"
          disabled={!sampleId || !onSaveStreakline || streaklineBusy || pathlineBusy}
          onClick={() => void runStreakline()}>Run and save streakline</button>
        {streaklineBusy && <button type="button" onClick={() => { cancelStreakline.current = true; }}>
          Cancel streakline</button>}
        {streaklineProgress && <p role="status">Streakline {streaklineProgress}</p>}
      </div>
      <div data-testid="gf30-moving-isosurfaces">
        <label>Speed level <input type="number" min="0" step="any" value={movingLevel}
          onChange={event => setMovingLevel(Number(event.target.value))} /></label>
        <button type="button" data-testid="gf30-run-moving"
          disabled={!sampleId || !onPromoteMovingIsosurface || movingBusy}
          onClick={() => void runMoving()}>Extract pinned-time isosurfaces</button>
        {movingBusy && <button type="button" onClick={() => movingAbort.current?.abort()}>
          Cancel moving isosurfaces</button>}
        {movingProgress && <p role="status">Moving isosurfaces {movingProgress}</p>}
        {movingFrames.length > 0 && <div data-testid="gf33-moving-playback">
          <p>Exact pinned frames · 500 ms display cadence ·
            {" "}{temporalSurfaceResidentBytes(movingFrames)} geometry bytes / 64 MiB budget.</p>
          <label><input type="checkbox" checked={interpolateSurfaces}
            onChange={event => setInterpolateSurfaces(event.target.checked)} />
            Show validated midpoints when correspondence is stable</label>
          {movingFrames.slice(0, -1).map((frame, index) => {
            const review = validateTemporalSurfacePair(frame.surface,
              movingFrames[index + 1]!.surface);
            return <p key={index} role="status">Frames {index + 1}–{index + 2}: {
              review.status === "compatible" ? `interpolation available — ${review.reason}` :
                `exact playback only — ${review.reason}`}</p>;
          })}
          <button type="button" disabled={playbackBusy || !onPreviewMovingIsosurface}
            onClick={() => void playMoving()}>Play verified frames</button>
          {playbackBusy && <button type="button" onClick={() => playbackAbort.current?.abort()}>
            Stop playback</button>}
          {playbackStatus && <p role="status">{playbackStatus}</p>}
        </div>}
        {movingFrames.map(frame => <div key={frame.time}>
          {frame.time} {movingTemporal.current?.source.timeAxis.unit} ·
          {" "}{frame.surface.triangleCount} triangles ·
          {" "}{frame.surface.topology.connectedComponents} components
          <button type="button" onClick={() => void promoteMoving(frame)}>
            Save this frame as Mesh</button>
        </div>)}
      </div>
      <div data-testid="gf31-temporal-spectrum">
        <label>Temporal component <select value={spectrumComponent}
          onChange={event => setSpectrumComponent(event.target.value as typeof spectrumComponent)}>
          <option value="magnitude">Magnitude</option><option value="x">X</option>
          <option value="y">Y</option><option value="z">Z</option></select></label>
        <label>Uniform samples <select value={spectrumCount}
          onChange={event => setSpectrumCount(Number(event.target.value) as 16 | 32 | 64)}>
          <option value={16}>16</option><option value={32}>32</option>
          <option value={64}>64</option></select></label>
        <label>Window <select value={spectrumWindow}
          onChange={event => setSpectrumWindow(event.target.value as typeof spectrumWindow)}>
          <option value="rectangular">Rectangular</option><option value="hann">Hann</option>
        </select></label>
        <button type="button" data-testid="gf31-run-spectrum"
          disabled={!sampleId || !onSaveSpectrum || spectrumBusy}
          onClick={() => void runSpectrum()}>Compute and save temporal spectrum</button>
        {spectrumBusy && <button type="button" onClick={() => { cancelSpectrum.current = true; }}>
          Cancel temporal spectrum</button>}
        {spectrumProgress && <p role="status">Temporal spectrum {spectrumProgress}</p>}
        {spectrumStatus?.status === "current" && <div data-testid="gf31-spectrum-values">
          <div>PSD · {String(spectrumView?.publication.summary.powerUnit)} ·
            {" "}{String(spectrumView?.publication.summary.frequencyUnit)}</div>
          <svg role="img" aria-label="Temporal power spectral density" viewBox="0 0 300 84"
            width="300" height="84"><path d={powerPath} fill="none" stroke="currentColor"
              strokeWidth="2" /></svg>
          <div>Autocorrelation: {String(spectrumView?.publication.summary.autocorrelationStatus)} ·
            {" "}{String(spectrumView?.publication.summary.sampleCount)} samples</div>
          {onOpenSpectrum && <button type="button" data-testid="gf32-open-spectrum-graphs"
            onClick={() => onOpenSpectrum(spectrumView!.publication)}>
            Open PSD and autocorrelation in Graphs</button>}
        </div>}
        {spectrumStatus && spectrumStatus.status !== "current" &&
          <p role="status">Spectrum values withheld: {spectrumStatus.reason}</p>}
      </div>
      {sampleMessage && <p role="status" data-testid="gf25-sample-result">{sampleMessage}</p>}</>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {saved.length > 0 && <details><summary>Saved temporal sources ({saved.length})</summary>
      <ul>{saved.map(item => {
        const status = projectTemporalFieldSourceStatus(project!, item);
        return <li key={item.identity.id}>{item.metadata.title}: {item.source.frames.length} frames,
          {" "}{item.source.timeAxis.unit}, {status.status === "current" ? "current" :
            `withheld (${status.reason})`}</li>;
      })}</ul></details>}
    {pathlines.length > 0 && <details><summary>Saved pathlines ({pathlines.length})</summary>
      <ul>{pathlines.map(item => {
        const curve = item.checkpoint as CurveDocument;
        const status = projectTemporalPathlineStatus(project!, curve);
        return <li key={curve.identity.id}>{curve.metadata.title}: {status.status}
          {status.reason ? ` (${status.reason})` : ""}; {curve.source.definition.pointCount} points,
          stop {String(curve.source.definition.settings?.stopReason)}</li>;
      })}</ul></details>}
    {streaklines.length > 0 && <details><summary>Saved streaklines ({streaklines.length})</summary>
      <ul>{streaklines.map(item => {
        const curve = item.checkpoint as CurveDocument;
        const status = projectTemporalStreaklineStatus(project!, curve);
        return <li key={curve.identity.id}>{curve.metadata.title}: {status.status}
          {status.reason ? ` (${status.reason})` : ""};
          {" "}{curve.source.definition.pointCount} releases at {String(curve.source.definition.settings?.observationTime)}
          {" "}{curve.source.units.parameter}</li>;
      })}</ul></details>}
    {spectra.length > 0 && <details><summary>Saved temporal spectra ({spectra.length})</summary>
      <ul>{spectra.map(result => {
        const status = projectTemporalSpectrumStatus(project!, result);
        return <li key={result.resultId}>Spectrum · {String(result.summary.sampleCount)} samples:
          {" "}{status.status}{status.reason ? ` (${status.reason})` : ""}
          <button type="button" onClick={() => void showSavedSpectrum(result)}>
            Verify and show PSD</button></li>;
      })}</ul></details>}
  </section>;
}
