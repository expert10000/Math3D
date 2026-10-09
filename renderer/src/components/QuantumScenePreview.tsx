import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { GeometryScene } from "../geometry/types";
import { GeometryViewer } from "./GeometryViewer";
import { QuantumFieldSlice, type QuantumField } from "./QuantumFieldSlice";
import { QuantumFieldSurface } from "./QuantumFieldSurface";
import { QuantumFieldVolume } from "./QuantumFieldVolume";
import { buildQuantumPrimitiveMeshes, type QuantumPrimitive } from "./quantumPrimitiveMeshes";
import { buildQuantumLatticeSupercell, SUPERCELL_SITE_OBJECT_ID,
  type LatticeGeometryDefinition, type LatticeSampleIdentity, type LatticeSupercell } from "./quantumLatticeOverlay";

type Vector3 = { x: number; y: number; z: number };
type SceneSource = {
  provenance: { runId: string; model: string; resultSha256: string; engine: string; engineVersion: string;
    kind?: "geometry-fixture" | "numerical-result"; parameters?: Record<string, number | string> };
  coordinates: { axes: [string, string, string]; units: [string, string, string]; handedness: string };
  datasets: { id: string; count: number; components: number; unit: string }[];
  objects: { id: string; label: string; kind: string; positions: string; indices?: string; style: { color: string; opacity: number; size: number } }[];
  lattice?: LatticeGeometryDefinition;
  fields?: QuantumField[];
  annotations: { id: string; text: string; position: [number, number, number] }[];
  bands?: { objects: string[]; labels: string[]; energyUnit: string; bulkGap: number };
};
export type QuantumSceneWorkspaceReference = { directory: string; sceneFingerprint: string };
export type QuantumSceneOpenResponse =
  | { ok: true; canceled: false; directory: string; reference: QuantumSceneWorkspaceReference; document: {
      title: string; geometry: GeometryScene;
      cameras: { position: Vector3; target: Vector3; up: Vector3 }[];
      extensions: Record<string, unknown>;
    }; remembered: boolean; mappedObjectIds: string[]; deferredObjectIds: string[]; deferredFieldIds: string[] }
  | { ok: false; canceled: true }
  | { ok: false; canceled: false; error: string };

type OpenedScene = Extract<QuantumSceneOpenResponse, { ok: true }>;
type SceneTriangle = NonNullable<GeometryScene["triangles"]>[number];
type PickedBandSample = { objectId: string; label: string; sampleId: string; point: Vector3 };

