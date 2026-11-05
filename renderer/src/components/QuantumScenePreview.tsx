import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { GeometryScene } from "../geometry/types";
import { GeometryViewer } from "./GeometryViewer";
import type { QuantumField } from "./QuantumFieldSlice";
import { QuantumViewHost, negotiateQuantumView, type QuantumSceneCapabilities, type QuantumViewRequest } from "./quantumViewHandlers";
import { RiceMeleConvergenceProfile } from "./RiceMeleConvergenceProfile";
import { buildQuantumPrimitiveMeshes, type QuantumPrimitive } from "./quantumPrimitiveMeshes";
import { buildQuantumVectorGlyphMeshes, type VectorGlyphDisplay } from "./quantumVectorGlyphs";
import { buildQuantumLatticeSupercell, SUPERCELL_SITE_OBJECT_ID,
  type LatticeGeometryDefinition, type LatticeSampleIdentity, type LatticeSupercell } from "./quantumLatticeOverlay";
import { buildQuantumReciprocalView, reciprocalPathFromPrimitive, reciprocalPointFromPrimitive,
  type ReciprocalDefinition } from "./quantumReciprocalView";
import { qwzSceneRole, reviewedQwzPair, sshSceneRole, reviewedSshPair } from "./quantumStudyProfile";
import { projectTimeCursor, scientificCursorBus } from "./scientificCursor";
import { nearestRecordedFrame } from "./quantumDynamicsSelection";
import { createQuantumDerivationRecord, type QuantumDerivationRecord, type QuantumFieldDocument } from "@math3d/core";
import { quantumSceneDocumentFromVerifiedOpen } from "../projects/quantumSceneAdmission";
import { quantumTopologyOverlayGroups, topologyOverlayObjectVisible } from "./quantumTopologyOverlay";
import { quantumSceneValidation } from "./quantumSceneValidation";
import { QuantumInspectorSummary } from "./QuantumInspectorSummary";
import { QuantumViewerTrace } from "./quantumViewerTrace";

type Vector3 = { x: number; y: number; z: number };
type SceneSource = {
  schema: "quantum-scene/v1" | "quantum-scene/v2";
  provenance: { runId: string; model: string; resultSha256: string; engine: string; engineVersion: string;
    kind?: "geometry-fixture" | "numerical-result"; parameters?: Record<string, number | string> };
  coordinates: { axes: [string, string, string]; units: [string, string, string]; handedness: string };
  datasets: { id: string; count: number; components: number; unit: string }[];
  objects: { id: string; label: string; kind: string; positions: string; values?: string; scalars?: string; indices?: string; style: { color: string; opacity: number; size: number } }[];
  lattice?: LatticeGeometryDefinition;
  reciprocal?: ReciprocalDefinition;
  fields?: (QuantumField & { real: string; imaginary?: string })[];
  annotations: { id: string; text: string; position: [number, number, number] }[];
  bands?: { kind: "path" | "surface"; coordinates: string; energies: string[];
    objects: string[]; labels: string[]; energyUnit: string; bulkGap: number; grid?: [number, number] };
  time?: { axis: string; unit: string; frameIds: string[];
    tracks: { id: string; object: string; positions: string }[];
    playback: { startFrame: number; endFrame: number; loop: boolean } };
  topology?: { quantities: { id: string; label: string; kind: string; object: string; dataset: string; convention: string }[];
    invariants: { id: string; label: string; value: number | null; status: string; method: string }[]; limitations: string[] };
};
export type QuantumSceneWorkspaceReference = { directory: string; sceneFingerprint: string };
export type QuantumSceneOpenResponse =
  | { ok: true; canceled: false; directory: string; reference: QuantumSceneWorkspaceReference; document: {
      title: string; geometry: GeometryScene;
      cameras: { position: Vector3; target: Vector3; up: Vector3 }[];
      extensions: Record<string, unknown>;
    }; remembered: boolean; mappedObjectIds: string[]; deferredObjectIds: string[]; deferredFieldIds: string[];
    stream?: { level: number; levels: { id: string; label: string; bytes: number }[] };
    diagnostics?: { importMs: number; datasetBytes: number; mappedPrimitives: number } }
  | { ok: false; canceled: true }
  | { ok: false; canceled: false; error: string };

type OpenedScene = Extract<QuantumSceneOpenResponse, { ok: true }>;
type SceneTriangle = NonNullable<GeometryScene["triangles"]>[number];
type PickedBandSample = Awaited<ReturnType<NonNullable<Window["quantumScenes"]>["bandSample"]>>;
type PickedScalarSample = Awaited<ReturnType<NonNullable<Window["quantumScenes"]>["scalarSample"]>>;
type PickedTopologySample = Awaited<ReturnType<NonNullable<Window["quantumScenes"]>["topologySample"]>>;
type PickedVectorSample = Awaited<ReturnType<NonNullable<Window["quantumScenes"]>["vectorSample"]>>;
const CURVATURE_COLORS = [0x174f9c, 0x397ec6, 0x8cbadd, 0xb7bdc6, 0xefbe8b, 0xe7824d, 0xb94038];

