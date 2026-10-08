import React from "react";
import { GeometryViewer } from "../components/GeometryViewer";
import { ParamSurfaceViewer } from "../components/ParamSurfaceViewer";
import type { CameraSyncState } from "../components/SurfaceViewer";
import type { RepresentationView } from "../projects/additionalProjectRepresentations";
import type { SurfaceDocumentBinding } from "./surfaceDocumentBinding";

export function DocumentViewport({ view, binding, presentation, camera, cameraToken, rememberCamera, wireframe, probe, onProbe }:
  { view: RepresentationView; binding: SurfaceDocumentBinding | null; presentation: "surface" | "sampled"; camera: CameraSyncState | null;
    cameraToken: number; rememberCamera: (camera: CameraSyncState) => void; wireframe: boolean; probe: boolean; onProbe: (value: unknown) => void }) {
  return <div style={{ width: "100%", height: "100%" }} data-testid="document-viewport" data-view={binding && presentation === "surface" ? "surface" : "sampled"}
    data-document-id={binding?.generation.id} data-document-revision={binding?.generation.revision} data-source-hash={binding?.generation.structuralHash}>
    {binding && presentation === "surface"
      ? <ParamSurfaceViewer surfaceId="custom" documentBinding={binding} paramDomain={binding.domain} paramResolution={64} wireframe={wireframe}
          probeEnabled={probe} showProbeNormal={probe} onProbe={onProbe} showOverlayControls={false} isCameraLeader onCameraSync={rememberCamera}
          cameraOverride={camera} cameraOverrideToken={cameraToken} />
      : <GeometryViewer scene={view.scene} meshOverrides={view.meshes} wireframe={wireframe} onCameraSync={rememberCamera} cameraOverride={camera} cameraOverrideToken={cameraToken} />}
  </div>;
}
