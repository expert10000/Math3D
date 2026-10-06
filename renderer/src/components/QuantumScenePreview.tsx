import React, { useEffect, useMemo, useState } from "react";
import type { GeometryScene } from "../geometry/types";
import { GeometryViewer } from "./GeometryViewer";
import { QuantumFieldSlice, type QuantumField } from "./QuantumFieldSlice";

type Vector3 = { x: number; y: number; z: number };
type SceneSource = {
  provenance: { runId: string; model: string; resultSha256: string; engine: string; engineVersion: string;
    parameters?: Record<string, number | string> };
  coordinates: { axes: [string, string, string]; units: [string, string, string]; handedness: string };
  datasets: { id: string; count: number; components: number; unit: string }[];
  objects: { id: string; label: string; kind: string; indices?: string; style: { color: string; opacity: number } }[];
  fields?: QuantumField[];
  annotations: { id: string; text: string }[];
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
  const details = document.extensions["quantum-scene/v1"] as { scene: SceneSource; selectionTransferred: false };
  const scene = details.scene;
  const count = (document.geometry.points?.length ?? 0) + (document.geometry.segments?.length ?? 0) +
    (document.geometry.triangles?.length ?? 0);
  const [showField, setShowField] = useState(Boolean(scene.fields?.length && count === 0));
  useEffect(() => { setShowField(Boolean(scene.fields?.length && count === 0)); }, [opened.reference.sceneFingerprint]);
  const camera = document.cameras[0];
  const [pickedBandSample, setPickedBandSample] = useState<PickedBandSample | null>(null);
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
  const viewerScene = useMemo(() => meshObjects.length ? { ...document.geometry, triangles: [] } : document.geometry,
    [document.geometry, meshObjects]);
  const pickBand = (info: { meshKey?: string; faceIndex?: number; point: Vector3 }) => {
    const mesh = meshObjects.find((entry) => entry.id === info.meshKey);
    const face: SceneTriangle | undefined = mesh?.faces[info.faceIndex ?? -1];
    if (!mesh || !face) { setPickedBandSample(null); return; }
    const nearest = [face.a, face.b, face.c].reduce((best, candidate) =>
      Math.hypot(candidate.x - info.point.x, candidate.y - info.point.y, candidate.z - info.point.z) <
      Math.hypot(best.x - info.point.x, best.y - info.point.y, best.z - info.point.z) ? candidate : best);
    setPickedBandSample({ objectId: mesh.id, label: mesh.label, sampleId: nearest.id ?? "unknown", point: nearest });
  };
  return (
    <div role="dialog" aria-modal="true" aria-label="Verified quantum scene" data-testid="quantum-scene-preview"
      style={{ position: "fixed", inset: 0, zIndex: 2900, background: "rgba(15,23,42,.64)", display: "grid", placeItems: "center", padding: 20 }}>
      <div style={{ width: "min(1200px, 96vw)", height: "min(790px, 94vh)", minHeight: 360, background: "var(--panel-strong, #fff)",
        color: "var(--text, #172033)", borderRadius: 12, display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", overflow: "hidden" }}>
        <header style={{ padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, borderBottom: "1px solid var(--border, #cbd5e1)" }}>
          <div><strong>{document.title}</strong><div style={{ fontSize: 12 }}>Verified quantum-scene/v1 · {scene.provenance.model} · Save workspace to retain this source</div></div>
          <button type="button" onClick={onClose} data-testid="quantum-scene-close">Close</button>
        </header>
        <div style={{ minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(260px, 320px)" }}>
          <div style={{ minHeight: 0, position: "relative", display: "flex", flexDirection: "column" }} data-testid="quantum-scene-geometry">
            {count > 0 && Boolean(scene.fields?.length) && <div style={{ padding: 8, display: "flex", gap: 8 }}>
              <button type="button" onClick={() => setShowField(false)} aria-pressed={!showField}>Geometry</button>
              <button type="button" onClick={() => setShowField(true)} aria-pressed={showField}>Field slice</button>
            </div>}
            <div style={{ minHeight: 0, flex: 1, position: "relative" }}>
            {showField && scene.fields?.length ? <QuantumFieldSlice fingerprint={opened.reference.sceneFingerprint}
              fields={scene.fields} axes={scene.coordinates.axes} units={scene.coordinates.units} /> : count > 0 ? <GeometryViewer scene={viewerScene} meshOverrides={meshObjects} showPlanes={false}
              pickEnabled={meshObjects.length > 0} onPick={pickBand} onPickMiss={() => setPickedBandSample(null)}
              inspectSelectionMeshKey={pickedBandSample?.objectId}
              cameraOverride={camera ? { position: camera.position, target: camera.target, up: camera.up } : null} />
              : <p style={{ padding: 20 }}>This scene has no mapped geometry. Its field datasets are listed in the inspector.</p>}
            </div>
          </div>
          <aside style={{ padding: 16, overflow: "auto", borderLeft: "1px solid var(--border, #cbd5e1)", fontSize: 12, lineHeight: 1.5 }}>
            <h3 style={{ marginTop: 0 }}>Source and coordinates</h3>
            <div><b>Run:</b> {scene.provenance.runId}</div>
            <div><b>Result SHA-256:</b> <code style={{ overflowWrap: "anywhere" }}>{scene.provenance.resultSha256}</code></div>
            <div><b>Engine:</b> {scene.provenance.engine} {scene.provenance.engineVersion}</div>
            {scene.provenance.parameters && <><h3>Stored model inputs</h3><dl data-testid="quantum-scene-parameters" style={{ margin: 0 }}>
              {Object.entries(scene.provenance.parameters).map(([key, value]) => <div key={key} style={{ display: "flex", gap: 8 }}>
                <dt style={{ minWidth: 55 }}>{key}</dt><dd style={{ margin: 0 }}>{String(value)}</dd>
              </div>)}
            </dl></>}
            <div><b>Axes:</b> {scene.coordinates.axes.join(", ")} ({scene.coordinates.handedness}-handed)</div>
            <div><b>Coordinate units:</b> {scene.coordinates.units.join(", ")}</div>
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
            <div><b>3D field surfaces deferred:</b> {opened.deferredFieldIds.length}</div>
            {scene.fields?.length ? <p>Field slices display verified grid samples. Full 3D field surfaces remain deferred.</p> : null}
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
    </div>
  );
}