export function QuantumScenePreview({ opened, onClose, onOpenRelated, promotedField, onPromoteField, onRecordDerivation, onFieldViewChange }: {
  opened: OpenedScene; onClose: () => void; onOpenRelated?: (scene: OpenedScene) => void;
  promotedField?: QuantumFieldDocument | null; onPromoteField?: () => Promise<QuantumFieldDocument>;
  onRecordDerivation?: (record: QuantumDerivationRecord) => void;
  onFieldViewChange?: (view: QuantumFieldDocument["view"]) => void;
}) {
  const document = opened.document;
  const details = (document.extensions["quantum-scene/v2"] ?? document.extensions["quantum-scene/v1"]) as {
    scene: SceneSource; selectionTransferred: false; latticeSamples?: LatticeSampleIdentity[];
    mappedTriangleCounts?: Record<string, number>; bandLodStride?: number;
    topologyDisplay?: { scalars: { quantityId: string; objectId: string; minimum: number; maximum: number;
      unit: string; faceBins: number[] }[]; vectors: VectorGlyphDisplay[] } };
  const scene = details.scene;
  const topologyOverlays = useMemo(() => quantumTopologyOverlayGroups(scene), [scene]);
  const [hiddenTopologyOverlays, setHiddenTopologyOverlays] = useState<string[]>([]);
  useEffect(() => setHiddenTopologyOverlays([]), [opened.reference.sceneFingerprint]);
  const hiddenTopologyObjectIds = useMemo(() => new Set(topologyOverlays
    .filter(group => hiddenTopologyOverlays.includes(group.id)).flatMap(group => group.objectIds)),
  [hiddenTopologyOverlays, topologyOverlays]);
  const fluxPoints = scene.provenance.model === "hofstadter_flux_sweep" ?
    (document.geometry.points ?? []).flatMap(point => {
      const id = point.id?.match(/^(flux-\d+):site:(\d+)$/);
      return id ? [{ objectId: id[1], sampleIndex: Number(id[2]), x: point.x, energy: point.y,
        color: `#${(point.color ?? 0x79d9c1).toString(16).padStart(6, "0")}` }] : [];
    }) : [];
  const [streamBusy, setStreamBusy] = useState(false);
  const [streamStatus, setStreamStatus] = useState("");
  useEffect(() => { setStreamBusy(false); setStreamStatus(""); }, [opened.reference.sceneFingerprint, opened.stream?.level]);
  const [timeFrameIndex, setTimeFrameIndex] = useState(0);
  const [timePlaying, setTimePlaying] = useState(false);
  const [timeFrames, setTimeFrames] = useState<Awaited<ReturnType<NonNullable<Window["quantumScenes"]>["timeFrames"]>> | null>(null);
  const timeFrame = timeFrames?.[timeFrameIndex] ?? null;
  const [timeError, setTimeError] = useState("");
  useEffect(() => { setTimeFrameIndex(0); setTimePlaying(false); setTimeFrames(null); }, [opened.reference.sceneFingerprint]);
  useEffect(() => {
    const timeline = scene.time;
    if (!timeline || !window.quantumScenes?.timeFrames) return;
    let active = true;
    void window.quantumScenes.timeFrames(opened.reference)
      .then(frames => { if (active) {
        const cursor = scientificCursorBus.snapshot();
        if (cursor?.timePoint && cursor.originViewId !== opened.reference.sceneFingerprint) {
          const projected = projectTimeCursor(cursor, { runId: scene.provenance.runId,
            resultSha256: scene.provenance.resultSha256, unit: timeline.unit,
            frameIds: timeline.frameIds, values: frames.map(frame => frame.time) });
          if (projected.status === "matched") setTimeFrameIndex(projected.value);
        }
        setTimeFrames(frames); setTimeError("");
      } })
      .catch(error => { if (active) setTimeError(String(error)); });
    return () => { active = false; };
  }, [opened.reference.sceneFingerprint]);
  useEffect(() => {
    if (!timePlaying || !scene.time) return;
    const timer = window.setInterval(() => setTimeFrameIndex(index => index < scene.time!.playback.endFrame ? index + 1 :
      scene.time!.playback.loop ? scene.time!.playback.startFrame : index), 180);
    return () => window.clearInterval(timer);
  }, [timePlaying, opened.reference.sceneFingerprint]);
  useEffect(() => {
    if (timePlaying && scene.time && !scene.time.playback.loop && timeFrameIndex >= scene.time.playback.endFrame)
      setTimePlaying(false);
  }, [timePlaying, timeFrameIndex, scene.time]);
  useEffect(() => {
    if (!timeFrame || !scene.time) return;
    scientificCursorBus.publish({ runId: timeFrame.runId, resultSha256: timeFrame.resultSha256,
      datasetId: scene.time.axis, originViewId: opened.reference.sceneFingerprint,
      timePoint: { value: timeFrame.time, unit: timeFrame.unit, frameId: timeFrame.frameId, sampleIndex: timeFrame.index } });
  }, [timeFrame, opened.reference.sceneFingerprint]);
  const activeFieldDocument = promotedField?.source.scene.sceneFingerprint === opened.reference.sceneFingerprint ? promotedField : null;
  const [fieldPromotionStatus, setFieldPromotionStatus] = useState("");
  const [promotingField, setPromotingField] = useState(false);
  const riceComparison = scene.provenance.model === "rice_mele_pump" && scene.objects.some(object => object.id === "comparison-bulk-current");
  const qwzRole = qwzSceneRole(opened);
  const [qwzPair, setQwzPair] = useState<{ bands: OpenedScene; curvature: OpenedScene } | null>(null);
  const [qwzBusy, setQwzBusy] = useState(false);
  const [qwzError, setQwzError] = useState("");
  const [cursorStatus, setCursorStatus] = useState("");
  const qwzGeneration = useRef(0);
  useEffect(() => {
    if (qwzPair && ![qwzPair.bands.reference.sceneFingerprint, qwzPair.curvature.reference.sceneFingerprint]
      .includes(opened.reference.sceneFingerprint)) setQwzPair(null);
    return () => { qwzGeneration.current++; };
  }, [opened.reference.sceneFingerprint]);
  const loadQwzPair = async () => {
    if (!qwzRole || !window.quantumScenes?.openReference || !window.quantumScenes.openExample || qwzBusy) return;
    const generation = ++qwzGeneration.current;
    setQwzBusy(true); setQwzError("");
    try {
      const current = await window.quantumScenes.openReference(opened.reference);
      if (!current.ok || current.reference.sceneFingerprint !== opened.reference.sceneFingerprint)
        throw new TypeError("Current QWZ source failed exact read-back verification.");
      const companion = await window.quantumScenes.openExample(qwzRole === "bands" ? "qwz-curvature" : "qwz-bands");
      if (!companion.ok) throw new TypeError("Matching pinned QWZ bundle is unavailable or changed.");
      const pair = qwzRole === "bands" ? { bands: current, curvature: companion } : { bands: companion, curvature: current };
      reviewedQwzPair(pair.bands, pair.curvature);
      if (generation === qwzGeneration.current) setQwzPair(pair);
    } catch (error) {
      if (generation === qwzGeneration.current) setQwzError(String((error as Error).message ?? error));
    } finally { if (generation === qwzGeneration.current) setQwzBusy(false); }
  };
  const switchQwzView = async (role: "bands" | "curvature") => {
    if (!qwzPair || !onOpenRelated || !window.quantumScenes?.openReference || qwzBusy) return;
    const generation = ++qwzGeneration.current;
    setQwzBusy(true); setQwzError("");
    try {
      const target = qwzPair[role];
      const reopened = await window.quantumScenes.openReference(target.reference);
      if (!reopened.ok || reopened.reference.sceneFingerprint !== target.reference.sceneFingerprint)
        throw new TypeError("Selected QWZ view failed exact read-back verification.");
      const pair = { ...qwzPair, [role]: reopened };
      reviewedQwzPair(pair.bands, pair.curvature);
      if (generation === qwzGeneration.current) { setQwzPair(pair); setQwzBusy(false); onOpenRelated(reopened); }
    } catch (error) {
      if (generation === qwzGeneration.current) setQwzError(String((error as Error).message ?? error));
    } finally { if (generation === qwzGeneration.current) setQwzBusy(false); }
  };
  const qwzSummary = qwzPair ? reviewedQwzPair(qwzPair.bands, qwzPair.curvature) : null;
  const sshRole = sshSceneRole(opened);
  const [sshPair, setSshPair] = useState<{ chain: OpenedScene; bands: OpenedScene } | null>(null);
  const [sshBusy, setSshBusy] = useState(false);
  const [sshError, setSshError] = useState("");
  const sshGeneration = useRef(0);
  useEffect(() => {
    if (sshPair && ![sshPair.chain.reference.sceneFingerprint, sshPair.bands.reference.sceneFingerprint]
      .includes(opened.reference.sceneFingerprint)) setSshPair(null);
    return () => { sshGeneration.current++; };
  }, [opened.reference.sceneFingerprint]);
  const loadSshPair = async () => {
    if (!sshRole || !window.quantumScenes?.openReference || !window.quantumScenes.openExample || sshBusy) return;
    const generation = ++sshGeneration.current;
    setSshBusy(true); setSshError("");
    try {
      const current = await window.quantumScenes.openReference(opened.reference);
      if (!current.ok || current.reference.sceneFingerprint !== opened.reference.sceneFingerprint)
        throw new TypeError("Current SSH source failed exact read-back verification.");
      const companion = await window.quantumScenes.openExample(sshRole === "chain" ? "ssh-bands" : "ssh-chain");
      if (!companion.ok) throw new TypeError("Matching pinned SSH bundle is unavailable or changed.");
      const pair = sshRole === "chain" ? { chain: current, bands: companion } : { chain: companion, bands: current };
      reviewedSshPair(pair.chain, pair.bands);
      if (generation === sshGeneration.current) setSshPair(pair);
    } catch (error) {
      if (generation === sshGeneration.current) setSshError(String((error as Error).message ?? error));
    } finally { if (generation === sshGeneration.current) setSshBusy(false); }
  };
  const switchSshView = async (role: "chain" | "bands") => {
    if (!sshPair || !onOpenRelated || !window.quantumScenes?.openReference || sshBusy) return;
    const generation = ++sshGeneration.current;
    setSshBusy(true); setSshError("");
    try {
      const target = sshPair[role];
      const reopened = await window.quantumScenes.openReference(target.reference);
      if (!reopened.ok || reopened.reference.sceneFingerprint !== target.reference.sceneFingerprint)
        throw new TypeError("Selected SSH view failed exact read-back verification.");
      const pair = { ...sshPair, [role]: reopened };
      reviewedSshPair(pair.chain, pair.bands);
      if (generation === sshGeneration.current) { setSshPair(pair); setSshBusy(false); onOpenRelated(reopened); }
    } catch (error) {
      if (generation === sshGeneration.current) setSshError(String((error as Error).message ?? error));
    } finally { if (generation === sshGeneration.current) setSshBusy(false); }
  };
  const sshSummary = sshPair ? reviewedSshPair(sshPair.chain, sshPair.bands) : null;
  const count = (document.geometry.points?.length ?? 0) + (document.geometry.segments?.length ?? 0) +
    (document.geometry.triangles?.length ?? 0);
  const [view, setView] = useState<QuantumViewRequest>(scene.fields?.length && count === 0 ? "slice" : "geometry");
  useEffect(() => { setView(scene.fields?.length && count === 0 ? "slice" : "geometry"); }, [opened.reference.sceneFingerprint]);
  const [locateStatus, setLocateStatus] = useState("");
  const [locating, setLocating] = useState(false);
  const [openingRun, setOpeningRun] = useState(false);
  const [runStatus, setRunStatus] = useState("");
  const [openingFluxRun, setOpeningFluxRun] = useState(false);
  const [fluxRunStatus, setFluxRunStatus] = useState("");
  const locateGeneration = useRef(0);
  const runGeneration = useRef(0);
  useEffect(() => {
    locateGeneration.current += 1; setLocateStatus(""); setLocating(false);
    runGeneration.current += 1;
    setOpeningRun(false); setRunStatus("");
    setOpeningFluxRun(false); setFluxRunStatus("");
  }, [opened.reference.sceneFingerprint]);
  const revealSource = async () => {
    const current = ++locateGeneration.current;
    setLocating(true); setLocateStatus("");
    try {
      const result = await window.quantumScenes!.revealSource(opened.reference.sceneFingerprint);
      if (locateGeneration.current === current) setLocateStatus(result.ok ?
        "Requested the system file manager to reveal the re-verified bundle." : `Source reveal refused: ${result.error}`);
    } catch (error) {
      if (locateGeneration.current === current) setLocateStatus(`Source reveal refused: ${String((error as Error)?.message ?? error)}`);
    } finally { if (locateGeneration.current === current) setLocating(false); }
  };
  const openSourceRun = async (mode: "open" | "fork" = "open") => {
    const current = ++runGeneration.current;
    setOpeningRun(true); setRunStatus("");
    try {
      const result = await (mode === "fork" ? window.quantumScenes!.forkSourceRun : window.quantumScenes!.openSourceRun)(opened.reference.sceneFingerprint);
      if (runGeneration.current === current) setRunStatus(result.ok
        ? `Theory Lab ${mode === "fork" ? "fork request" : "launch"} sent for ${result.runId}; Lab will verify the exact saved result before ${mode === "fork" ? "offering a new run" : "opening it"}.`
        : result.canceled ? "Theory Lab selection canceled." : `Source run unavailable: ${result.error}`);
    } catch (error) {
      if (runGeneration.current === current) setRunStatus(`Source run unavailable: ${String((error as Error)?.message ?? error)}`);
    } finally { if (runGeneration.current === current) setOpeningRun(false); }
  };
  const openSelectedFluxRun = async () => {
    const sample = pickedScalarSample;
    if (!sample || sample.fingerprint !== opened.reference.sceneFingerprint || !/^flux-\d+$/.test(sample.objectId)) return;
    const annotation = scene.annotations.find(item => item.id === `source-${sample.objectId.slice(5)}`);
    const identity = annotation?.text.match(/ · run ([A-Za-z0-9_-]{1,100}) · SHA-256 ([a-f0-9]{64}) · /);
    if (!identity) { setFluxRunStatus("Selected flux point has no exact source-run identity."); return; }
    setOpeningFluxRun(true); setFluxRunStatus("Re-verifying the selected flux run…");
    try {
      const result = await window.quantumScenes!.openFluxSourceRun({ fingerprint: opened.reference.sceneFingerprint,
        objectId: sample.objectId, sampleIndex: sample.sampleIndex, runId: identity[1], resultSha256: identity[2] });
      setFluxRunStatus(result.ok ? `Theory Lab launch sent for ${result.runId}; Lab verifies its saved result hash before opening the run and related scenes.` :
        result.canceled ? "Theory Lab selection canceled." : `Flux source unavailable: ${result.error}`);
    } catch (error) { setFluxRunStatus(`Flux source unavailable: ${String((error as Error).message)}`); }
    finally { setOpeningFluxRun(false); }
  };
  const camera = document.cameras[0];
  const [pickedBandSample, setPickedBandSample] = useState<PickedBandSample | null>(null);
  const [pickedTopologySample, setPickedTopologySample] = useState<PickedTopologySample | null>(null);
  useEffect(() => {
    if (!qwzRole) return;
    let active = true;
    const originViewId = opened.reference.sceneFingerprint;
    const unsubscribe = scientificCursorBus.subscribe(cursor => {
      if (!active || !cursor.reciprocalPoint || cursor.originViewId === originViewId ||
          cursor.runId !== scene.provenance.runId || cursor.resultSha256 !== scene.provenance.resultSha256) return;
      const quantity = scene.topology?.quantities.find(item => item.object === "berry-curvature");
      if (!window.quantumScenes?.projectQwzCursor || qwzRole === "curvature" && !quantity) return;
      void window.quantumScenes.projectQwzCursor({ fingerprint: originViewId, runId: cursor.runId,
        resultSha256: cursor.resultSha256, k: cursor.reciprocalPoint.k,
        basisId: cursor.reciprocalPoint.basisId }).then(async projection => {
        if (projection.target !== qwzRole) throw new TypeError("Cursor target changed during projection.");
        const sample = qwzRole === "bands" ? await window.quantumScenes!.bandSample({ fingerprint: originViewId,
          objectId: "band-0", sampleIndex: projection.sampleIndex }) :
          await window.quantumScenes!.topologySample({ fingerprint: originViewId,
            quantityId: quantity!.id, sampleIndex: projection.sampleIndex });
        if (!active) return;
        const k = "k" in sample ? sample.k : sample.position;
        if (Math.abs(k[0] - projection.k[0]) > 1e-8 || Math.abs(k[1] - projection.k[1]) > 1e-8)
          throw new TypeError("Projected k-point differs from the exact target sample.");
        if ("k" in sample) setPickedBandSample(sample); else setPickedTopologySample(sample);
        setCursorStatus(`Linked k-point [${k[0].toPrecision(5)}, ${k[1].toPrecision(5)}] from exact target samples; ` +
          `offset ${projection.distance.toPrecision(4)} ${scene.coordinates.units[0]}. ` +
          (projection.candidateCount > 1 ? `${projection.candidateCount} equally near samples; lowest index selected.` :
            "Unique nearest sample."));
      }).catch(error => { if (active) setCursorStatus(`Cursor withheld: ${String((error as Error).message)}`); });
    });
    return () => { active = false; unsubscribe(); };
  }, [opened.reference.sceneFingerprint, qwzRole]);
  const [pickedVectorSample, setPickedVectorSample] = useState<PickedVectorSample | null>(null);
  const [topologyError, setTopologyError] = useState("");
  const [verifyingTopology, setVerifyingTopology] = useState(false);
  const [glyphDensity, setGlyphDensity] = useState<16 | 64 | 128>(64);
  const topologyGeneration = useRef(0);
  const [bandSelectionError, setBandSelectionError] = useState("");
  const [verifyingBand, setVerifyingBand] = useState(false);
  const bandGeneration = useRef(0);
  const [pickedPrimitive, setPickedPrimitive] = useState<QuantumPrimitive | null>(null);
  const [pickedScalarSample, setPickedScalarSample] = useState<PickedScalarSample | null>(null);
  const [scalarError, setScalarError] = useState("");
  const [verifyingScalar, setVerifyingScalar] = useState(false);
  const [comparisonTime, setComparisonTime] = useState(0);
  const [comparisonSite, setComparisonSite] = useState(0);
  const [comparisonSamples, setComparisonSamples] = useState<Record<string, PickedScalarSample> | null>(null);
  const [comparisonError, setComparisonError] = useState("");
  const [verifyingComparison, setVerifyingComparison] = useState(false);
  const comparisonGeneration = useRef(0);
  const scalarGeneration = useRef(0);
  const [geometrySpace, setGeometrySpace] = useState<"source" | "reciprocal">("source");
  const [reciprocalError, setReciprocalError] = useState("");
  const [verifyingReciprocal, setVerifyingReciprocal] = useState(false);
  const reciprocalGeneration = useRef(0);
  const [repeatDraft, setRepeatDraft] = useState<[number, number, number]>(scene.lattice?.repeats ?? [1, 1, 1]);
  const [supercell, setSupercell] = useState<LatticeSupercell | null>(null);
  const [supercellError, setSupercellError] = useState("");
  const [verifyingSupercell, setVerifyingSupercell] = useState(false);
  const supercellGeneration = useRef(0);
  useEffect(() => {
    supercellGeneration.current++; setRepeatDraft(scene.lattice?.repeats ?? [1, 1, 1]);
    setSupercell(null); setSupercellError(""); setVerifyingSupercell(false);
    return () => { supercellGeneration.current++; };
  }, [opened.reference.sceneFingerprint]);
  useEffect(() => {
    reciprocalGeneration.current++; setGeometrySpace("source"); setReciprocalError("");
    setVerifyingReciprocal(false);
    return () => { reciprocalGeneration.current++; };
  }, [opened.reference.sceneFingerprint]);
  const latticeSiteObjects = useMemo(() => new Set(scene.objects.filter(object => object.positions === scene.lattice?.sites).map(object => object.id)),
    [scene.objects, scene.lattice?.sites]);
  const pickedDerivedInstance = pickedPrimitive?.kind === "site" && supercell &&
    pickedPrimitive.objectId === SUPERCELL_SITE_OBJECT_ID ? supercell.instances[pickedPrimitive.index] : undefined;
  const pickedLatticeSample = pickedPrimitive?.kind === "site" ?
    (pickedDerivedInstance ?? (latticeSiteObjects.has(pickedPrimitive.objectId) ?
      details.latticeSamples?.[pickedPrimitive.index] : undefined)) : undefined;
  useEffect(() => {
    bandGeneration.current++; setPickedBandSample(null); setPickedPrimitive(null);
    setBandSelectionError(""); setVerifyingBand(false);
    scalarGeneration.current++; setPickedScalarSample(null); setScalarError(""); setVerifyingScalar(false);
    comparisonGeneration.current++; setComparisonSamples(null); setComparisonTime(0); setComparisonSite(0); setComparisonError(""); setVerifyingComparison(false);
    return () => { bandGeneration.current++; scalarGeneration.current++; comparisonGeneration.current++; };
  }, [opened.reference.sceneFingerprint]);
  useEffect(() => {
    topologyGeneration.current++; setPickedTopologySample(null); setPickedVectorSample(null);
    setTopologyError(""); setVerifyingTopology(false); setGlyphDensity(64);
    return () => { topologyGeneration.current++; };
  }, [opened.reference.sceneFingerprint]);
  const selectTopologySample = (quantityId: string, sampleIndex: number) => {
    const current = ++topologyGeneration.current;
    setPickedPrimitive(null); setPickedBandSample(null); setPickedVectorSample(null);
    setPickedTopologySample(null); setTopologyError(""); setVerifyingTopology(true);
    void window.quantumScenes!.topologySample({ fingerprint: opened.reference.sceneFingerprint, quantityId, sampleIndex })
      .then(sample => { if (current === topologyGeneration.current && sample.fingerprint === opened.reference.sceneFingerprint) {
        setPickedTopologySample(sample);
        if (qwzRole === "curvature") scientificCursorBus.publish({ runId: sample.runId,
          resultSha256: sample.resultSha256, datasetId: sample.positionDatasetId,
          reciprocalPoint: { k: [sample.position[0], sample.position[1]], basisId: `qwz:${scene.coordinates.units[0]}`,
            sampleIndex: sample.sampleIndex }, originViewId: opened.reference.sceneFingerprint });
      } })
      .catch(error => { if (current === topologyGeneration.current)
        setTopologyError(`Topology selection refused: ${String((error as Error)?.message ?? error)}`); })
      .finally(() => { if (current === topologyGeneration.current) setVerifyingTopology(false); });
  };
  const selectVectorSample = (objectId: string, sampleIndex: number) => {
    const current = ++topologyGeneration.current;
    setPickedPrimitive(null); setPickedBandSample(null); setPickedTopologySample(null);
    setPickedVectorSample(null); setTopologyError(""); setVerifyingTopology(true);
    void window.quantumScenes!.vectorSample({ fingerprint: opened.reference.sceneFingerprint, objectId, sampleIndex })
      .then(sample => { if (current === topologyGeneration.current && sample.fingerprint === opened.reference.sceneFingerprint)
        setPickedVectorSample(sample); })
      .catch(error => { if (current === topologyGeneration.current)
        setTopologyError(`Vector selection refused: ${String((error as Error)?.message ?? error)}`); })
      .finally(() => { if (current === topologyGeneration.current) setVerifyingTopology(false); });
  };
  const clearTopologySelection = () => {
    topologyGeneration.current++; setPickedTopologySample(null); setPickedVectorSample(null);
    setTopologyError(""); setVerifyingTopology(false);
  };
  const selectBandSample = (objectId: string, sampleIndex: number) => {
    const current = ++bandGeneration.current;
    scalarGeneration.current++; setPickedScalarSample(null); setScalarError("");
    topologyGeneration.current++; setPickedTopologySample(null); setPickedVectorSample(null);
    setPickedPrimitive(null); setPickedBandSample(null); setBandSelectionError(""); setVerifyingBand(true);
    void window.quantumScenes!.bandSample({ fingerprint: opened.reference.sceneFingerprint, objectId, sampleIndex })
      .then(sample => {
        if (bandGeneration.current === current && sample.fingerprint === opened.reference.sceneFingerprint) {
          setPickedBandSample(sample);
          if (qwzRole === "bands") scientificCursorBus.publish({ runId: sample.runId,
            resultSha256: sample.resultSha256, datasetId: sample.coordinateDatasetId,
            reciprocalPoint: { k: [sample.k[0], sample.k[1]], basisId: `qwz:${scene.coordinates.units[0]}`,
              bandId: sample.bandId, sampleIndex: sample.sampleIndex }, originViewId: opened.reference.sceneFingerprint });
        }
      }).catch(error => {
        if (bandGeneration.current === current)
          setBandSelectionError(`Band selection refused: ${String((error as Error)?.message ?? error)}`);
      }).finally(() => { if (bandGeneration.current === current) setVerifyingBand(false); });
  };
  const selectScalarSample = (objectId: string, sampleIndex: number) => {
    const current = ++scalarGeneration.current;
    setPickedScalarSample(null); setScalarError(""); setVerifyingScalar(true);
    void window.quantumScenes!.scalarSample({ fingerprint: opened.reference.sceneFingerprint, objectId, sampleIndex })
      .then(sample => { if (current === scalarGeneration.current && sample.fingerprint === opened.reference.sceneFingerprint)
        setPickedScalarSample(sample); })
      .catch(error => { if (current === scalarGeneration.current)
        setScalarError(`Scalar selection refused: ${String((error as Error)?.message ?? error)}`); })
      .finally(() => { if (current === scalarGeneration.current) setVerifyingScalar(false); });
  };
  const inspectRiceComparison = () => {
    if (!window.quantumScenes || !riceComparison || verifyingComparison) return;
    const generation=++comparisonGeneration.current;
    setComparisonSamples(null); setComparisonError(""); setVerifyingComparison(true);
    const sites=2*Number(scene.provenance.parameters?.chainCells);
    const requests:[string,number][]=[
      ["comparison-bulk-current",comparisonTime],["comparison-bulk-charge",comparisonTime],
      ["chain-density",comparisonTime*sites+comparisonSite],
      ["chain-current",comparisonTime*(sites-1)+Math.min(comparisonSite,sites-2)],
      ["chain-charge",comparisonTime],["chain-left-edge",comparisonTime],["chain-right-edge",comparisonTime],
    ];
    void Promise.all(requests.map(async ([objectId,sampleIndex])=>{
      const sample=await window.quantumScenes!.scalarSample({fingerprint:opened.reference.sceneFingerprint,objectId,sampleIndex});
      if(sample.fingerprint!==opened.reference.sceneFingerprint||sample.runId!==scene.provenance.runId||
         sample.resultSha256!==scene.provenance.resultSha256)throw new Error("Comparison source identity changed");
      return [objectId,sample] as const;
    })).then(samples=>{
      if(samples.some(([,sample])=>sample.position[0]!==samples[0][1].position[0]))throw new Error("Saved time samples are not aligned");
      if(generation===comparisonGeneration.current)setComparisonSamples(Object.fromEntries(samples));
    }).catch(error=>{
      if(generation===comparisonGeneration.current)setComparisonError(`Comparison refused: ${String((error as Error)?.message??error)}`);
    }).finally(()=>{if(generation===comparisonGeneration.current)setVerifyingComparison(false);});
  };
  const primitiveMeshes = useMemo(() => buildQuantumPrimitiveMeshes(document.geometry, scene.objects, opened.mappedObjectIds),
    [document.geometry, scene.objects, opened.mappedObjectIds]);
  const vectorMeshes = useMemo(() => buildQuantumVectorGlyphMeshes(document.geometry,
    details.topologyDisplay?.vectors ?? [], scene.objects, glyphDensity),
    [document.geometry, details.topologyDisplay, scene.objects, glyphDensity]);
  const reciprocalView = useMemo(() => scene.reciprocal ? buildQuantumReciprocalView(document.geometry,
    scene.reciprocal, scene.objects, opened.mappedObjectIds) : null,
    [document.geometry, scene.reciprocal, scene.objects, opened.mappedObjectIds]);
  const reciprocalMeshes = useMemo(() => reciprocalView ? buildQuantumPrimitiveMeshes(reciprocalView.geometry,
    reciprocalView.objects, reciprocalView.mappedObjectIds) : [], [reciprocalView]);
  const supercellMeshes = useMemo(() => supercell ? buildQuantumPrimitiveMeshes(supercell.geometry,
    [supercell.siteObject], [SUPERCELL_SITE_OBJECT_ID]) : [], [supercell]);
  const activePrimitiveMeshes = supercell ? supercellMeshes : geometrySpace === "reciprocal" ? reciprocalMeshes : primitiveMeshes;
  const pickedReciprocalPoint = scene.reciprocal && geometrySpace === "reciprocal" ?
    reciprocalPointFromPrimitive(scene.reciprocal, pickedPrimitive) : null;
  const pickedReciprocalPath = scene.reciprocal && geometrySpace === "reciprocal" ?
    reciprocalPathFromPrimitive(scene.reciprocal, pickedPrimitive) : null;
  const selectReciprocalPrimitive = (primitive: QuantumPrimitive | null) => {
    const current = ++reciprocalGeneration.current;
    setVerifyingReciprocal(true); setReciprocalError(""); setPickedPrimitive(null);
    void window.quantumScenes!.verifyActive(opened.reference.sceneFingerprint).then(() => {
      if (current !== reciprocalGeneration.current) return;
      clearTopologySelection();
      setPickedPrimitive(primitive); setPickedBandSample(null);
    }).catch(error => {
      if (current === reciprocalGeneration.current)
        setReciprocalError(`Reciprocal selection refused: ${String((error as Error)?.message ?? error)}`);
    }).finally(() => { if (current === reciprocalGeneration.current) setVerifyingReciprocal(false); });
  };
  const meshObjects = useMemo(() => {
    const mapped = new Set(opened.mappedObjectIds);
    const triangles = document.geometry.triangles ?? [];
    let offset = 0;
    return scene.objects.filter((object) => object.kind === "mesh" && mapped.has(object.id)).flatMap((object) => {
      const count = details.mappedTriangleCounts?.[object.id] ?? scene.datasets.find((dataset) => dataset.id === object.indices)?.count ?? 0;
      const faces = triangles.slice(offset, offset + count);
      offset += count;
      const scalar = details.topologyDisplay?.scalars.find(item => item.objectId === object.id);
      const bins = scalar ? CURVATURE_COLORS.map((_, bin) => faces.filter((_, index) => scalar.faceBins[index] === bin)) : [faces];
      return bins.flatMap((group, bin) => {
        if (!group.length) return [];
        const positions = new Float32Array(group.length * 9);
        group.forEach((face, faceIndex) => {
          [face.a, face.b, face.c].forEach((vertex, vertexIndex) => {
            const base = faceIndex * 9 + vertexIndex * 3;
            positions[base] = vertex.x;
            positions[base + 1] = vertex.y;
            positions[base + 2] = vertex.z;
          });
        });
        return [{ id: scalar ? `${object.id}:scalar-bin:${bin}` : object.id, sourceObjectId: object.id,
          quantityId: scalar?.quantityId, label: object.label, positions, indices: null, faces: group,
          source: { kind: "polyhedronPreset" as const, label: object.label },
          color: scalar ? CURVATURE_COLORS[bin] : Number.parseInt(object.style.color.slice(1), 16),
          opacity: object.style.opacity }];
      });
    });
  }, [document.geometry.triangles, opened.mappedObjectIds, scene.datasets, scene.objects, details.mappedTriangleCounts, details.topologyDisplay]);
  const viewerScene = useMemo(() => {
    if (supercell) return { ...supercell.geometry, points: [] };
    const sourceGeometry = geometrySpace === "reciprocal" && reciprocalView ? reciprocalView.geometry : document.geometry;
    const sourceMeshes = geometrySpace === "reciprocal" ? reciprocalMeshes : primitiveMeshes;
    const primitiveIds = new Set(sourceMeshes.map(mesh => mesh.id));
    const translations = geometrySpace === "source" ? scene.lattice?.translations.map((vector, axis) => ({
      a: { x: 0, y: 0, z: 0, id: `lattice:translation:${axis}:origin` },
      b: { x: vector[0], y: vector[1], z: vector[2], id: `lattice:translation:${axis}:tip` },
      color: 0xf2b36f, opacity: 1,
    })) ?? [] : [];
    return { ...sourceGeometry,
      triangles: geometrySpace === "reciprocal" || meshObjects.length ? [] : sourceGeometry.triangles,
      points: sourceGeometry.points?.filter(point => !sourceMeshes.length ||
        ![...primitiveIds].some(id => point.id?.startsWith(`${id}:site:`))),
      segments: [...(sourceGeometry.segments?.filter(segment => !sourceMeshes.length ||
        ![...primitiveIds].some(id => segment.a.id?.startsWith(`${id}:link:`))) ?? []), ...translations] };
  }, [document.geometry, geometrySpace, meshObjects, primitiveMeshes, reciprocalMeshes, reciprocalView, scene.lattice, supercell]);
  const timeDisplayScene = useMemo(() => timeFrame && scene.time ? { ...viewerScene,
    points: [...(viewerScene.points ?? []), ...timeFrame.tracks.filter(track => track.object).map(track => ({
      x: track.xyz[0], y: track.xyz[1], z: track.xyz[2], id: `time-frame:${track.id}`,
      label: `${track.id} at ${timeFrame.time} ${timeFrame.unit}`, color: 0xffc857, size: .18,
    }))] } : viewerScene, [viewerScene, timeFrame, scene.time]);
  const visibleGeometry = useMemo(() => ({ ...timeDisplayScene,
    points: timeDisplayScene.points?.filter(point => topologyOverlayObjectVisible(point.id, hiddenTopologyObjectIds)),
    segments: timeDisplayScene.segments?.filter(segment => topologyOverlayObjectVisible(segment.a.id, hiddenTopologyObjectIds)),
  }), [timeDisplayScene, hiddenTopologyObjectIds]);
  const visibleMeshOverrides = useMemo(() => (supercell ? supercellMeshes :
    geometrySpace === "reciprocal" ? reciprocalMeshes : [...meshObjects, ...primitiveMeshes, ...vectorMeshes])
    .filter(mesh => topologyOverlayObjectVisible("sourceObjectId" in mesh ? String(mesh.sourceObjectId) : mesh.id,
      hiddenTopologyObjectIds)),
  [supercell, supercellMeshes, geometrySpace, reciprocalMeshes, meshObjects, primitiveMeshes, vectorMeshes, hiddenTopologyObjectIds]);
  const visibleLabels = useMemo(() => {
    const annotations = geometrySpace === "reciprocal" ? [] : supercell ? [] : scene.annotations;
    const supplied = annotations.filter(annotation => annotation.text.length <= 64).map(annotation => ({
      text: annotation.text, position: { x: annotation.position[0], y: annotation.position[1], z: annotation.position[2] },
    }));
    if (geometrySpace === "reciprocal" && reciprocalView) supplied.push(...reciprocalView.labels);
    if (pickedPrimitive) supplied.push({ text: `${pickedPrimitive.objectLabel} · ${pickedPrimitive.index}`,
      position: pickedPrimitive.position });
    return supplied.length ? [{ labels: supplied, color: 0xe2e8f0, backgroundColor: 0x172033 }] : [];
  }, [geometrySpace, reciprocalView, scene.annotations, pickedPrimitive, supercell]);
  const pickScene = (info: { meshKey?: string; faceIndex?: number; point: Vector3 }) => {
    const vector = geometrySpace === "source" && !supercell ?
      vectorMeshes.find(entry => entry.id === info.meshKey)?.primitivesByFace[info.faceIndex ?? -1] : undefined;
    if (vector) { selectVectorSample(vector.objectId, vector.index); return; }
    const primitive = activePrimitiveMeshes.find(entry => entry.id === info.meshKey)?.primitivesByFace[info.faceIndex ?? -1];
    if (primitive) {
      clearTopologySelection();
      if (geometrySpace === "reciprocal") selectReciprocalPrimitive(primitive);
      else if (!supercell && scene.bands?.kind === "path" && scene.bands.objects.includes(primitive.objectId) && primitive.endpoints) {
        const [a, b] = primitive.endpoints;
        const distance = (point: Vector3) => Math.hypot(point.x - info.point.x, point.y - info.point.y, point.z - info.point.z);
        selectBandSample(primitive.objectId, primitive.index + (distance(b) < distance(a) ? 1 : 0));
      }
      else {
        setPickedPrimitive(primitive); setPickedBandSample(null);
        if (!supercell && scene.objects.find(object => object.id === primitive.objectId)?.scalars)
          selectScalarSample(primitive.objectId, primitive.index);
        else { scalarGeneration.current++; setPickedScalarSample(null); setScalarError(""); }
      }
      return;
    }
    setPickedPrimitive(null);
    const mesh = supercell || geometrySpace === "reciprocal" ? undefined : meshObjects.find((entry) => entry.id === info.meshKey);
    const face: SceneTriangle | undefined = mesh?.faces[info.faceIndex ?? -1];
    if (!mesh || !face) { setPickedBandSample(null); return; }
    const nearest = [face.a, face.b, face.c].reduce((best, candidate) =>
      Math.hypot(candidate.x - info.point.x, candidate.y - info.point.y, candidate.z - info.point.z) <
      Math.hypot(best.x - info.point.x, best.y - info.point.y, best.z - info.point.z) ? candidate : best);
    const prefix = `${mesh.sourceObjectId}:`;
    const sampleIndex = nearest.id?.startsWith(prefix) ? Number(nearest.id.slice(prefix.length)) : NaN;
    if (!Number.isSafeInteger(sampleIndex)) { setTopologyError("Mesh vertex has no verified sample identity"); return; }
    if (mesh.quantityId) selectTopologySample(mesh.quantityId, sampleIndex);
    else if (scene.bands?.objects.includes(mesh.sourceObjectId)) selectBandSample(mesh.sourceObjectId, sampleIndex);
  };
  const viewCapabilities: QuantumSceneCapabilities = {
    fields: scene.fields ?? [],
    hasGeometry: Boolean(count || scene.lattice || supercell || reciprocalView || vectorMeshes.length),
    hasBands: Boolean(scene.bands),
    hasLattice: Boolean(scene.lattice),
    hasTrajectory: scene.objects.some(object => object.kind === "trajectory" || object.kind === "polyline"),
  };
  const availableView = (request: QuantumViewRequest) => Boolean(negotiateQuantumView(request, viewCapabilities));
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const trace = useMemo(() => new QuantumViewerTrace({ runId: scene.provenance.runId,
    resultSha256: scene.provenance.resultSha256, sceneFingerprint: opened.reference.sceneFingerprint,
    model: scene.provenance.model }), [scene.provenance.runId, scene.provenance.resultSha256,
      scene.provenance.model, opened.reference.sceneFingerprint]);
  const [supportStatus, setSupportStatus] = useState("");
  useEffect(() => {
    const previous = window.document.activeElement instanceof HTMLElement ? window.document.activeElement : null;
    closeButtonRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation();
        void window.quantumScenes?.cancelStreamLevel(opened.reference.sceneFingerprint); onCloseRef.current(); return; }
      if (event.key !== "Tab") return;
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex='0']") ?? [])];
      if (!focusable.length) return;
      const first = focusable[0]!, last = focusable.at(-1)!;
      if (event.shiftKey && window.document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && window.document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("keydown", onKey, true); previous?.focus(); };
  }, [opened.reference.sceneFingerprint]);
  useEffect(() => {
    trace.record("opened");
    if (opened.diagnostics) for (const [name, value] of Object.entries(opened.diagnostics))
      trace.measure(name as "importMs" | "datasetBytes" | "mappedPrimitives", value);
    const started = performance.now();
    const frame = requestAnimationFrame(() => { trace.measure("firstFrameMs", performance.now() - started); trace.record("first-frame"); });
    return () => { cancelAnimationFrame(frame); trace.record("closed"); };
  }, [trace, opened.diagnostics]);
  useEffect(() => { trace.record("view"); }, [trace, view]);
  useEffect(() => { if (pickedBandSample || pickedScalarSample || pickedTopologySample || pickedVectorSample) trace.record("sample"); },
    [trace, pickedBandSample, pickedScalarSample, pickedTopologySample, pickedVectorSample]);
  useEffect(() => { if (timeError || topologyError || bandSelectionError || scalarError || reciprocalError || streamStatus.includes("unavailable")) trace.record("error"); },
    [trace, timeError, topologyError, bandSelectionError, scalarError, reciprocalError, streamStatus]);
  const exportSupport = async () => {
    setSupportStatus("Re-verifying the active source…");
    try {
      if (!window.quantumScenes?.verifyActive || !await window.quantumScenes.verifyActive(opened.reference.sceneFingerprint))
        throw new Error("Desktop source verifier unavailable");
      const blob = new Blob([JSON.stringify(trace.supportBundle(), null, 2) + "\n"], { type: "application/json" });
      const url = URL.createObjectURL(blob), link = window.document.createElement("a");
      link.href = url; link.download = `quantum-support-${opened.reference.sceneFingerprint.slice(0, 12)}.json`;
      window.document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setSupportStatus("Redacted support bundle downloaded from the re-verified scene.");
    } catch (error) { trace.record("error"); setSupportStatus(`Support export refused: ${String((error as Error).message ?? error)}`); }
  };
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Verified quantum scene" data-testid="quantum-scene-preview"
      ref={dialogRef}
      style={{ position: "fixed", inset: 0, zIndex: 2900, background: "rgba(15,23,42,.64)", display: "grid", placeItems: "center", padding: 12 }}>
      <div style={{ width: "min(1200px, calc(100vw - 24px))", height: "min(790px, calc(100dvh - 24px))", minHeight: 0, background: "var(--panel-strong, #fff)",
        color: "var(--text, #172033)", borderRadius: 12, display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", overflow: "hidden" }}>
        <header style={{ padding: "10px 16px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16, borderBottom: "1px solid var(--border, #cbd5e1)" }}>
          <div><strong>{document.title}</strong><div style={{ fontSize: 12 }}>Verified {scene.schema} · {scene.provenance.model} · {opened.stream ?
            `Stream ${opened.stream.level + 1}/${opened.stream.levels.length}: ${opened.stream.levels[opened.stream.level].label}` :
            "Save a workspace or attach it to a Project to retain this source"}</div>
            {streamStatus && <small role="status" data-testid="quantum-stream-status">{streamStatus}</small>}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {opened.stream && opened.stream.level < opened.stream.levels.length - 1 && <button type="button"
              data-testid="quantum-stream-load-full" disabled={streamBusy} onClick={() => { void (async () => {
                setStreamBusy(true); setStreamStatus("Loading and verifying the full source level…");
                try { const result = await window.quantumScenes!.loadStreamLevel(opened.reference.sceneFingerprint,
                  opened.stream!.levels.length - 1);
                  if (!result.ok) throw new Error(result.canceled ? "Loading canceled" : result.error);
                  onOpenRelated?.(result);
                } catch (error) { setStreamStatus(`Full level unavailable: ${String((error as Error).message)}`); }
                finally { setStreamBusy(false); }
              })(); }}>Load full verified level</button>}
            {streamBusy && <button type="button" data-testid="quantum-stream-cancel" onClick={() => {
              void window.quantumScenes?.cancelStreamLevel(opened.reference.sceneFingerprint);
              setStreamStatus("Canceling full-level load…");
            }}>Cancel load</button>}
            <button type="button" ref={closeButtonRef} onClick={() => { if (streamBusy) void window.quantumScenes?.cancelStreamLevel(opened.reference.sceneFingerprint); onClose(); }} data-testid="quantum-scene-close">Close</button>
          </div>
        </header>
        <div className="quantum-scene-layout">
          <div style={{ minHeight: 0, position: "relative", display: "flex", flexDirection: "column" }} data-testid="quantum-scene-geometry">
            {scene.time && <div data-testid="quantum-time-playback" style={{ padding: "10px 14px", borderBottom: "1px solid var(--border, #cbd5e1)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button type="button" onClick={() => setTimePlaying(value => !value)}>{timePlaying ? "Pause" : "Play"}</button>
                <input type="range" aria-label="Physical time frame" min={scene.time.playback.startFrame} max={scene.time.playback.endFrame}
                  value={timeFrameIndex} onChange={event => setTimeFrameIndex(Number(event.target.value))} style={{ flex: 1 }} />
                <strong>{timeFrame ? `${timeFrame.time.toPrecision(6)} ${timeFrame.unit}` : scene.time.frameIds[timeFrameIndex]}</strong>
              </div>
              {timeFrame && <small data-testid="quantum-time-tracks">{timeFrame.frameId} · {timeFrame.tracks.map(track =>
                `${track.id}: (${track.xyz.map(value => value.toPrecision(4)).join(", ")})`).join(" · ")}</small>}
              {timeFrames && timeFrames.length > 1 && timeFrames[0].tracks.some(track => track.id === "sigma-z") && <svg
                role="img" aria-label="Pauli sigma z expectation versus physical time" viewBox="0 0 300 120"
                onClick={event => { const bounds = event.currentTarget.getBoundingClientRect();
                  const fraction = ((event.clientX - bounds.left) / bounds.width * 300 - 10) / 280;
                  setTimePlaying(false); setTimeFrameIndex(nearestRecordedFrame(timeFrames, fraction)); }}
                style={{ display: "block", width: "100%", maxWidth: 420, height: 100, marginTop: 6, background: "var(--panel, #f8fafc)" }}>
                <line x1="10" y1="60" x2="290" y2="60" stroke="#94a3b8" />
                <polyline fill="none" stroke="#d97706" strokeWidth="2" points={timeFrames.map(frame => {
                  const x = 10 + 280 * (frame.time - timeFrames[0].time) / (timeFrames[timeFrames.length - 1].time - timeFrames[0].time);
                  const value = frame.tracks.find(track => track.id === "sigma-z")!.xyz[1];
                  return `${x},${60 - 45 * value}`;
                }).join(" ")} />
                {timeFrame && <circle cx={10 + 280 * (timeFrame.time - timeFrames[0].time) /
                  (timeFrames[timeFrames.length - 1].time - timeFrames[0].time)}
                  cy={60 - 45 * timeFrame.tracks.find(track => track.id === "sigma-z")!.xyz[1]}
                  r="5" fill="#f59e0b" stroke="#111827" />}
                <text x="10" y="113" fontSize="10">{timeFrames[0].time.toPrecision(4)}</text>
                <text x="260" y="113" fontSize="10">{timeFrames[timeFrames.length - 1].time.toPrecision(4)} {scene.time.unit}</text>
              </svg>}
              {timeFrame && <small data-testid="quantum-time-termination">Recorded frame {timeFrame.index + 1}/{scene.time.frameIds.length}
                {timeFrame.index >= scene.time.playback.endFrame && !scene.time.playback.loop ? " · supplied endpoint reached" : " · exact sample; no interpolation"}</small>}
              {timeError && <small role="alert">{timeError}</small>}
            </div>}
            {scene.reciprocal && <div data-testid="quantum-space-controls" style={{ padding: 8, display: "flex", gap: 8 }}>
              <button type="button" aria-pressed={geometrySpace === "source"} onClick={() => {
                reciprocalGeneration.current++; setVerifyingReciprocal(false); setReciprocalError("");
                clearTopologySelection();
                setGeometrySpace("source"); setPickedPrimitive(null); setPickedBandSample(null); setView("geometry");
              }}>Supplied geometry</button>
              <button type="button" aria-pressed={geometrySpace === "reciprocal"} onClick={() => {
                reciprocalGeneration.current++; setVerifyingReciprocal(false); setReciprocalError("");
                clearTopologySelection();
                setSupercell(null); setGeometrySpace("reciprocal"); setPickedPrimitive(null); setPickedBandSample(null); setView("geometry");
              }}>Reciprocal space</button>
            </div>}
            {topologyOverlays.length > 0 && <section data-testid="quantum-topology-overlays" style={{ padding: 8 }}>
              <strong>Source-linked topology geometry</strong>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {topologyOverlays.map(group => <label key={group.id}>
                  <input type="checkbox" aria-label={`Show ${group.label}`} checked={!hiddenTopologyOverlays.includes(group.id)}
                    onChange={event => {
                      setHiddenTopologyOverlays(current => event.target.checked ? current.filter(id => id !== group.id) : [...current, group.id]);
                      setPickedPrimitive(null); setPickedBandSample(null); clearTopologySelection();
                    }}/> {group.label} ({group.objectIds.join(", ")})
                </label>)}
              </div>
              <small>Geometry and labels come from the verified scene. Enclosing a node does not establish charge; only a producer-supplied invariant can report it.</small>
              {scene.topology?.invariants.filter(item => /charge|chern|gap/i.test(item.id)).map(item =>
                <div key={item.id}>Producer {item.label}: {item.value ?? "undefined"} · {item.status} · {item.method}</div>)}
            </section>}
            {Boolean(scene.fields?.length) && <div style={{ padding: 8, display: "flex", gap: 8 }}>
              {availableView("geometry") && <button type="button" onClick={() => setView("geometry")} aria-pressed={view === "geometry"}>Geometry</button>}
              {availableView("slice") && <button type="button" onClick={() => setView("slice")} aria-pressed={view === "slice"}>Field slice</button>}
              {availableView("volume") && <button type="button" onClick={() => setView("volume")} aria-pressed={view === "volume"}>Volume</button>}
              {availableView("surface") && <button type="button" onClick={() => setView("surface")} aria-pressed={view === "surface"}>Density surface</button>}
              {scene.fields?.length === 1 && scene.objects.length === 0 &&
                scene.datasets.length === (scene.fields[0].kind === "complex-field" ? 2 : 1) && <button type="button"
                data-testid="quantum-promote-field" disabled={promotingField} onClick={() => { void (async () => { try {
                  setPromotingField(true);
                  const field = await onPromoteField?.();
                  if (!field) throw new Error("Project field promotion is unavailable.");
                  setFieldPromotionStatus(`Saved ${field.metadata.title} as a source-backed Field Explorer document.`);
                  setView("slice");
                } catch (error) { setFieldPromotionStatus(`Field promotion refused: ${String((error as Error).message)}`); }
                finally { setPromotingField(false); } })(); }}>
                {activeFieldDocument ? "Refresh Field Explorer document" : "Promote to Field Explorer"}</button>}
            </div>}
            <div style={{ minHeight: 0, flex: 1, position: "relative" }}>
            <QuantumViewHost request={view} capabilities={viewCapabilities} context={{
              fingerprint: opened.reference.sceneFingerprint, resultSha256: scene.provenance.resultSha256,
              fields: scene.fields ?? [], axes: scene.coordinates.axes, units: scene.coordinates.units, camera,
              runId: scene.provenance.runId, coordinateSystemId: "field-grid",
              fieldView: activeFieldDocument?.view, onFieldViewChange,
              createSurfaceDerivation: (fieldId, level, threshold) => {
                const field = scene.fields?.find(item => item.id === fieldId);
                if (!field?.imaginary) throw new TypeError("A verified complex source is required for this surface.");
                const source = quantumSceneDocumentFromVerifiedOpen(opened).source;
                const record = createQuantumDerivationRecord(source, `${fieldId}:isosurface:${level}`,
                  [field.real, field.imaginary], "quantum-density-isosurface/tetrahedra", "1",
                  { level, threshold, extraction: "bounded-24-step-grid" });
                onRecordDerivation?.(record);
                return record;
              },
              geometry: <GeometryViewer scene={visibleGeometry} meshOverrides={visibleMeshOverrides}
              overlayLabelSets={visibleLabels} showPlanes={false}
              pickEnabled={visibleMeshOverrides.length > 0} onPick={pickScene}
              onPickMiss={() => { reciprocalGeneration.current++; bandGeneration.current++; topologyGeneration.current++;
                scalarGeneration.current++; setPickedScalarSample(null); setScalarError(""); setVerifyingScalar(false);
                setVerifyingReciprocal(false); setVerifyingBand(false); setBandSelectionError("");
                setVerifyingTopology(false); setTopologyError(""); setPickedTopologySample(null); setPickedVectorSample(null);
                setPickedBandSample(null); setPickedPrimitive(null); }}
              inspectSelectionMeshKey={pickedPrimitive?.objectId ?? pickedBandSample?.objectId ?? pickedVectorSample?.objectId}
              cameraOverride={!supercell && geometrySpace === "source" && camera ? { position: camera.position, target: camera.target, up: camera.up } : null} />
            }} />
            </div>
          </div>
          <aside style={{ padding: 16, overflow: "auto", borderLeft: "1px solid var(--border, #cbd5e1)", fontSize: 12, lineHeight: 1.5 }}>
            <QuantumInspectorSummary data={{ view, mapped: opened.mappedObjectIds.length, deferred: opened.deferredObjectIds.length,
              stream: opened.stream ? `Verified level ${opened.stream.level + 1} of ${opened.stream.levels.length}` : undefined,
              datasets: scene.datasets, invariants: scene.topology?.invariants ?? [], limitations: scene.topology?.limitations ?? [],
              provenance: { schema: scene.schema, model: scene.provenance.model, runId: scene.provenance.runId,
                resultSha256: scene.provenance.resultSha256, fingerprint: opened.reference.sceneFingerprint,
                engine: scene.provenance.engine, engineVersion: scene.provenance.engineVersion } }} onExportSupport={exportSupport} supportStatus={supportStatus} />
            <h3>Detailed source inspection</h3>
            {scene.time?.tracks.some(track => track.id === "bloch") && <section data-testid="quantum-dynamics-inspector" style={{ border: "1px solid var(--border, #cbd5e1)", borderRadius: 8, padding: 10, marginBottom: 14 }}>
              <h3 style={{ marginTop: 0 }}>Recorded dynamics</h3>
              {timeFrame ? <><p>Exact frame <code>{timeFrame.frameId}</code> · t={timeFrame.time.toPrecision(8)} {timeFrame.unit} · source run <code>{timeFrame.runId}</code>.</p>
                {timeFrame.tracks.filter(track => track.id === "bloch").map(track => <p key={track.id}>Bloch vector: ({track.xyz.map(value => value.toPrecision(6)).join(", ")}) · source track <code>{track.id}</code>.</p>)}
                {timeFrame.tracks.filter(track => track.id !== "bloch").map(track => <p key={track.id}>{track.id}: {track.xyz[1].toPrecision(8)} · recorded sample {track.xyz.map(value => value.toPrecision(6)).join(", ")}.</p>)}
                <p>Density matrix: unavailable in this scene. Time-resolved spectrum: unavailable in this scene.</p>
                <p>Result SHA-256: <code style={{ overflowWrap: "anywhere" }}>{timeFrame.resultSha256}</code>.</p>
              </> : <p>{timeError || "Loading verified time samples…"}</p>}
            </section>}
            {fieldPromotionStatus && <p data-testid="quantum-field-promotion-status" role="status">{fieldPromotionStatus}</p>}
            {activeFieldDocument && <section data-testid="quantum-field-explorer-document">
              <h3>Field Explorer document</h3>
              <p>Native Project field · {activeFieldDocument.source.field.label} · verified {activeFieldDocument.source.mapping.schema} mapping.</p>
              <p>Source: {activeFieldDocument.source.scene.sceneId} / {activeFieldDocument.source.field.id} · {activeFieldDocument.source.field.shape.join(" × ")} samples · {activeFieldDocument.source.field.amplitudeUnit}.</p>
              <p>Axes: {activeFieldDocument.source.mapping.axes.map((axis, index) => `${axis} (${activeFieldDocument.source.mapping.units[index]})`).join(" · ")}.</p>
              <p>Project identity: <code>{activeFieldDocument.identity.id}</code> · source hash <code>{activeFieldDocument.identity.structuralHash}</code>.</p>
              <p>Slice orientation, probe selection and camera are display state. Density and phase derive from exact supplied complex amplitudes.</p>
            </section>}
            {scene.provenance.model==="bhz"&&scene.bands?.kind==="surface"&&<section data-testid="bhz-study-profile" style={{ padding: 10, marginBottom: 14, border: "1px solid var(--border, #cbd5e1)", borderRadius: 8 }}>
              <h3 style={{ margin: 0 }}>BHZ · producer-supplied bulk study</h3>
              <p>Four stored band surfaces from one verified Theory Lab result. Math3D reads the supplied energy arrays and sample coordinates; it runs no BHZ solver.</p>
              <p>Run <code>{scene.provenance.runId}</code> · result SHA-256 <code style={{overflowWrap:"anywhere"}}>{scene.provenance.resultSha256}</code>.</p>
              <p>Model inputs: M={scene.provenance.parameters?.mass}, A=B=1, ε=0; momentum grid {scene.bands.grid?.join(" × ")}. Energy unit: {scene.bands.energyUnit}.</p>
              {scene.topology?.invariants.map(item=><p key={item.id}>{item.label}: {item.value??"unavailable"} · producer status {item.status} · {item.method}.</p>)}
              <p>Edge states, spin mixing, and a general BHZ phase diagram are not supplied. A gap closure or unresolved producer mesh carries no verified Z₂ label.</p>
            </section>}
            {scene.provenance.model==="bhz_general"&&scene.bands?.kind==="surface"&&<section data-testid="bhz-general-study-profile" style={{ padding: 10, marginBottom: 14, border: "1px solid var(--border, #cbd5e1)", borderRadius: 8 }}>
              <h3 style={{ margin: 0 }}>BHZ · Atlas bulk and finite-ribbon study</h3>
              <p>Verified {scene.coordinates.units[0].startsWith("inverse")?"continuum bulk":"a=1 lattice regularization"} view: four producer-supplied energy surfaces and exact momentum samples. Math3D does not compute bands, eigenvectors or topology.</p>
              <p>Run <code>{scene.provenance.runId}</code> · result SHA-256 <code style={{overflowWrap:"anywhere"}}>{scene.provenance.resultSha256}</code>.</p>
              <p>Inputs: {(["A","B","C","D","M","R"] as const).map(key=>`${key}=${scene.provenance.parameters?.[key]}`).join(" · ")}. Grid {scene.bands.grid?.join(" × ")}; k unit {scene.coordinates.units[0]}; energy unit {scene.bands.energyUnit}.</p>
              {scene.topology?.invariants.map(item=><p key={item.id}>{item.label}: {item.value??"unavailable"} · producer status {item.status} · {item.method}.</p>)}
              {scene.objects.some(object=>object.id==="ribbon-states")?<p>Finite open-ribbon eigenvalues and outer-cell weights are supplied as a read-only point cloud. They do not establish a semi-infinite edge dispersion or classify individual states.</p>:<p>This continuum view has no ribbon object. Open the paired lattice/ribbon example to inspect supplied finite-boundary samples.</p>}
              <p>Bulk and edge eigenvectors remain in the verified Theory Lab run; this scene exports selected energy and edge-weight arrays. Stored eigenvector phases are gauge-dependent.</p>
            </section>}
            {scene.provenance.model==="bbh"&&<section data-testid="bbh-study-profile" style={{ padding: 10, marginBottom: 14, border: "1px solid var(--border, #cbd5e1)", borderRadius: 8 }}>
              <h3 style={{ margin: 0 }}>BBH · producer-supplied {scene.objects.some(object=>object.id==="wilson-x-negative") ? "nested Wilson diagnostics" : scene.bands ? "bulk bands" : "finite open lattice"}</h3>
              <p>Run <code>{scene.provenance.runId}</code> · result SHA-256 <code style={{overflowWrap:"anywhere"}}>{scene.provenance.resultSha256}</code>.</p>
              <p>Inputs: γx={scene.provenance.parameters?.gammaX}, λx={scene.provenance.parameters?.lambdaX}, γy={scene.provenance.parameters?.gammaY}, λy={scene.provenance.parameters?.lambdaY}. {scene.objects.some(object=>object.id==="wilson-x-negative") ? `Four supplied Wannier-center branches on ${scene.datasets.find(dataset=>dataset.id==="wilson-x-negative-centers")?.count} transverse momentum samples. Select a branch for exact k and center in cycles.` : scene.bands ? `Momentum grid ${scene.bands.grid?.join(" × ")}; four stored energy surfaces.` : `Open lattice ${scene.provenance.parameters?.cells} × ${scene.provenance.parameters?.cells}; mean cell density over four finite midgap eigenstates.`}</p>
              {scene.objects.some(object=>object.id==="wilson-x-negative") ? <>
                {scene.topology?.invariants.map(item=><p key={item.id}>{item.label}: {item.value??"undefined"} · producer status {item.status} · {item.method}.</p>)}
                {scene.annotations.map(item=><p key={item.id}>{item.text}</p>)}
                <p>Math3D displays the supplied occupied and nested Wilson results; it does not solve the Hamiltonian or infer an invariant from finite corner density.</p>
              </> : <p>Corner localization is a finite-system observation. {scene.topology?.invariants.some(item=>item.id==="bbh-quadrupole") ? "The producer invariant is supplied separately from this view." : "No quadrupole invariant, edge classification, or phase boundary is calculated or claimed here."}</p>}
              {!scene.bands&&!scene.objects.some(object=>object.id==="wilson-x-negative") && <p>Marker size is a display-only mapping of the supplied nonnegative cell density; select a cell for its exact stored value and unit.</p>}
            </section>}
            {scene.provenance.model==="weyl_minimal"&&<section data-testid="weyl-study-profile" style={{ padding: 10, marginBottom: 14, border: "1px solid var(--border, #cbd5e1)", borderRadius: 8 }}>
              <h3 style={{ margin: 0 }}>Weyl · verified local cone</h3>
              <p>Run <code>{scene.provenance.runId}</code> · result SHA-256 <code style={{overflowWrap:"anywhere"}}>{scene.provenance.resultSha256}</code>.</p>
              <p>Atlas linearization Hχ(q)=χv q·σ. Velocity {scene.provenance.parameters?.velocity}; chirality {scene.provenance.parameters?.chirality}; enclosing radius {scene.provenance.parameters?.radius} inverse length. The sphere excludes the degeneracy at q=0.</p>
              {scene.topology?.invariants.map(item=><p key={item.id}>{item.label}: {item.value??"undefined"} · producer status {item.status} · {item.method}.</p>)}
              <p>The mesh, arrows and markers use producer-supplied samples. Inspect a sphere sample for its exact q and radial occupied-band Berry value. Math3D calculates no topological charge. The local model supplies no lattice partner, surface band or Fermi arc.</p>
            </section>}
            {scene.provenance.model==="nodal_line_two_band"&&<section data-testid="nodal-study-profile" style={{ padding: 10, marginBottom: 14, border: "1px solid var(--border, #cbd5e1)", borderRadius: 8 }}>
              <h3 style={{ margin: 0 }}>Nodal ring · verified continuum loop</h3>
              <p>Run <code>{scene.provenance.runId}</code> · result SHA-256 <code style={{overflowWrap:"anywhere"}}>{scene.provenance.resultSha256}</code>.</p>
              <p>Atlas H(k)=[m−B(kx²+ky²)]σx+vkzσz. Inputs: m={scene.provenance.parameters?.mass}, B={scene.provenance.parameters?.curvature}, v={scene.provenance.parameters?.velocity}; radial-z loop center {scene.provenance.parameters?.loopCenter}, radius {scene.provenance.parameters?.loopRadius}, {scene.provenance.parameters?.samples} stored samples. Coordinates use inverse length; band scalars use normalized energy.</p>
              {scene.topology?.invariants.map(item=><p key={item.id}>{item.label}: {item.value??"undefined"} · producer status {item.status} · {item.method}.</p>)}
              <p>Ring, loop and energy samples are supplied by Theory Lab. Select a loop marker to inspect its exact position and upper-band energy. The lower band remains in the verified bundle. Math3D calculates no Berry phase and makes no drumhead-state or surface claim.</p>
            </section>}
            {scene.provenance.model==="hofstadter_flux_sweep"&&<section data-testid="hofstadter-butterfly-profile" style={{ padding: 10, marginBottom: 14, border: "1px solid var(--border, #cbd5e1)", borderRadius: 8 }}>
              <h3 style={{margin:0}}>Hofstadter · verified flux sweep</h3>
              <p>Study <code>{scene.provenance.runId}</code> · result SHA-256 <code>{scene.provenance.resultSha256}</code>. Hopping t={scene.provenance.parameters?.hopping}; momentum grid {scene.provenance.parameters?.grid} × {scene.provenance.parameters?.grid}; reduced denominators through {scene.provenance.parameters?.maxDenominator}; filling {scene.provenance.parameters?.occupiedBands}.</p>
              <p>Each colored column is an independent hash-verified periodic Harper run. Teal means a producer-supplied Hall value at a resolved global gap; amber means no conditional Hall value. Click a point or use Inspect first below to read exact flux, energy, sample index and source hash. Source labels use S:Y/N for sampling convergence; gap codes D, C, U mean defined, closed and mesh-unresolved; H is the conditional Hall value in e²/h.</p>
              {fluxPoints.length > 0 && (() => {
                const low = Math.min(...fluxPoints.map(point => point.energy));
                const high = Math.max(...fluxPoints.map(point => point.energy));
                const stride = Math.max(1, Math.ceil(fluxPoints.length / 1600));
                return <div data-testid="hofstadter-linked-sweep">
                  <svg role="img" aria-label="Verified flux versus energy samples" viewBox="0 0 300 150"
                    style={{ width: "100%", height: 150, background: "#0f172a" }}>
                    <line x1="20" y1="130" x2="290" y2="130" stroke="#94a3b8" />
                    <line x1="20" y1="12" x2="20" y2="130" stroke="#94a3b8" />
                    {fluxPoints.filter((_, index) => index % stride === 0).map(point => <circle
                      key={`${point.objectId}:${point.sampleIndex}`} cx={20 + 270 * point.x}
                      cy={130 - 118 * (point.energy - low) / (high - low || 1)} r="2.2" fill={point.color}
                      role="button" tabIndex={0} aria-label={`Inspect ${point.objectId} sample ${point.sampleIndex}`}
                      onClick={() => selectScalarSample(point.objectId, point.sampleIndex)}
                      onKeyDown={event => { if (event.key === "Enter" || event.key === " ") selectScalarSample(point.objectId, point.sampleIndex); }} />)}
                    <text x="20" y="146" fill="#cbd5e1" fontSize="9">0</text><text x="268" y="146" fill="#cbd5e1" fontSize="9">p/q</text>
                  </svg>
                  <small>{Math.ceil(fluxPoints.length / stride)} of {fluxPoints.length} verified samples shown; display thinning does not interpolate. Energy {low.toPrecision(4)}–{high.toPrecision(4)} hopping energy.</small>
                </div>;
              })()}
              <div data-testid="hofstadter-butterfly-sources">{scene.annotations.map(note=><p key={note.id}>{note.text}</p>)}</div>
              {pickedScalarSample?.fingerprint === opened.reference.sceneFingerprint && pickedScalarSample.objectId.startsWith("flux-") && <div data-testid="hofstadter-butterfly-selection">
                <p>{scene.annotations.find(note=>note.id===`source-${pickedScalarSample.objectId.slice(5)}`)?.text}</p>
                <button type="button" disabled={openingFluxRun} onClick={() => { void openSelectedFluxRun(); }}>Open selected flux run in Theory Lab</button>
                {fluxRunStatus && <p role="status" data-testid="hofstadter-flux-run-status">{fluxRunStatus}</p>}
              </div>}
              <p>The third coordinate is a display plane. This is an ideal clean-model spectrum and conditional bulk Hall map. No experimental plateau or individual finite-strip edge classification is supplied; Math3D calculates no Harper result.</p>
            </section>}
            {scene.provenance.model==="hofstadter_bulk_edge_study"&&<section data-testid="hofstadter-bulk-edge-profile" style={{ padding: 10, marginBottom: 14, border: "1px solid var(--border, #cbd5e1)", borderRadius: 8 }}>
              <h3 style={{margin:0}}>Hofstadter · verified bulk–edge comparison</h3>
              <p>Study <code>{scene.provenance.runId}</code> · study SHA-256 <code>{scene.provenance.resultSha256}</code>. Flux {scene.provenance.parameters?.p}/{scene.provenance.parameters?.q}, hopping {scene.provenance.parameters?.hopping}, {scene.provenance.parameters?.occupiedBands} occupied bands, bulk grid {scene.provenance.parameters?.grid} × {scene.provenance.parameters?.grid}, strip momentum samples {scene.provenance.parameters?.stripSamples}.</p>
              <p data-testid="hofstadter-bulk-edge-status">{scene.annotations.find(note=>note.id==="comparison")?.text}</p>
              <p>{scene.annotations.some(note=>note.id==="convergence")?"Five":"Three"} independent hash-verified Theory Lab runs are shown. Blue markers use exact bulk (kₓ,kᵧ,E) samples. Teal and amber markers use each strip's exact (kᵧ,energy,edge weight) samples; their separate lanes are display offsets. Select a marker for its stored position, scalar value, dataset index and source hash.</p>
              {scene.annotations.find(note=>note.id==="tracking")?<p data-testid="hofstadter-tracking-status">{scene.annotations.find(note=>note.id==="tracking")?.text}. Highlighted crossing markers show the producer's overlap assignment; their scalar is squared overlap. An undefined status never establishes branch continuity.</p>:<p>Legacy saved scene: sorted strip state indices are not tracked branches; no eigenvector-overlap evidence was supplied.</p>}
              {scene.annotations.find(note=>note.id==="convergence")&&<div data-testid="hofstadter-edge-convergence-profile">
                <h4>Producer-supplied edge-flow convergence</h4>
                <p>{scene.annotations.find(note=>note.id==="convergence")?.text}</p>
                {scene.annotations.filter(note=>note.id.startsWith("termination-")||note.id.startsWith("seam-")).map(note=><p key={note.id}>{note.text}</p>)}
                <p>17- and 31-point crossing markers are exact stored source samples. Their second coordinate is a display lane. Periodic-seam assignments, matching termination and drift are producer diagnostics; Math3D calculates no continuation or crossing.</p>
              </div>}
              <div data-testid="hofstadter-bulk-edge-sources">{scene.annotations.filter(note=>note.id==="bulk"||note.id.startsWith("strip-")).map(note=><p key={note.id}>{note.text}</p>)}</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {scene.objects.filter(object=>object.id==="bulk-0"||/^strip-\d+-(left|right)$/.test(object.id)||/^tracked-\d+$/.test(object.id)||/^grid-(17|31)-\d+$/.test(object.id))
                  .map(object=><button key={object.id} type="button" aria-label={`Inspect first sample of ${object.id}`}
                    disabled={verifyingScalar} onClick={()=>selectScalarSample(object.id,0)}>{object.label}: first sample</button>)}
              </div>
              {pickedScalarSample&&<p data-testid="hofstadter-bulk-edge-selection">{scene.annotations.find(note=>note.id===(pickedScalarSample.objectId.startsWith("grid-")?`${pickedScalarSample.objectId}-${pickedScalarSample.sampleIndex}`:pickedScalarSample.objectId.startsWith("tracked-")?`track-${pickedScalarSample.objectId.slice(8)}-${pickedScalarSample.sampleIndex}`:pickedScalarSample.objectId.startsWith("bulk-")?"bulk":pickedScalarSample.objectId.startsWith("strip-")?pickedScalarSample.objectId.split("-").slice(0,2).join("-"):""))?.text}</p>}
              <p>This is a bounded producer-supplied flow comparison at a resolved filling. Math3D computes no Harper result and makes no experimental plateau, transport or unique edge-channel claim.</p>
            </section>}
            {scene.provenance.model==="hofstadter"&&scene.objects.some(object=>object.id==="strip-left")&&<section data-testid="hofstadter-strip-profile" style={{ padding: 10, marginBottom: 14, border: "1px solid var(--border, #cbd5e1)", borderRadius: 8 }}>
              <h3 style={{ margin: 0 }}>Hofstadter · verified finite Harper strip</h3>
              <p>Run <code>{scene.provenance.runId}</code> · result SHA-256 <code style={{overflowWrap:"anywhere"}}>{scene.provenance.resultSha256}</code>.</p>
              <p>Flux p/q={scene.provenance.parameters?.p}/{scene.provenance.parameters?.q}; hopping t={scene.provenance.parameters?.hopping}; {scene.provenance.parameters?.stripCells} open x sites and {scene.provenance.parameters?.stripSamples} Bloch-periodic y momenta. Energies are in hopping energy and kᵧ in rad / lattice constant.</p>
              <p>The teal and amber markers show source energies with first and last two-site probability weights. Their ±0.15 state-lane offsets are display only. The state index is sorted by energy at each kᵧ, not a continuously tracked branch. Select either boundary sample below for its exact stored kᵧ, energy, weight, dataset index and source hash.</p>
              <p>Finite-strip localization is a separate observation from the periodic occupied-gap Chern result. No filling, Hall response, plateau, or edge-channel classification is supplied; Math3D solves no Harper model.</p>
            </section>}
            {scene.provenance.model==="hofstadter"&&!scene.objects.some(object=>object.id==="strip-left")&&<section data-testid="hofstadter-study-profile" style={{ padding: 10, marginBottom: 14, border: "1px solid var(--border, #cbd5e1)", borderRadius: 8 }}>
              <h3 style={{ margin: 0 }}>Hofstadter · verified Harper bands{scene.topology?.invariants.length ? " and occupied-gap Chern" : ""}</h3>
              <p>Run <code>{scene.provenance.runId}</code> · result SHA-256 <code style={{overflowWrap:"anywhere"}}>{scene.provenance.resultSha256}</code>.</p>
              <p>Square-lattice reduced magnetic flux p/q={scene.provenance.parameters?.p}/{scene.provenance.parameters?.q}; hopping t={scene.provenance.parameters?.hopping}; {scene.provenance.parameters?.grid} × {scene.provenance.parameters?.grid} stored k samples. Momentum is in rad / lattice constant; energy is in hopping energy units.</p>
              <p>Each band surface displays supplied samples in the magnetic zone. Select a band point for its exact stored k, energy, dataset index and source run. The displayed gap is a minimum adjacent-band separation on this grid.</p>
              {scene.topology?.invariants.find(item=>item.id==="filled-hall-conductance")&&<div data-testid="hofstadter-hall-profile">
                <p>Selected filling: {scene.provenance.parameters?.occupiedBands} occupied magnetic bands. The producer compares the global maximum occupied energy with the global minimum empty energy on coarse and finer grids.</p>
                {scene.topology.invariants.filter(item=>item.id==="filled-global-gap"||item.id==="filled-hall-conductance").map(item=><p key={item.id}>{item.label}: {item.value??"undefined"} · producer status {item.status} · {item.method}.</p>)}
                <p>Conductance uses the producer's TKNN/FHS kx-ky sign convention in e²/h. This is an ideal clean-model bulk value conditional on the global gap, not an experimental plateau or a classification of individual strip channels. Math3D only displays the verified source.</p>
              </div>}
              {scene.topology?.invariants.length ? <>
                <p data-testid="hofstadter-chern-status">Producer occupied-gap Chern values: {scene.topology.invariants.map(item=>`${item.label} ${item.value??"undefined"} (${item.status})`).join(" · ")}. A touching middle gap remains undefined.</p>
                <p>The separate FHS plaquette meshes use a z=0 display plane. Select a flux sample below to inspect its exact supplied k, phase in radians, dataset index and source run. Math3D computes no Harper spectrum, Berry flux, Chern number or edge state.</p>
              </> : <p>This earlier saved scene contains band energies only; no Chern data was supplied. Math3D computes no Harper spectrum, Chern number or edge state.</p>}
            </section>}
            {scene.provenance.model==="landau_continuum"&&<section data-testid="landau-study-profile" style={{ padding: 10, marginBottom: 14, border: "1px solid var(--border, #cbd5e1)", borderRadius: 8 }}>
              <h3 style={{ margin: 0 }}>Landau · verified continuum level fan</h3>
              <p>Run <code>{scene.provenance.runId}</code> · result SHA-256 <code style={{overflowWrap:"anywhere"}}>{scene.provenance.resultSha256}</code>.</p>
              <p>2D uniform-field continuum, ħ=1. Stored inputs: mass {scene.provenance.parameters?.mass} normalized mass; charge {scene.provenance.parameters?.charge} elementary charge; signed B from {scene.provenance.parameters?.fieldStart} to {scene.provenance.parameters?.fieldStop} normalized magnetic field; {scene.provenance.parameters?.fieldSamples} field samples, {scene.provenance.parameters?.levels} levels, finite-difference grid {scene.provenance.parameters?.grid}.</p>
              {scene.annotations.map(item=><p key={item.id}>{item.text}</p>)}
              <p>Lines and markers show supplied results only. Select a marker for its exact signed B, level index and energy in the stated source units. Math3D runs no Landau solver. This result supplies no Hall conductivity, edge channel or plateau.</p>
            </section>}
            {scene.provenance.model==="rice_mele"&&<section data-testid="rice-mele-study-profile" style={{ padding: 10, marginBottom: 14, border: "1px solid var(--border, #cbd5e1)", borderRadius: 8 }}>
              <h3 style={{ margin: 0 }}>Rice–Mele · producer-supplied {scene.bands ? "static periodic bands" : "finite open-chain samples"}</h3>
              <p>Run <code>{scene.provenance.runId}</code> · result SHA-256 <code style={{overflowWrap:"anywhere"}}>{scene.provenance.resultSha256}</code>.</p>
              <p>Stored inputs: t₁={scene.provenance.parameters?.t1}, t₂={scene.provenance.parameters?.t2}, staggered Δ={scene.provenance.parameters?.delta}, open cells={scene.provenance.parameters?.cells}. {scene.bands ? `Select a band point for its exact stored k and energy (${scene.bands.energyUnit}).` : "Select a site for its exact stored middle-pair density (probability per site). A/B marker offsets are schematic."}</p>
              <p>Periodic bands and finite open-chain states are distinct saved views of one verified static run. Math3D calculates no Hamiltonian, parameter cycle, invariant or Thouless pump.</p>
            </section>}
            {scene.provenance.model==="rice_mele_convergence_study"&&<RiceMeleConvergenceProfile key={opened.reference.sceneFingerprint} scene={scene} fingerprint={opened.reference.sceneFingerprint}/>}
            {riceComparison&&<section data-testid="rice-mele-bulk-chain-profile" style={{padding:10,marginBottom:14,border:"1px solid var(--border, #cbd5e1)",borderRadius:8}}>
              <h3 style={{margin:0}}>Rice–Mele · periodic bulk and finite chain</h3>
              <p>One verified run <code>{scene.provenance.runId}</code> · result SHA-256 <code style={{overflowWrap:"anywhere"}}>{scene.provenance.resultSha256}</code>. Duration {scene.provenance.parameters?.duration}, {scene.provenance.parameters?.stepsPerPhase} unitary steps per phase, {scene.provenance.parameters?.chainCells} open cells.</p>
              <p>The periodic current and charge, chain site density and bond current, central-bond charge, and edge populations share exact saved time and phase indices. Math3D reads the supplied arrays; it runs no evolution.</p>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><label>Saved time index <select aria-label="Rice–Mele comparison time" value={comparisonTime} onChange={event=>{comparisonGeneration.current++;setComparisonTime(Number(event.target.value));setComparisonSamples(null);setComparisonError("");setVerifyingComparison(false);}}>{Array.from({length:Number(scene.provenance.parameters?.phaseSamples)+1},(_,index)=><option key={index} value={index}>{index}</option>)}</select></label>
                <label>Open-chain site <select aria-label="Rice–Mele comparison site" value={comparisonSite} onChange={event=>{comparisonGeneration.current++;setComparisonSite(Number(event.target.value));setComparisonSamples(null);setComparisonError("");setVerifyingComparison(false);}}>{Array.from({length:2*Number(scene.provenance.parameters?.chainCells)},(_,index)=><option key={index} value={index}>Site {index+1}</option>)}</select></label>
                <button type="button" disabled={verifyingComparison} onClick={inspectRiceComparison}>Inspect linked saved samples</button></div>
              {comparisonError&&<p role="alert">{comparisonError}</p>}
              {comparisonSamples&&<div data-testid="rice-mele-bulk-chain-selection" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))",gap:10}}>
                <div><h4>Periodic filled band</h4><p>Time {comparisonSamples["comparison-bulk-current"].position[0].toPrecision(8)} {comparisonSamples["comparison-bulk-current"].coordinateUnits[0]}</p><p>Current {comparisonSamples["comparison-bulk-current"].value.toPrecision(10)} {comparisonSamples["comparison-bulk-current"].valueUnit}</p><p>Charge {comparisonSamples["comparison-bulk-charge"].value.toPrecision(10)} {comparisonSamples["comparison-bulk-charge"].valueUnit}</p></div>
                <div><h4>Finite open chain</h4><p>Site {comparisonSite+1} density {comparisonSamples["chain-density"].value.toPrecision(10)} {comparisonSamples["chain-density"].valueUnit}</p><p>Bond current {comparisonSamples["chain-current"].value.toPrecision(10)} {comparisonSamples["chain-current"].valueUnit}</p><p>Central-bond charge {comparisonSamples["chain-charge"].value.toPrecision(10)} {comparisonSamples["chain-charge"].valueUnit}</p><p>Left/right edge populations {comparisonSamples["chain-left-edge"].value.toPrecision(10)} / {comparisonSamples["chain-right-edge"].value.toPrecision(10)} particles</p></div>
              </div>}
              {scene.annotations.filter(note=>note.id==="chain-checks"||note.id==="bulk-chain-link").map(note=><p key={note.id}>{note.text}</p>)}
              <p>Periodic charge is per cell; open-chain charge crosses a central bond. They are distinct evidence, not equal values or a finite-chain invariant. Every selected value is reverified against the source bundle; reopening begins without a selection.</p>
            </section>}
            {scene.provenance.model==="rice_mele_pump"&&scene.provenance.parameters?.chainCells!==undefined&&!riceComparison&&<section data-testid="rice-mele-chain-pump-profile" style={{ padding: 10, marginBottom: 14, border: "1px solid var(--border, #cbd5e1)", borderRadius: 8 }}>
              <h3 style={{margin:0}}>Rice–Mele · verified finite open-chain motion</h3>
              <p>Run <code>{scene.provenance.runId}</code> · result SHA-256 <code style={{overflowWrap:"anywhere"}}>{scene.provenance.resultSha256}</code>.</p>
              <p>Half-filled open chain: {scene.provenance.parameters.chainCells} cells; duration {scene.provenance.parameters.duration} inverse hopping energy; {scene.provenance.parameters.stepsPerPhase} unitary steps per saved phase. No periodic end-to-end bond is present.</p>
              {scene.annotations.map(note=><p key={note.id}>{note.text}</p>)}
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {(["chain-density","chain-current","chain-charge","chain-left-edge","chain-right-edge"] as const).map(id=><button key={id} type="button" aria-label={`Inspect open-chain first sample of ${id}`} disabled={verifyingScalar} onClick={()=>selectScalarSample(id,0)}>{id}: first sample</button>)}
                <button type="button" aria-label="Inspect open-chain density at time 8 site 5" disabled={verifyingScalar} onClick={()=>selectScalarSample("chain-density",8*Number(scene.provenance.parameters?.chainCells)*2+5)}>Density: time 8, site 5</button>
                <button type="button" aria-label="Inspect open-chain current at time 8 bond 5" disabled={verifyingScalar} onClick={()=>selectScalarSample("chain-current",8*(2*Number(scene.provenance.parameters?.chainCells)-1)+5)}>Current: time 8, bond 5</button>
              </div>
              <p>Each selection re-verifies source bytes and reports the exact stored coordinate, value, dataset index and hash. Finite-size charge and edge populations are observations, not a quantized bulk pump invariant. Math3D runs no evolution.</p>
            </section>}
            {scene.provenance.model==="rice_mele_pump"&&scene.provenance.parameters?.duration!==undefined&&scene.provenance.parameters?.chainCells===undefined&&<section data-testid="rice-mele-finite-pump-profile" style={{ padding: 10, marginBottom: 14, border: "1px solid var(--border, #cbd5e1)", borderRadius: 8 }}>
              <h3 style={{margin:0}}>Rice–Mele · verified finite-speed filled-band transport</h3>
              <p>Run <code>{scene.provenance.runId}</code> · result SHA-256 <code style={{overflowWrap:"anywhere"}}>{scene.provenance.resultSha256}</code>.</p>
              <p>Recorded cycle duration {scene.provenance.parameters?.duration} inverse hopping energy; {scene.provenance.parameters?.stepsPerPhase} evolution steps per phase interval. The producer saved time-resolved current, transported charge, excited-band population and exact time–momentum current samples.</p>
              {scene.annotations.map(note=><p key={note.id}>{note.text}</p>)}
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {(["finite-current","finite-charge","finite-excitation","finite-local-current"] as const).map(id=><button key={id} type="button" aria-label={`Inspect finite pump first sample of ${id}`} disabled={verifyingScalar} onClick={()=>selectScalarSample(id,0)}>{id}: first sample</button>)}
                <button type="button" aria-label="Inspect finite pump later current sample" disabled={verifyingScalar} onClick={()=>selectScalarSample("finite-current",8)}>Current: saved time sample 8</button>
              </div>
              <p>The points display supplied arrays only. Select a point for its exact stored coordinates, value, dataset index and source hash. Finite-speed charge is not labelled quantized. The ideal adiabatic Chern is a separate reference; finite-chain edge motion is not supplied. Math3D runs no pump solver.</p>
            </section>}
            {scene.provenance.model==="rice_mele_pump"&&scene.provenance.parameters?.duration===undefined&&<section data-testid="rice-mele-pump-profile" style={{ padding: 10, marginBottom: 14, border: "1px solid var(--border, #cbd5e1)", borderRadius: 8 }}>
              <h3 style={{ margin: 0 }}>Rice–Mele · verified filled-band pump cycle</h3>
              <p>Run <code>{scene.provenance.runId}</code> · result SHA-256 <code style={{overflowWrap:"anywhere"}}>{scene.provenance.resultSha256}</code>.</p>
              <p>Closed cycle: base hopping {scene.provenance.parameters?.baseHopping}, modulation {scene.provenance.parameters?.modulation}, stagger amplitude {scene.provenance.parameters?.staggerAmplitude}, offset {scene.provenance.parameters?.staggerOffset}; {scene.provenance.parameters?.kSamples} momentum and {scene.provenance.parameters?.phaseSamples} phase samples.</p>
              {scene.topology?.invariants.map(item=><p key={item.id}>{item.label}: {item.value??"undefined"} · producer status {item.status} · {item.method}.</p>)}
              {scene.annotations.map(note=><p key={note.id}>{note.text}</p>)}
              <p>The two surfaces are exact stored band samples in (cycle phase, Bloch momentum, energy). Berry plaquette phases and Wilson polarizations are producer-supplied scalars. Select a sample for its source coordinates, value, dataset index and hash.</p>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {(["band-0","band-1","polarization-samples"] as const).map(id=><button key={id} type="button" aria-label={`Inspect pump first sample of ${id}`} disabled={verifyingScalar} onClick={()=>selectScalarSample(id,0)}>{id}: first sample</button>)}
                <button type="button" aria-label="Inspect first pump plaquette phase" disabled={verifyingScalar} onClick={()=>selectScalarSample("berry-plaquettes",0)}>Plaquette phase: first sample</button>
              </div>
              <p>Ideal adiabatic transport of a filled band is the bounded producer claim. Finite-speed current and finite-chain edge motion are not supplied. Math3D performs no pump calculation.</p>
            </section>}
            {scene.provenance.model==="kitaev_chain"&&<section data-testid="kitaev-study-profile" style={{ padding: 10, marginBottom: 14, border: "1px solid var(--border, #cbd5e1)", borderRadius: 8 }}>
              <h3 style={{ margin: 0 }}>Kitaev · producer-supplied {scene.topology?.invariants.some(item=>item.id==="kitaev-pfaffian-parity") ? "bulk invariant diagnostics" : scene.bands ? "periodic BdG bands" : "finite open-chain end density"}</h3>
              <p>Run <code>{scene.provenance.runId}</code> · result SHA-256 <code style={{overflowWrap:"anywhere"}}>{scene.provenance.resultSha256}</code>.</p>
              <p>Inputs: μ={scene.provenance.parameters?.mu}, t={scene.provenance.parameters?.hopping}, real Δ={scene.provenance.parameters?.pairing}; {scene.provenance.parameters?.cells} open sites. {scene.topology?.invariants.some(item=>item.id==="kitaev-pfaffian-parity") ? "The chiral curve and momentum scalar are exact producer samples; select a point to inspect its stored k, BdG xi and pairing coordinates." : scene.bands ? `${scene.bands.coordinates} stores exact momentum samples; ${scene.bands.energies.length} energy paths, ${scene.bands.energyUnit}.` : "Marker positions are site indices; color/size is a display-only mapping of stored nonnegative density."}</p>
              {scene.topology?.invariants.some(item=>item.id==="kitaev-pfaffian-parity") ? <>
                {scene.topology.invariants.map(item=><p key={item.id}>{item.label}: {item.value??"undefined"} · producer status {item.status} · {item.method}.</p>)}
                {scene.annotations.map(item=><p key={item.id}>{item.text}</p>)}
                <p>Bulk gap and mesh validity control these producer claims. Finite end localization is a separate observation; Math3D calculates neither invariant nor a finite-state classification.</p>
              </> : <p>Spinless nearest-neighbor model with real pairing and separate periodic/open boundaries. End localization is a finite-chain observation. This older scene supplies no winding, Z₂ invariant, Majorana classification, or material claim. Math3D only inspects the verified arrays.</p>}
            </section>}
            {qwzRole && <section data-testid="qwz-study-profile" style={{ padding: 10, marginBottom: 14, border: "1px solid var(--border, #cbd5e1)", borderRadius: 8 }}>
              <h3 style={{ margin: 0 }}>QWZ · supplied-result study</h3>
              <p>Current verified view: {qwzRole === "bands" ? "band surfaces" : "Berry curvature"}. Each view retains its own bundle and exact dataset IDs.</p>
              {!qwzPair ? <button type="button" data-testid="qwz-link-views" disabled={qwzBusy || !onOpenRelated}
                onClick={() => void loadQwzPair()}>{qwzBusy ? "Verifying both views…" : "Link matching QWZ views"}</button> : <>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button type="button" data-testid="qwz-view-bands" aria-pressed={qwzRole === "bands"} disabled={qwzBusy}
                    onClick={() => void switchQwzView("bands")}>Bands</button>
                  <button type="button" data-testid="qwz-view-curvature" aria-pressed={qwzRole === "curvature"} disabled={qwzBusy}
                    onClick={() => void switchQwzView("curvature")}>Berry curvature</button>
                </div>
                <p data-testid="qwz-study-source" style={{ overflowWrap: "anywhere" }}>Same supplied run <code>{qwzSummary!.runId}</code> · result SHA-256 <code>{qwzSummary!.resultSha256}</code>. Both bundles passed independent byte and schema checks; producer claims are not authenticated.</p>
                <div>Supplied bands: {qwzSummary!.bandLabels.join(", ")}; worker bulk gap {qwzSummary!.bulkGap} {qwzSummary!.energyUnit}.</div>
                {qwzSummary!.curvature.map(item => <div key={item.dataset}>Supplied {item.label} · dataset <code>{item.dataset}</code> · {item.convention}</div>)}
                {qwzSummary!.invariants.map(item => <div key={item.id}>Producer-supplied {item.label}: {item.value ?? "unavailable"} · producer status: {item.status} · method: {item.method}</div>)}
              </>}
              <p>Band inversion, edge/bulk classification, and nodes: not supplied in these bundles. Math3D does not calculate or infer them.</p>
              {qwzError && <p role="alert">QWZ view link refused: {qwzError}</p>}
              {cursorStatus && <p data-testid="quantum-cursor-status" role="status">{cursorStatus}</p>}
            </section>}
            {sshRole && <section data-testid="ssh-study-profile" style={{ padding: 10, marginBottom: 14, border: "1px solid var(--border, #cbd5e1)", borderRadius: 8 }}>
              <h3 style={{ margin: 0 }}>SSH · supplied-result study</h3>
              <p>Current verified view: {sshRole === "chain" ? "finite chain" : "band path"}. Each view retains its own bundle and exact dataset IDs.</p>
              {!sshPair ? <button type="button" data-testid="ssh-link-views" disabled={sshBusy || !onOpenRelated}
                onClick={() => void loadSshPair()}>{sshBusy ? "Verifying both views…" : "Link matching SSH views"}</button> : <>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button type="button" data-testid="ssh-view-chain" aria-pressed={sshRole === "chain"} disabled={sshBusy}
                    onClick={() => void switchSshView("chain")}>Finite chain</button>
                  <button type="button" data-testid="ssh-view-bands" aria-pressed={sshRole === "bands"} disabled={sshBusy}
                    onClick={() => void switchSshView("bands")}>Band path</button>
                </div>
                <p data-testid="ssh-study-source" style={{ overflowWrap: "anywhere" }}>Same supplied run <code>{sshSummary!.runId}</code> · result SHA-256 <code>{sshSummary!.resultSha256}</code>. Both bundles passed independent byte and schema checks; producer claims are not authenticated.</p>
                <div>Producer-labeled chain: {sshSummary!.chainLabels.join("; ")}.</div>
                <div>Producer-labeled {sshSummary!.densityLabel} · dataset <code>{sshSummary!.densityDataset}</code> · unit {sshSummary!.densityUnit}.</div>
                <div>Supplied bands: {sshSummary!.bandLabels.join(", ")}; worker bulk gap {sshSummary!.bulkGap} {sshSummary!.energyUnit}.</div>
                {sshSummary!.invariants.map(item => <div key={item.id}>Producer-supplied {item.label}: {item.value ?? "unavailable"} · producer status: {item.status} · method: {item.method}</div>)}
              </>}
              <p>Density and winding are shown as supplied. Math3D does not infer edge/bulk classification, band inversion, or node claims.</p>
              {sshError && <p role="alert">SSH view link refused: {sshError}</p>}
            </section>}
            {scene.provenance.model === "qec_repetition_ideal" && <section data-testid="qec-repetition-profile"
              style={{ padding: 10, marginBottom: 14, border: "1px solid var(--border, #cbd5e1)", borderRadius: 8 }}>
              <h3 style={{ margin: 0 }}>Ideal repetition-code record</h3>
              <p>Discrete rounds are on the horizontal axis. Blue shows recorded Z₀Z₁ and Z₁Z₂ parity bits,
                orange shows changes since the preceding round, and teal shows the three data bits.
                Marker height is the exact stored 0 or 1 value; the lanes are display positions.</p>
              <p>{scene.annotations.find(note => note.id === "decoder")?.text}</p>
              <p>Math3D verifies and displays the supplied scene; it does not decode errors or run a worker.
                This is an ideal three-bit example, not a surface-code or fault-tolerance result.</p>
            </section>}
            <h3 style={{ marginTop: 0 }}>Source and coordinates</h3>
            <div><b>{scene.provenance.model==="rice_mele_convergence_study"?"Study:":"Run:"}</b> {scene.provenance.runId}</div>
            <div><b>{scene.provenance.model==="rice_mele_convergence_study"?"Study SHA-256:":"Result SHA-256:"}</b> <code style={{ overflowWrap: "anywhere" }}>{scene.provenance.resultSha256}</code></div>
            <div><b>Bundle:</b> <code data-testid="quantum-source-directory" style={{ overflowWrap: "anywhere" }}>{opened.directory}</code></div>
            <button type="button" data-testid="quantum-reveal-source" disabled={locating} onClick={() => void revealSource()}>
              {locating ? "Re-verifying source…" : "Reveal verified bundle"}
            </button>
            {locateStatus && <p role="status" data-testid="quantum-reveal-status">{locateStatus}</p>}
            {scene.provenance.kind !== "geometry-fixture" && scene.provenance.model!=="hofstadter_flux_sweep" && scene.provenance.model!=="hofstadter_bulk_edge_study" && scene.provenance.model!=="rice_mele_convergence_study" && scene.provenance.model!=="qec_repetition_ideal" && <>
              <button type="button" data-testid="quantum-open-source-run" disabled={openingRun}
                onClick={() => void openSourceRun()}>
                {openingRun ? "Re-verifying source…" : "Open source run in Theory Lab"}
              </button>
              <button type="button" data-testid="quantum-fork-source-run" disabled={openingRun}
                onClick={() => void openSourceRun("fork")}>Fork as new Theory Lab run…</button>
              {runStatus && <p role="status" data-testid="quantum-source-run-status">{runStatus}</p>}
            </>}
            {scene.provenance.model === "qec_repetition_ideal" ?
              <p>Bundle reveal locates this export. Reopen its immutable run from Theory Lab’s Backend page in the originating profile; the generic source-run fork route does not apply to this separate ideal-example record.</p> :
              <p>Bundle reveal locates this export. Opening an original run requires a selected Theory Lab installation or built checkout and a matching hash-verified saved run there. A pinned example may not have that run in your Lab profile; its scene remains available for read-only inspection. Math3D does not call a worker.{scene.provenance.model==="rice_mele_convergence_study"?" Select a convergence point to open its corresponding saved run.":""}</p>}
            <div><b>Engine:</b> {scene.provenance.engine} {scene.provenance.engineVersion}</div>
            {scene.provenance.parameters && <><h3>Stored model inputs</h3><dl data-testid="quantum-scene-parameters" style={{ margin: 0 }}>
              {Object.entries(scene.provenance.parameters).map(([key, value]) => <div key={key} style={{ display: "flex", gap: 8 }}>
                <dt style={{ minWidth: 55 }}>{key}</dt><dd style={{ margin: 0 }}>{String(value)}</dd>
              </div>)}
            </dl></>}
            <div><b>Source axes:</b> {scene.coordinates.axes.join(", ")} ({scene.coordinates.handedness}-handed)</div>
            <div><b>Source coordinate units:</b> {scene.coordinates.units.join(", ")}</div>
            <details data-testid="quantum-validation-dashboard"><summary>Numerical validation dashboard</summary>
              <p>Scene checks report source evidence and limits. Producer-run physical diagnostics require reopening that run.</p>
              {quantumSceneValidation(scene, { fingerprint: opened.reference.sceneFingerprint,
                mappedObjectIds: opened.mappedObjectIds, deferredObjectIds: opened.deferredObjectIds,
                deferredFieldIds: opened.deferredFieldIds }).map((check, index) => <div key={`${check.name}-${index}`}>
                <strong>{check.name}</strong> · {check.status} · {check.detail}</div>)}
            </details>
            {scene.reciprocal && <section data-testid="quantum-reciprocal-inspector">
              <h3>Supplied reciprocal geometry</h3>
              <div>Reciprocal coordinates: {(scene.reciprocal.basis.length===1 ? ["k"] : ["kx", "ky", "kz"].slice(0, scene.reciprocal.basis.length)).join(", ")} · {scene.reciprocal.reciprocalUnit}</div>
              <div>Direct basis: {scene.reciprocal.directBasis.map((a, i) =>
                `a${i + 1}=(${a.map(value => value.toPrecision(5)).join(", ")})`).join("; ")} · {scene.reciprocal.directUnit}</div>
              <div>Reciprocal basis: {scene.reciprocal.basis.map((b, i) =>
                `b${i + 1}=(${b.map(value => value.toPrecision(5)).join(", ")})`).join("; ")} · aᵢ·bⱼ = 2πδᵢⱼ</div>
              <div>Boundaries: {scene.reciprocal.boundaryObjects.join(", ")}; supplied paths: {scene.reciprocal.paths.map(path => path.label).join("; ")}</div>
              <p>These are source-declared primitive-zone guides. No zone construction or k-state calculation runs in Math3D.</p>
              <p>Selected k-state amplitudes: unavailable in this scene. Point and path selection reports stored geometry only.</p>
              {geometrySpace === "reciprocal" && <>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {scene.reciprocal.points.map((point, index) => <button key={point.id} type="button"
                    aria-label={`Select k-point ${point.label} (${point.id})`}
                    aria-pressed={pickedReciprocalPoint?.id === point.id} disabled={verifyingReciprocal}
                    onClick={() => selectReciprocalPrimitive(reciprocalMeshes.find(mesh => mesh.id === scene.reciprocal!.pointObject)
                      ?.primitivesByFace.find(primitive => primitive.kind === "site" && primitive.index === index) ?? null)}>
                    {point.label}</button>)}
                </div>
                {verifyingReciprocal && <p role="status">Verifying source before selection…</p>}
                {reciprocalError && <p role="alert">{reciprocalError}</p>}
                {pickedReciprocalPoint && <div data-testid="quantum-k-selection">
                  <b>Selected supplied k-point:</b> {pickedReciprocalPoint.label} ({pickedReciprocalPoint.id})<br />
                  Source object: {pickedReciprocalPoint.sourceObjectId} · dataset sample: {pickedReciprocalPoint.sourceSampleIndex}<br />
                  {pickedReciprocalPoint.position.slice(0, scene.reciprocal.basis.length).map((value, axis) =>
                    <React.Fragment key={axis}>{scene.reciprocal!.basis.length===1 ? "k" : ["kx", "ky", "kz"][axis]}: {value.toPrecision(6)} {scene.reciprocal!.reciprocalUnit}<br /></React.Fragment>)}
                </div>}
                {pickedReciprocalPath && <div data-testid="quantum-k-path-selection">
                  <b>Selected supplied path segment:</b> {pickedReciprocalPath.fromId} → {pickedReciprocalPath.toId}<br />
                  Source object: {pickedReciprocalPath.objectId} · segment: {pickedReciprocalPath.segmentIndex} · {scene.reciprocal.reciprocalUnit}
                </div>}
              </>}
            </section>}
            {activePrimitiveMeshes.length > 0 && <>
              <h3>Supplied sites and links</h3>
              <p>Click a rendered marker or link. The object ID is portable; the sample index identifies a position within its verified dataset. No chemical species or bond order is inferred.</p>
              <ul data-testid="quantum-primitive-objects" style={{ paddingLeft: 18 }}>
                {activePrimitiveMeshes.map(mesh => <li key={mesh.id}>{mesh.label} · <code>{mesh.id}</code> · {
                  new Set(mesh.primitivesByFace.map(primitive => primitive.sampleId)).size} samples{" "}
                  <button type="button" aria-label={`Inspect first sample of ${mesh.id}`} disabled={verifyingReciprocal} onClick={() => {
                    if (geometrySpace === "reciprocal") selectReciprocalPrimitive(mesh.primitivesByFace[0]);
                    else if (!supercell && scene.bands?.objects.includes(mesh.id)) selectBandSample(mesh.id, 0);
                    else { clearTopologySelection(); setPickedPrimitive(mesh.primitivesByFace[0]); setPickedBandSample(null);
                      if (scene.objects.find(object => object.id === mesh.id)?.scalars)
                        selectScalarSample(mesh.id, mesh.primitivesByFace[0].index); }
                  }}>Inspect first</button>{supercell && <button type="button" aria-label={`Inspect last sample of ${mesh.id}`} onClick={() => {
                    clearTopologySelection();
                    setPickedPrimitive(mesh.primitivesByFace.at(-1) ?? null); setPickedBandSample(null);
                  }}>Inspect last</button>}
                </li>)}
              </ul>
              {pickedPrimitive && <div data-testid="quantum-primitive-selection">
                <b>{pickedPrimitive.kind === "site" ? "Selected site" : "Selected link"}:</b> {pickedPrimitive.objectLabel}<br />
                <b>{supercell ? "Derived view object ID" : "Portable object ID"}:</b> <code>{pickedPrimitive.objectId}</code><br />
                <b>{pickedPrimitive.kind === "site" ? "Dataset sample" : "Source segment"}:</b> {pickedPrimitive.index}<br />
                {(geometrySpace === "reciprocal" ? ["kx", "ky", "kz"] : scene.coordinates.axes).map((axis, index) => <React.Fragment key={axis}>{axis}: {
                  pickedPrimitive.position[["x", "y", "z"][index] as keyof Vector3].toPrecision(6)} {geometrySpace === "reciprocal" ? scene.reciprocal?.reciprocalUnit : scene.coordinates.units[index]}<br /></React.Fragment>)}
                {pickedPrimitive.endpoints && <div>Endpoints: {pickedPrimitive.endpoints.map(endpoint =>
                  `(${endpoint.x.toPrecision(5)}, ${endpoint.y.toPrecision(5)}, ${endpoint.z.toPrecision(5)})`).join(" → ")}</div>}
                {pickedLatticeSample && scene.lattice && <div data-testid="quantum-lattice-site-selection">
                  <b>{supercell ? "Derived lattice site" : "Verified lattice site"}:</b> cell [{pickedLatticeSample.cell.join(", ")}] · basis {pickedLatticeSample.basisIndex}
                  {" "}({scene.lattice.basis[pickedLatticeSample.basisIndex]?.label}) · {supercell ? "derived instance" : "source sample"} {pickedLatticeSample.sampleIndex}.
                  {pickedDerivedInstance && <div>Source object: {pickedDerivedInstance.sourceObjectId ?? "not supplied"} · dataset: {pickedDerivedInstance.sourceDatasetId} · matching source sample: {pickedDerivedInstance.sourceSampleIndex ?? "outside supplied cells"}.</div>}
                </div>}
              </div>}
              {verifyingScalar && <p role="status">Verifying exact scalar sample…</p>}
              {scalarError && <p role="alert">{scalarError}</p>}
              {pickedScalarSample && <div data-testid="quantum-scalar-selection">
                <b>Exact stored scalar sample:</b> {pickedScalarSample.objectLabel}<br />
                Sample ID: <code>{pickedScalarSample.sampleId}</code> · dataset index: {pickedScalarSample.sampleIndex}<br />
                {pickedScalarSample.coordinateAxes.map((axis, index) => <React.Fragment key={axis}>{axis}: {pickedScalarSample.position[index].toPrecision(8)} {pickedScalarSample.coordinateUnits[index]}<br /></React.Fragment>)}
                Value: {pickedScalarSample.value.toPrecision(10)} {pickedScalarSample.valueUnit}<br />
                Stored datasets: <code>{pickedScalarSample.positionDatasetId}</code> / <code>{pickedScalarSample.valueDatasetId}</code><br />
                Source run: <code>{pickedScalarSample.runId}</code> · result SHA-256: <code>{pickedScalarSample.resultSha256}</code>
              </div>}
            </>}
            {scene.lattice && geometrySpace === "source" && <section data-testid="quantum-lattice-inspector">
              <h3>Supplied lattice geometry</h3>
              <div>{scene.lattice.dimensions}D · {scene.lattice.repeats.join(" × ")} cells · {scene.lattice.boundary} boundary</div>
              <div>Basis: {scene.lattice.basis.map((site, index) => `${index} ${site.label} (${site.position.join(", ")})`).join("; ")}</div>
              <div>Translations: {scene.lattice.translations.map((vector, index) =>
                `a${index + 1}=(${vector.map(value => value.toPrecision(5)).join(", ")})`).join("; ")}</div>
              <div>Position units: {scene.coordinates.units.join(", ")}</div>
              <div>Verified site identities: {details.latticeSamples?.length ?? 0}; click a site marker to inspect its cell and basis.</div>
              <h4>Derived supercell preview</h4>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{scene.lattice.repeats.map((_, axis) =>
                <label key={axis}>{scene.coordinates.axes[axis]} cells <input aria-label={`Supercell repeat ${axis}`} type="number" min={1} max={axis === 2 && scene.lattice!.dimensions === 2 ? 1 : 8}
                  value={repeatDraft[axis]} disabled={verifyingSupercell} onChange={event => setRepeatDraft(previous => previous.map((value, index) =>
                    index === axis ? Number(event.target.value) : value) as [number, number, number])} style={{ width: 45 }} /></label>)}</div>
              <button type="button" data-testid="quantum-preview-supercell" disabled={verifyingSupercell} onClick={() => {
                const current = ++supercellGeneration.current;
                setVerifyingSupercell(true); setSupercell(null); setSupercellError("");
                void window.quantumScenes!.verifyActive(opened.reference.sceneFingerprint).then(() => {
                  if (current !== supercellGeneration.current) return;
                  const sourceObjectId = [...latticeSiteObjects][0] ?? null;
                  setSupercell(buildQuantumLatticeSupercell(scene.lattice!, repeatDraft, details.latticeSamples ?? [], sourceObjectId));
                  clearTopologySelection();
                  setPickedPrimitive(null); setPickedBandSample(null); setView("geometry");
                }).catch(error => {
                  if (current === supercellGeneration.current) setSupercellError(String((error as Error)?.message ?? error));
                }).finally(() => { if (current === supercellGeneration.current) setVerifyingSupercell(false); });
              }}>{verifyingSupercell ? "Verifying source…" : "Preview expanded cells"}</button>
              {supercell && <button type="button" data-testid="quantum-source-lattice" onClick={() => {
                supercellGeneration.current++; setVerifyingSupercell(false);
                clearTopologySelection();
                setSupercell(null); setPickedPrimitive(null); setSupercellError("");
              }}>Return to supplied geometry</button>}
              {supercellError && <p role="alert">{supercellError}</p>}
              {supercell && <p data-testid="quantum-supercell-status">Derived {supercell.instances.length} basis-mapped sites and {supercell.edgeCount} primitive-cell guides for {supercell.repeats.join(" × ")} cells. Supplied bonds were not expanded; periodic-wrap bonds: unavailable (open source boundary).</p>}
              <p>Amber guides show supplied primitive translations. Supplied segments remain geometric guides; no atom species, bond order, or hopping is inferred. Periodic-wrap bonds are unavailable because this scene declares open boundaries.</p>
            </section>}
            {(scene.topology || Boolean(details.topologyDisplay?.vectors.length)) && <section data-testid="quantum-topology-inspector">
              <h3>Supplied topology and vector data</h3>
              <p>Read-only source values. Color and arrow size are display encodings, not new physics or saved measurements.</p>
              {details.topologyDisplay?.scalars.map(display => {
                const quantity = scene.topology?.quantities.find(item => item.id === display.quantityId);
                return <div key={display.quantityId} data-testid={`quantum-scalar-${display.quantityId}`}>
                  <b>{quantity?.label ?? display.quantityId}</b> · supplied {quantity?.kind ?? "scalar"}<br />
                  Source object: <code>{display.objectId}</code> · dataset: <code>{quantity?.dataset}</code><br />
                  Range: {display.minimum.toPrecision(6)} to {display.maximum.toPrecision(6)} {display.unit}<br />
                  <div data-testid="quantum-curvature-legend" style={{ display: "flex", gap: 2, marginTop: 4 }}>
                    {CURVATURE_COLORS.map((color, bin) => <span key={bin} title={`${bin - 3}: display bin`}
                      style={{ background: `#${color.toString(16).padStart(6, "0")}`, width: 24, height: 12, display: "inline-block" }} />)}
                  </div>
                  <small>Blue: negative · grey: near zero · red: positive. Each rendered triangle uses the mean of its three stored vertex values; picking reports one exact vertex.</small><br />
                  <small>Convention: {quantity?.convention ?? "not supplied"}</small><br />
                  <button type="button" aria-label={`Inspect first topology sample ${display.quantityId}`}
                    disabled={verifyingTopology} onClick={() => selectTopologySample(display.quantityId, 0)}>Inspect first</button>
                </div>;
              })}
              {Boolean(details.topologyDisplay?.vectors.length) && <>
                <label>Maximum vector glyphs per object <select aria-label="Vector glyph density" value={glyphDensity}
                  onChange={event => setGlyphDensity(Number(event.target.value) as 16 | 64 | 128)}>
                  <option value={16}>16</option><option value={64}>64</option><option value={128}>128</option>
                </select></label>
                <p>Arrows preserve supplied direction, with uniform display-only length. Magnitudes are available only as exact stored components in the inspector. Deterministic endpoint-preserving sampling never interpolates vectors.</p>
                {details.topologyDisplay?.vectors.map(display => {
                  const object = scene.objects.find(item => item.id === display.objectId);
                  const quantity = scene.topology?.quantities.find(item => item.object === display.objectId);
                  const visible = vectorMeshes.find(mesh => mesh.id === display.objectId);
                  const visibleCount = visible ? new Set(visible.primitivesByFace.map(primitive => primitive.sampleId)).size : 0;
                  return <div key={display.objectId} data-testid={`quantum-vector-${display.objectId}`}>
                    <b>{quantity?.label ?? object?.label ?? display.objectId}</b> · {quantity?.kind ?? "supplied vector"}<br />
                    Source object: <code>{display.objectId}</code> · values: <code>{object?.values}</code><br />
                    {visibleCount} of {display.count} source samples shown; {display.zeroCount} zero-valued vectors have no oriented glyph.<br />
                    Position unit: {display.positionUnit}; vector component unit: {display.vectorUnit}.<br />
                    {quantity?.convention && <small>Convention: {quantity.convention}<br /></small>}
                    <button type="button" aria-label={`Inspect first vector sample ${display.objectId}`}
                      disabled={verifyingTopology} onClick={() => selectVectorSample(display.objectId, 0)}>Inspect first</button>
                  </div>;
                })}
              </>}
              {verifyingTopology && <p role="status">Re-verifying exact source sample…</p>}
              {topologyError && <p role="alert">{topologyError}</p>}
              {pickedTopologySample && <div data-testid="quantum-topology-selection">
                <b>Exact supplied scalar:</b> {pickedTopologySample.quantityLabel} ({pickedTopologySample.kind})<br />
                Sample ID: <code>{pickedTopologySample.sampleId}</code> · dataset index: {pickedTopologySample.sampleIndex}<br />
                {pickedTopologySample.coordinateAxes.map((axis, index) => <React.Fragment key={index}>
                  {axis}: {pickedTopologySample.position[index].toPrecision(8)} {pickedTopologySample.coordinateUnits[index]}<br />
                </React.Fragment>)}
                Value: {pickedTopologySample.value.toPrecision(10)} {pickedTopologySample.valueUnit}<br />
                Source datasets: <code>{pickedTopologySample.positionDatasetId}</code> / <code>{pickedTopologySample.valueDatasetId}</code><br />
                Convention: {pickedTopologySample.convention}<br />
                Run: <code>{pickedTopologySample.runId}</code> · result SHA-256: <code>{pickedTopologySample.resultSha256}</code>
              </div>}
              {pickedVectorSample && <div data-testid="quantum-vector-selection">
                <b>Exact supplied vector:</b> {pickedVectorSample.objectLabel}<br />
                Sample ID: <code>{pickedVectorSample.sampleId}</code> · dataset index: {pickedVectorSample.sampleIndex}<br />
                Position: ({pickedVectorSample.position.map(value => value.toPrecision(8)).join(", ")}) {pickedVectorSample.positionUnit}<br />
                Components ({scene.coordinates.axes.join(", ")}): ({pickedVectorSample.value.map(value => value.toPrecision(10)).join(", ")}) {pickedVectorSample.valueUnit}<br />
                Source datasets: <code>{pickedVectorSample.positionDatasetId}</code> / <code>{pickedVectorSample.valueDatasetId}</code><br />
                Convention: {pickedVectorSample.convention ?? "not supplied"}<br />
                Run: <code>{pickedVectorSample.runId}</code> · result SHA-256: <code>{pickedVectorSample.resultSha256}</code>
              </div>}
              {scene.topology?.invariants.map(invariant => <div key={invariant.id}>
                <b>{invariant.label}:</b> {invariant.value ?? "unavailable"} · {invariant.status} · {invariant.method}
              </div>)}
              {scene.topology?.limitations.map((limitation, index) => <p key={index}>{limitation}</p>)}
              <p>Per-sample singular/undefined masks are not part of this scene contract; all stored numeric samples were validated as finite. No Berry connection, curvature, or topological invariant is computed here.</p>
            </section>}
            {scene.bands && <>
              <h3>Bands</h3>
              <div data-testid="quantum-band-legend">{scene.bands.objects.map((id, index) => {
                const object = scene.objects.find((candidate) => candidate.id === id);
                return <div key={id} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3,
                    background: object?.style.color ?? "#64748b", display: "inline-block" }} />
                  {scene.bands!.labels[index] ?? object?.label ?? id}
                  {opened.mappedObjectIds.includes(id) && <button type="button"
                    aria-label={`Inspect first band sample ${id}`} disabled={verifyingBand}
                    onClick={() => selectBandSample(id, 0)}>Inspect first</button>}
                </div>;
              })}</div>
              <div><b>Supplied bulk gap:</b> {scene.bands.bulkGap} {scene.bands.energyUnit}</div>
              {details.bandLodStride && details.bandLodStride > 1 && <p data-testid="quantum-band-lod">
                Display-only {details.bandLodStride}× grid LOD; original verified sample IDs and binary datasets are unchanged.
              </p>}
              {verifyingBand && <p role="status">Verifying exact band sample…</p>}
              {bandSelectionError && <p role="alert">{bandSelectionError}</p>}
              {pickedBandSample ? <div data-testid="quantum-band-selection" style={{ marginTop: 8 }}>
                <b>Selected supplied {scene.bands.kind === "path" ? "line" : "surface"} sample:</b> {pickedBandSample.bandLabel}<br />
                Band ID: <code>{pickedBandSample.bandId}</code> · band index: {pickedBandSample.bandIndex}<br />
                Sample ID: <code>{pickedBandSample.sampleId}</code> · dataset index: {pickedBandSample.sampleIndex}<br />
                {scene.bands.kind === "path" ? "k" : "kx"}: {pickedBandSample.k[0].toPrecision(8)} {pickedBandSample.kUnit}<br />
                {scene.bands.kind === "surface" && <>ky: {pickedBandSample.k[1].toPrecision(8)} {pickedBandSample.kUnit}<br /></>}
                Energy: {pickedBandSample.energy.toPrecision(8)} {pickedBandSample.energyUnit}<br />
                Bulk gap: {pickedBandSample.bulkGap} {pickedBandSample.energyUnit}<br />
                Stored datasets: <code>{pickedBandSample.coordinateDatasetId}</code> / <code>{pickedBandSample.energyDatasetId}</code><br />
                Source run: <code>{pickedBandSample.runId}</code> · result SHA-256: <code>{pickedBandSample.resultSha256}</code><br />
                Scene fingerprint: <code>{pickedBandSample.fingerprint}</code>
              </div> : <p>Click a band {scene.bands.kind === "path" ? "line" : "surface"} to inspect its nearest verified dataset sample.</p>}
              <p>Crossing markers: unavailable unless supplied by the scene. Eigenstates and global band identity are not inferred.</p>
            </>}
            <h3>Datasets</h3>
            <ul style={{ paddingLeft: 18 }}>{scene.datasets.map((dataset) => <li key={dataset.id}>
              {dataset.id}: {dataset.count} × {dataset.components}, {dataset.unit}
            </li>)}</ul>
            <div><b>Rendered objects:</b> {opened.mappedObjectIds.length}</div>
            <div><b>Deferred objects:</b> {opened.deferredObjectIds.length}</div>
            <div><b>Editable Project field documents deferred:</b> {opened.deferredFieldIds.length}</div>
            {scene.fields?.length ? <p>Field slices, bounded density surfaces, and the source-backed Volume view are read-only derivatives of verified grids. Editable Project Volume admission remains deferred.</p> : null}
            {scene.annotations?.length ? <><h3>Source annotations</h3>{scene.annotations.map(annotation =>
              <p key={annotation.id}>{annotation.text}</p>)}</> : null}
            {(opened.deferredObjectIds.length > 0 || opened.deferredFieldIds.length > 0) &&
              <p>Deferred data remains verified in the source bundle; this preview does not render it yet.</p>}
            <p>Full saved-run scene. Local Lab time or site selection was not transferred.</p>
            <p>{opened.remembered ? "Reopen it later from File → Reopen recent quantum scene; the bundle will be verified again." :
              "The recent-scene shortcut could not be saved. Open the bundle again to view it later."}</p>
            <p>This is a read-only preview. Closing it does not save a Math3D project.</p>
          </aside>
        </div>
      </div>
    </div>, window.document.body
  );
}
