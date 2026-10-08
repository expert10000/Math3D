import React from "react";
import { GeometryViewer } from "../components/GeometryViewer";
import { ParamSurfaceViewer } from "../components/ParamSurfaceViewer";
import type { CameraSyncState } from "../components/SurfaceViewer";
import type { RepresentationView } from "../projects/additionalProjectRepresentations";
import type { SurfaceDocumentBinding } from "./surfaceDocumentBinding";
import type { SurfaceDocumentView } from "../surfaceAnalysis/surfaceDocumentView";
import type { ProbeInfo } from "../components/SurfaceViewer";
import type { PrincipalCurvatureScalars } from "../math/principalCurvature";

export function DocumentViewport({ view, binding, presentation, camera, cameraToken, rememberCamera, wireframe, probe, onProbe, surfaceView, onCurvature, probeUV, probeToken, resetToken }:
  { view: RepresentationView; binding: SurfaceDocumentBinding | null; presentation: "surface" | "sampled"; camera: CameraSyncState | null;
    cameraToken: number; rememberCamera: (camera: CameraSyncState) => void; wireframe: boolean; probe: boolean; onProbe: (value: ProbeInfo) => void;
    surfaceView: SurfaceDocumentView; onCurvature: (value: PrincipalCurvatureScalars | null) => void; probeUV: { u: number; v: number } | null; probeToken: number; resetToken: number }) {
  return <div style={{ width: "100%", height: "100%" }} data-testid="document-viewport" data-workbench="custom" data-view={binding && presentation === "surface" ? "surface" : "sampled"}
    data-document-id={binding?.generation.id} data-document-revision={binding?.generation.revision} data-source-hash={binding?.generation.structuralHash}>
    {binding && presentation === "surface"
      ? <ParamSurfaceViewer key={binding.generation.structuralHash} surfaceId="custom" documentBinding={binding} paramDomain={binding.domain} paramResolution={surfaceView.resolution} wireframe={wireframe}
          lightPreset={surfaceView.lightPreset} materialRoughness={surfaceView.roughness} materialMetalness={surfaceView.metalness} materialOpacity={surfaceView.opacity}
          showPlanes={surfaceView.showPlanes} showPrincipalDirections={surfaceView.showPrincipalDirections} showPrincipalLines={surfaceView.showPrincipalLines} showCurvatureLines={surfaceView.showCurvatureLines}
          probeEnabled={probe} showProbeNormal={surfaceView.showProbeNormal} showProbeTangentPlane={surfaceView.showProbeTangentPlane} showProbeTangents={surfaceView.showProbeTangents}
          onProbe={onProbe} onParamCurvature={onCurvature} paramProbeUV={probeUV} paramProbeToken={probeToken} showOverlayControls showViewGizmo isCameraLeader onCameraSync={rememberCamera}
          cameraOverride={camera} cameraOverrideToken={cameraToken} resetToken={resetToken} />
      : <GeometryViewer scene={view.scene} meshOverrides={view.meshes} wireframe={wireframe} onCameraSync={rememberCamera} cameraOverride={camera} cameraOverrideToken={cameraToken} />}
  </div>;
}