export function QuantumScenePreview({ opened, onClose }: { opened: OpenedScene; onClose: () => void }) {
  const document = opened.document;
  const details = document.extensions["quantum-scene/v1"] as { scene: SceneSource; selectionTransferred: false; latticeSamples?: LatticeSampleIdentity[] };
  const scene = details.scene;
  const count = (document.geometry.points?.length ?? 0) + (document.geometry.segments?.length ?? 0) +
    (document.geometry.triangles?.length ?? 0);
  const [view, setView] = useState<"geometry" | "slice" | "surface" | "volume">(scene.fields?.length && count === 0 ? "slice" : "geometry");
  useEffect(() => { setView(scene.fields?.length && count === 0 ? "slice" : "geometry"); }, [opened.reference.sceneFingerprint]);
  const [locateStatus, setLocateStatus] = useState("");
  const [locating, setLocating] = useState(false);
  const [openingRun, setOpeningRun] = useState(false);
  const [runStatus, setRunStatus] = useState("");
  const locateGeneration = useRef(0);
  const runGeneration = useRef(0);
  useEffect(() => {
    locateGeneration.current += 1; setLocateStatus(""); setLocating(false);
    runGeneration.current += 1;
    setOpeningRun(false); setRunStatus("");
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
  const openSourceRun = async () => {
    const current = ++runGeneration.current;
    setOpeningRun(true); setRunStatus("");
    try {
      const result = await window.quantumScenes!.openSourceRun(opened.reference.sceneFingerprint);
      if (runGeneration.current === current) setRunStatus(result.ok
        ? `Theory Lab launch requested for ${result.runId}; Lab will verify the exact saved result before opening it.`
        : result.canceled ? "Theory Lab selection canceled." : `Source run unavailable: ${result.error}`);
    } catch (error) {
      if (runGeneration.current === current) setRunStatus(`Source run unavailable: ${String((error as Error)?.message ?? error)}`);
    } finally { if (runGeneration.current === current) setOpeningRun(false); }
  };
  const camera = document.cameras[0];
  const [pickedBandSample, setPickedBandSample] = useState<PickedBandSample | null>(null);
  const [pickedPrimitive, setPickedPrimitive] = useState<QuantumPrimitive | null>(null);
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
  const latticeSiteObjects = useMemo(() => new Set(scene.objects.filter(object => object.positions === scene.lattice?.sites).map(object => object.id)),
    [scene.objects, scene.lattice?.sites]);
  const pickedDerivedInstance = pickedPrimitive?.kind === "site" && supercell &&
    pickedPrimitive.objectId === SUPERCELL_SITE_OBJECT_ID ? supercell.instances[pickedPrimitive.index] : undefined;
  const pickedLatticeSample = pickedPrimitive?.kind === "site" ?
    (pickedDerivedInstance ?? (latticeSiteObjects.has(pickedPrimitive.objectId) ?
      details.latticeSamples?.[pickedPrimitive.index] : undefined)) : undefined;
  useEffect(() => { setPickedBandSample(null); setPickedPrimitive(null); }, [opened.reference.sceneFingerprint]);
  const primitiveMeshes = useMemo(() => buildQuantumPrimitiveMeshes(document.geometry, scene.objects, opened.mappedObjectIds),
    [document.geometry, scene.objects, opened.mappedObjectIds]);
  const supercellMeshes = useMemo(() => supercell ? buildQuantumPrimitiveMeshes(supercell.geometry,
    [supercell.siteObject], [SUPERCELL_SITE_OBJECT_ID]) : [], [supercell]);
  const activePrimitiveMeshes = supercell ? supercellMeshes : primitiveMeshes;
  const meshObjects = useMemo(() => {
    const mapped = new Set(opened.mappedObjectIds);
    const triangles = document.geometry.triangles ?? [];
    let offset = 0;
    return scene.objects.filter((object) => object.kind === "mesh" && mapped.has(object.id)).map((object) => {
      const count = scene.datasets.find((dataset) => dataset.id === object.indices)?.count ?? 0;
      const faces = triangles.slice(offset, offset + count);
      offset += count;
      const positions = new Float32Array(faces.length * 9);
      faces.forEach((face, faceIndex) => {
        [face.a, face.b, face.c].forEach((vertex, vertexIndex) => {
          const base = faceIndex * 9 + vertexIndex * 3;
          positions[base] = vertex.x;
          positions[base + 1] = vertex.y;
          positions[base + 2] = vertex.z;
        });
      });
      return { id: object.id, label: object.label, positions, indices: null, faces,
        source: { kind: "polyhedronPreset" as const, label: object.label },
        color: Number.parseInt(object.style.color.slice(1), 16), opacity: object.style.opacity };
    });
  }, [document.geometry.triangles, opened.mappedObjectIds, scene.datasets, scene.objects]);
  const viewerScene = useMemo(() => {
    if (supercell) return { ...supercell.geometry, points: [] };
    const primitiveIds = new Set(primitiveMeshes.map(mesh => mesh.id));
    const translations = scene.lattice?.translations.map((vector, axis) => ({
      a: { x: 0, y: 0, z: 0, id: `lattice:translation:${axis}:origin` },
      b: { x: vector[0], y: vector[1], z: vector[2], id: `lattice:translation:${axis}:tip` },
      color: 0xf2b36f, opacity: 1,
    })) ?? [];
    return { ...document.geometry,
      triangles: meshObjects.length ? [] : document.geometry.triangles,
      points: document.geometry.points?.filter(point => !primitiveMeshes.length ||
        ![...primitiveIds].some(id => point.id?.startsWith(`${id}:site:`))),
      segments: [...(document.geometry.segments?.filter(segment => !primitiveMeshes.length ||
        ![...primitiveIds].some(id => segment.a.id?.startsWith(`${id}:link:`))) ?? []), ...translations] };
  }, [document.geometry, meshObjects, primitiveMeshes, scene.lattice, supercell]);
  const visibleLabels = useMemo(() => {
    const supplied = (supercell ? [] : scene.annotations).filter(annotation => annotation.text.length <= 64).map(annotation => ({
      text: annotation.text, position: { x: annotation.position[0], y: annotation.position[1], z: annotation.position[2] },
    }));
    if (pickedPrimitive) supplied.push({ text: `${pickedPrimitive.objectLabel} · ${pickedPrimitive.index}`,
      position: pickedPrimitive.position });
    return supplied.length ? [{ labels: supplied, color: 0xe2e8f0, backgroundColor: 0x172033 }] : [];
  }, [scene.annotations, pickedPrimitive, supercell]);
  const pickScene = (info: { meshKey?: string; faceIndex?: number; point: Vector3 }) => {
    const primitive = activePrimitiveMeshes.find(entry => entry.id === info.meshKey)?.primitivesByFace[info.faceIndex ?? -1];
    if (primitive) { setPickedPrimitive(primitive); setPickedBandSample(null); return; }
    setPickedPrimitive(null);
    const mesh = supercell ? undefined : meshObjects.find((entry) => entry.id === info.meshKey);
    const face: SceneTriangle | undefined = mesh?.faces[info.faceIndex ?? -1];
    if (!mesh || !face) { setPickedBandSample(null); return; }
    const nearest = [face.a, face.b, face.c].reduce((best, candidate) =>
      Math.hypot(candidate.x - info.point.x, candidate.y - info.point.y, candidate.z - info.point.z) <
      Math.hypot(best.x - info.point.x, best.y - info.point.y, best.z - info.point.z) ? candidate : best);
    setPickedBandSample({ objectId: mesh.id, label: mesh.label, sampleId: nearest.id ?? "unknown", point: nearest });
  };
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Verified quantum scene" data-testid="quantum-scene-preview"
      style={{ position: "fixed", inset: 0, zIndex: 2900, background: "rgba(15,23,42,.64)", display: "grid", placeItems: "center", padding: 20 }}>
      <div style={{ width: "min(1200px, 96vw)", height: "min(790px, 94vh)", minHeight: 360, background: "var(--panel-strong, #fff)",
        color: "var(--text, #172033)", borderRadius: 12, display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", overflow: "hidden" }}>
        <header style={{ padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, borderBottom: "1px solid var(--border, #cbd5e1)" }}>
          <div><strong>{document.title}</strong><div style={{ fontSize: 12 }}>Verified quantum-scene/v1 · {scene.provenance.model} · Save a workspace or attach it to a Project to retain this source</div></div>
          <button type="button" onClick={onClose} data-testid="quantum-scene-close">Close</button>
        </header>
        <div style={{ minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(260px, 320px)" }}>
          <div style={{ minHeight: 0, position: "relative", display: "flex", flexDirection: "column" }} data-testid="quantum-scene-geometry">
            {Boolean(scene.fields?.length) && <div style={{ padding: 8, display: "flex", gap: 8 }}>
              {count > 0 && <button type="button" onClick={() => setView("geometry")} aria-pressed={view === "geometry"}>Geometry</button>}
              <button type="button" onClick={() => setView("slice")} aria-pressed={view === "slice"}>Field slice</button>
              <button type="button" onClick={() => setView("volume")} aria-pressed={view === "volume"}>Volume</button>
              {scene.fields?.some(field => field.kind === "complex-field") &&
                <button type="button" onClick={() => setView("surface")} aria-pressed={view === "surface"}>Density surface</button>}
            </div>}
            <div style={{ minHeight: 0, flex: 1, position: "relative" }}>
            {view === "volume" && scene.fields?.length ? <QuantumFieldVolume fingerprint={opened.reference.sceneFingerprint} fields={scene.fields} /> :
              view === "slice" && scene.fields?.length ? <QuantumFieldSlice fingerprint={opened.reference.sceneFingerprint}
              fields={scene.fields} axes={scene.coordinates.axes} units={scene.coordinates.units} /> :
              view === "surface" && scene.fields?.length ? <QuantumFieldSurface fingerprint={opened.reference.sceneFingerprint}
                resultSha256={scene.provenance.resultSha256} fields={scene.fields} camera={camera} /> :
              count > 0 || scene.lattice || supercell ? <GeometryViewer scene={viewerScene} meshOverrides={supercell ? supercellMeshes : [...meshObjects, ...primitiveMeshes]}
              overlayLabelSets={visibleLabels} showPlanes={false}
              pickEnabled={(supercell ? supercellMeshes.length : meshObjects.length + primitiveMeshes.length) > 0} onPick={pickScene}
              onPickMiss={() => { setPickedBandSample(null); setPickedPrimitive(null); }}
              inspectSelectionMeshKey={pickedPrimitive?.objectId ?? pickedBandSample?.objectId}
              cameraOverride={!supercell && camera ? { position: camera.position, target: camera.target, up: camera.up } : null} />
              : <p style={{ padding: 20 }}>This scene has no mapped geometry. Its field datasets are listed in the inspector.</p>}
            </div>
          </div>
          <aside style={{ padding: 16, overflow: "auto", borderLeft: "1px solid var(--border, #cbd5e1)", fontSize: 12, lineHeight: 1.5 }}>
            <h3 style={{ marginTop: 0 }}>Source and coordinates</h3>
            <div><b>Run:</b> {scene.provenance.runId}</div>
            <div><b>Result SHA-256:</b> <code style={{ overflowWrap: "anywhere" }}>{scene.provenance.resultSha256}</code></div>
            <div><b>Bundle:</b> <code data-testid="quantum-source-directory" style={{ overflowWrap: "anywhere" }}>{opened.directory}</code></div>
            <button type="button" data-testid="quantum-reveal-source" disabled={locating} onClick={() => void revealSource()}>
              {locating ? "Re-verifying source…" : "Reveal verified bundle"}
            </button>
            {locateStatus && <p role="status" data-testid="quantum-reveal-status">{locateStatus}</p>}
            {scene.provenance.kind !== "geometry-fixture" && <>
              <button type="button" data-testid="quantum-open-source-run" disabled={openingRun}
                onClick={() => void openSourceRun()}>
                {openingRun ? "Re-verifying source…" : "Open source run in Theory Lab"}
              </button>
              {runStatus && <p role="status" data-testid="quantum-source-run-status">{runStatus}</p>}
            </>}
            <p>Bundle reveal locates this export. Opening the original run requires a local Theory Lab checkout and a matching hash-verified saved run there; it does not call a worker from Math3D.</p>
            <div><b>Engine:</b> {scene.provenance.engine} {scene.provenance.engineVersion}</div>
            {scene.provenance.parameters && <><h3>Stored model inputs</h3><dl data-testid="quantum-scene-parameters" style={{ margin: 0 }}>
              {Object.entries(scene.provenance.parameters).map(([key, value]) => <div key={key} style={{ display: "flex", gap: 8 }}>
                <dt style={{ minWidth: 55 }}>{key}</dt><dd style={{ margin: 0 }}>{String(value)}</dd>
              </div>)}
            </dl></>}
            <div><b>Axes:</b> {scene.coordinates.axes.join(", ")} ({scene.coordinates.handedness}-handed)</div>
            <div><b>Coordinate units:</b> {scene.coordinates.units.join(", ")}</div>
            {activePrimitiveMeshes.length > 0 && <>
              <h3>Supplied sites and links</h3>
              <p>Click a rendered marker or link. The object ID is portable; the sample index identifies a position within its verified dataset. No chemical species or bond order is inferred.</p>
              <ul data-testid="quantum-primitive-objects" style={{ paddingLeft: 18 }}>
                {activePrimitiveMeshes.map(mesh => <li key={mesh.id}>{mesh.label} · <code>{mesh.id}</code> · {
                  new Set(mesh.primitivesByFace.map(primitive => primitive.sampleId)).size} samples{" "}
                  <button type="button" aria-label={`Inspect first sample of ${mesh.id}`} onClick={() => {
                    setPickedPrimitive(mesh.primitivesByFace[0]); setPickedBandSample(null);
                  }}>Inspect first</button>{supercell && <button type="button" aria-label={`Inspect last sample of ${mesh.id}`} onClick={() => {
                    setPickedPrimitive(mesh.primitivesByFace.at(-1) ?? null); setPickedBandSample(null);
                  }}>Inspect last</button>}
                </li>)}
              </ul>
              {pickedPrimitive && <div data-testid="quantum-primitive-selection">
                <b>{pickedPrimitive.kind === "site" ? "Selected site" : "Selected link"}:</b> {pickedPrimitive.objectLabel}<br />
                <b>{supercell ? "Derived view object ID" : "Portable object ID"}:</b> <code>{pickedPrimitive.objectId}</code><br />
                <b>Dataset sample:</b> {pickedPrimitive.index}<br />
                {scene.coordinates.axes.map((axis, index) => <React.Fragment key={axis}>{axis}: {
                  pickedPrimitive.position[["x", "y", "z"][index] as keyof Vector3].toPrecision(6)} {scene.coordinates.units[index]}<br /></React.Fragment>)}
                {pickedPrimitive.endpoints && <div>Endpoints: {pickedPrimitive.endpoints.map(endpoint =>
                  `(${endpoint.x.toPrecision(5)}, ${endpoint.y.toPrecision(5)}, ${endpoint.z.toPrecision(5)})`).join(" → ")}</div>}
                {pickedLatticeSample && scene.lattice && <div data-testid="quantum-lattice-site-selection">
                  <b>{supercell ? "Derived lattice site" : "Verified lattice site"}:</b> cell [{pickedLatticeSample.cell.join(", ")}] · basis {pickedLatticeSample.basisIndex}
                  {" "}({scene.lattice.basis[pickedLatticeSample.basisIndex]?.label}) · {supercell ? "derived instance" : "source sample"} {pickedLatticeSample.sampleIndex}.
                  {pickedDerivedInstance && <div>Source object: {pickedDerivedInstance.sourceObjectId ?? "not supplied"} · dataset: {pickedDerivedInstance.sourceDatasetId} · matching source sample: {pickedDerivedInstance.sourceSampleIndex ?? "outside supplied cells"}.</div>}
                </div>}
              </div>}
            </>}
            {scene.lattice && <section data-testid="quantum-lattice-inspector">
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
                  setPickedPrimitive(null); setPickedBandSample(null); setView("geometry");
                }).catch(error => {
                  if (current === supercellGeneration.current) setSupercellError(String((error as Error)?.message ?? error));
                }).finally(() => { if (current === supercellGeneration.current) setVerifyingSupercell(false); });
              }}>{verifyingSupercell ? "Verifying source…" : "Preview expanded cells"}</button>
              {supercell && <button type="button" data-testid="quantum-source-lattice" onClick={() => {
                supercellGeneration.current++; setVerifyingSupercell(false);
                setSupercell(null); setPickedPrimitive(null); setSupercellError("");
              }}>Return to supplied geometry</button>}
              {supercellError && <p role="alert">{supercellError}</p>}
              {supercell && <p data-testid="quantum-supercell-status">Derived {supercell.instances.length} basis-mapped sites and {supercell.edgeCount} primitive-cell guides for {supercell.repeats.join(" × ")} cells. Supplied bonds were not expanded; periodic-wrap bonds: unavailable (open source boundary).</p>}
              <p>Amber guides show supplied primitive translations. Supplied segments remain geometric guides; no atom species, bond order, or hopping is inferred. Periodic-wrap bonds are unavailable because this scene declares open boundaries.</p>
            </section>}
            {scene.bands && <>
              <h3>Bands</h3>
              <div data-testid="quantum-band-legend">{scene.bands.objects.map((id, index) => {
                const object = scene.objects.find((candidate) => candidate.id === id);
                return <div key={id} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3,
                    background: object?.style.color ?? "#64748b", display: "inline-block" }} />
                  {scene.bands!.labels[index] ?? object?.label ?? id}
                </div>;
              })}</div>
              <div><b>Supplied bulk gap:</b> {scene.bands.bulkGap} {scene.bands.energyUnit}</div>
              {pickedBandSample ? <div data-testid="quantum-band-selection" style={{ marginTop: 8 }}>
                <b>Nearest supplied surface sample:</b> {pickedBandSample.label} ({pickedBandSample.sampleId})<br />
                {scene.coordinates.axes.map((axis, index) => <React.Fragment key={axis}>
                  {axis}: {pickedBandSample.point[["x", "y", "z"][index] as keyof Vector3].toPrecision(6)} {scene.coordinates.units[index]}<br />
                </React.Fragment>)}
              </div> : <p>Click a band surface to inspect its nearest supplied sample.</p>}
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
