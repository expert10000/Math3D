import { useEffect, useState } from "react";
import { type Math3DProject, type QuantumSceneDocument } from "@math3d/core";
import { openVerifiedStudyQuantumScene } from "../projects/studyQuantumSource";
import type { QuantumSceneOpenResponse } from "./QuantumScenePreview";
import { GeometryViewer } from "./GeometryViewer";
import { buildQuantumReciprocalView, type ReciprocalDefinition } from "./quantumReciprocalView";
import { scientificCursorBus, type ScientificCursorEvent } from "./scientificCursor";

type Opened = Extract<QuantumSceneOpenResponse, { ok: true }>;

/** External scene bytes are independently reopened before this read-only pane receives geometry. */
export function StudyQuantumPanePreview({ project, document, role }: {
  project: Math3DProject; document: QuantumSceneDocument;
  role: "curvature" | "bands" | "reciprocal" | "inspector";
}) {
  const [state, setState] = useState<{ opened: Opened | null; error: string }>({ opened: null, error: "" });
  const [cursor, setCursor] = useState<ScientificCursorEvent | null>(null);
  useEffect(() => {
    let active = true;
    setState({ opened: null, error: "" });
    void openVerifiedStudyQuantumScene(project, document)
      .then(opened => { if (active) setState({ opened, error: "" }); })
      .catch(error => { if (active) setState({ opened: null, error: String((error as Error).message) }); });
    return () => { active = false; };
  }, [project, document]);
  useEffect(() => scientificCursorBus.subscribe(next => setCursor(next)), []);
  if (state.error) return <p role="status" data-testid="project-study-quantum-withheld">{state.error}</p>;
  if (!state.opened) return <p role="status">Verifying QWZ {role} source…</p>;
  const scene = (state.opened.document.extensions[document.source.sceneSchema] as { scene?: {
    reciprocal?: ReciprocalDefinition; objects: { id: string; label: string; kind: string;
      style: { color: string; opacity: number; size: number } }[];
    topology?: { invariants: { id: string; label: string; value: number | null; status: string; method: string }[];
      limitations: string[] };
    provenance: { engine: string; engineVersion: string };
  } } | undefined)?.scene;
  const linkedK = cursor?.kind === "quantum" && cursor.runId === document.source.provenance.runId &&
    cursor.resultSha256 === document.source.provenance.resultSha256 &&
    cursor.reciprocalPoint?.basisId === `qwz:${document.source.coordinates.units[0]}` ? cursor.reciprocalPoint.k : null;
  if (role === "reciprocal" && !scene?.reciprocal)
    return <p role="status" data-testid="project-study-quantum-withheld">Verified source has no reciprocal-space view.</p>;
  return <div data-testid="project-study-quantum-view" data-role={role} style={{ position: "relative", height: "100%" }}>
    <small>Verified {role} · {document.source.sceneFingerprint.slice(0, 12)}</small>
    {linkedK && <p data-testid="project-study-quantum-linked-k">Linked k=({linkedK[0]}, {linkedK[1]}) {document.source.coordinates.units[0]}</p>}
    {role === "inspector" ? <div data-testid="project-study-qwz-inspector">
      <p>Source run {document.source.provenance.runId} · result SHA-256 {document.source.provenance.resultSha256}</p>
      <p>Producer {scene?.provenance.engine ?? document.source.provenance.engine} {scene?.provenance.engineVersion ?? document.source.provenance.engineVersion}</p>
      {(scene?.topology?.invariants ?? []).map(item => <p key={item.id}>{item.label}: {item.value ?? "not supplied"} · {item.status} · {item.method}</p>)}
      {(scene?.topology?.limitations ?? []).map((item, index) => <p key={index}>{item}</p>)}
    </div> : <div style={{ position: "relative", height: 290 }}><GeometryViewer scene={role === "reciprocal" ?
      buildQuantumReciprocalView(state.opened.document.geometry, scene!.reciprocal!, scene!.objects,
        state.opened.mappedObjectIds).geometry : state.opened.document.geometry} /></div>}
  </div>;
}
