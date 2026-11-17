import { useEffect, useState } from "react";
import type { Math3DProject, QuantumSceneDocument } from "@math3d/core";
import { openVerifiedStudyQuantumScene } from "../projects/studyQuantumSource";
import type { QuantumSceneOpenResponse } from "./QuantumScenePreview";
import { QuantumFieldSlice, type QuantumField } from "./QuantumFieldSlice";

type Opened = Extract<QuantumSceneOpenResponse, { ok: true }>;

/** Each pane reopens the saved bundle before requesting any field sample from the native importer. */
export function StudyHydrogenPanePreview({ project, document, role }: {
  project: Math3DProject; document: QuantumSceneDocument; role: "density" | "phase";
}) {
  const [state, setState] = useState<{ opened: Opened | null; error: string }>({ opened: null, error: "" });
  useEffect(() => {
    let active = true;
    setState({ opened: null, error: "" });
    void openVerifiedStudyQuantumScene(project, document)
      .then(opened => { if (active) setState({ opened, error: "" }); })
      .catch(error => { if (active) setState({ opened: null, error: String((error as Error).message) }); });
    return () => { active = false; };
  }, [project, document]);
  if (state.error) return <p role="status" data-testid="project-study-hydrogen-withheld">{state.error}</p>;
  if (!state.opened) return <p role="status">Verifying hydrogen {role} source…</p>;
  const scene = (state.opened.document.extensions[document.source.sceneSchema] as { scene?: {
    fields?: QuantumField[]; coordinates: { axes: [string, string, string]; units: [string, string, string] };
  } } | undefined)?.scene;
  const fields = scene?.fields?.filter(field => field.kind === "complex-field") ?? [];
  if (fields.length !== 1 || !scene)
    return <p role="status" data-testid="project-study-hydrogen-withheld">Verified hydrogen source has no single complex field.</p>;
  return <div data-testid="project-study-hydrogen-view" data-role={role} style={{ height: "100%" }}>
    <strong>{role === "density" ? "Density |ψ|²" : "Phase arg(ψ)"}</strong>
    <p style={{ margin: "4px 0" }}>Source amplitude: {document.source.datasets.find(item => item.id === fields[0]!.id)?.unit ??
      document.source.datasets.find(item => item.id === (scene.fields?.[0] as { real?: string })?.real)?.unit ?? "declared in source"}.
      {role === "phase" ? " Phase is in rad and undefined at complex nodes; its global offset is arbitrary." :
        " Density is derived from the supplied real and imaginary amplitudes; its unit is the amplitude unit squared."}</p>
    <QuantumFieldSlice fingerprint={document.source.sceneFingerprint} fields={fields}
      axes={scene.coordinates.axes} units={scene.coordinates.units}
      runId={document.source.provenance.runId} resultSha256={document.source.provenance.resultSha256}
      coordinateSystemId="field-grid" fixedQuantity={role} />
  </div>;
}
