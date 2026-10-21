import React, { useCallback, useMemo, useState } from "react";
import { qualifyProjectOverlayCoordinates, type Math3DProject, type ProjectComposition } from "@math3d/core";
import type { ProjectResourceReader } from "../projects/projectResources";
import { ComparisonPane, compatibleCompositionParameterChart, qualifyProjectCameraPair,
  resolveProjectCompositionMember, type RenderMember } from "./ProjectCompositionView";
import type { CameraSyncState } from "./SurfaceViewer";
import { useComparisonEvidenceExport } from "../projects/useComparisonEvidenceExport";
import type { ComparisonEvidenceSelection } from "../projects/projectComparisonEvidence";

type Props = { project: Math3DProject; composition: ProjectComposition; readResource: ProjectResourceReader };

/** Resolve exact Project sources on opening; the Workbook owns no scientific arrays. */
const WorkbookComparisonPreview: React.FC<Props> = ({ project, composition, readResource }) => {
  const [pick, setPick] = useState<ComparisonEvidenceSelection | null>(null);
  const [linked, setLinked] = useState<{ uv: { u: number; v: number }; token: number } | null>(null);
  const [cameraPose, setCameraPose] = useState<{ state: CameraSyncState; token: number } | null>(null);
  const onLeaderCamera = useCallback((state: CameraSyncState) =>
    setCameraPose(previous => ({ state, token: (previous?.token ?? 0) + 1 })), []);
  const { members, error, overlayStatus } = useMemo(() => {
    try {
      if (composition.mode === "overlay" && composition.members.some(member =>
        project.workspace.entries.find(entry => entry.expected.id === member.documentId)?.module === "surface"))
        throw new TypeError("Surface overlays are unavailable; use a saved side-by-side comparison.");
      let sources: RenderMember[] = composition.members.map((member, slot) => ({
        ...resolveProjectCompositionMember(project, member, readResource), slot: slot as 0 | 1,
      }));
      let qualification: "verified" | "asserted" | null = null;
      if (composition.mode === "overlay") {
        const checked = qualifyProjectOverlayCoordinates(sources[0]!.coordinates, sources[1]!.coordinates, composition.alignment!);
        if (checked === "invalid" || checked === "mismatch") throw new TypeError("Saved overlay source frames or units are invalid or mismatched.");
        qualification = checked;
      }
      sources = sources.filter((_, index) => composition.members[index]!.visible);
      if (sources.reduce((total, member) => total + member.meshes.reduce((sum, mesh) => sum + mesh.positions.length / 3, 0), 0) > 500_000)
        throw new TypeError("Comparison exceeds the bounded 500,000-vertex preview limit.");
      return { members: sources, error: "", overlayStatus: qualification };
    } catch (caught) {
      return { members: [] as RenderMember[], error: caught instanceof Error ? caught.message : "Comparison sources could not be verified.", overlayStatus: null };
    }
  }, [project, composition, readResource]);
  const linkable = composition.mode === "side-by-side" && compatibleCompositionParameterChart(members);
  const cameraQualification = composition.mode === "side-by-side" ? qualifyProjectCameraPair(members) : null;
  const cameraLeader = composition.camera?.leader === "B" ? 1 : 0;
  const cameraLinked = !!composition.camera && !!cameraQualification;
  const report = useComparisonEvidenceExport(project, composition, readResource, pick);
  const onPick: React.ComponentProps<typeof ComparisonPane>["onPick"] = next => {
    setPick(next);
    setLinked(previous => linkable && next.uv ? { uv: next.uv, token: (previous?.token ?? 0) + 1 } : null);
  };
  if (error) return <p role="alert" data-testid="workbook-comparison-refused">Comparison refused: {error}</p>;
  return <div data-testid="workbook-comparison-preview" style={{ display: "grid", gap: 8, minWidth: 0 }}>
    <div style={{ display: "grid", gridTemplateColumns: composition.mode === "overlay" ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 8 }}>
      {composition.mode === "overlay" ? <ComparisonPane members={members} label={`Overlay · ${composition.alignment?.frame} · ${composition.alignment?.unit}`} onPick={onPick} height={360}
        captureToken={report.captureToken} onCaptureThumbnail={report.onCapture(0)} /> :
        composition.members.map((member, index) => <ComparisonPane key={`${index}:${member.documentId}`} members={members.filter(item => item.slot === index)}
          label={`${index === 0 ? "A" : "B"}: ${project.metadata.documents?.[member.documentId]?.title ?? member.documentId} · r${member.expected.revision}`}
          onPick={onPick} height={360} linkedUV={linkable ? linked?.uv : null} linkedToken={linked?.token}
          captureToken={report.captureToken} onCaptureThumbnail={report.onCapture(index)}
          onCameraSync={cameraLinked && index === cameraLeader ? onLeaderCamera : undefined}
          cameraOverride={cameraLinked && index !== cameraLeader ? cameraPose?.state : null}
          cameraOverrideToken={cameraLinked && index !== cameraLeader ? cameraPose?.token : undefined} />)}
    </div>
    <small>{overlayStatus === "asserted" ? "Overlay alignment is an operator assertion; at least one source lacks a coordinate-frame declaration." :
      overlayStatus === "verified" ? "Source-declared coordinate frames and units match." :
      cameraLinked ? `Saved camera preference: ${composition.camera!.leader} leads; source compatibility was rechecked.` :
      "Each pane retains its own source and camera."}</small>
    <small>{linkable ? "Shared (u,v) selection links only the same stored chart coordinates." : "Selections are source-specific; no physical-point correspondence is inferred."}</small>
    <section data-testid="workbook-comparison-evidence" style={{ overflowWrap: "anywhere" }}><strong>Saved comparison evidence</strong>
      {composition.members.map((member, index) => <div key={index}>{index === 0 ? "A" : "B"} · r{member.expected.revision} · {member.expected.structuralHash}</div>)}
      <div>Alignment: {overlayStatus === "verified" ? "source-declared match" : overlayStatus === "asserted" ? "operator assertion" : "not applicable; side-by-side"}.</div>
      <div>Selection: {pick ? `${pick.memberId} · r${pick.revision} · ${pick.hash} · local xyz ${JSON.stringify(pick.point)}${pick.uv ? ` · stored (u,v) ${JSON.stringify(pick.uv)}` : ""}` : "No point selected."}</div>
      <button data-testid="workbook-comparison-export-evidence" disabled={report.busy} onClick={() => void report.exportEvidence()}>
        {report.busy ? "Capturing views…" : "Export checked HTML report with views"}</button>
      {report.message && <span role="status">{report.message}</span>}
    </section>
  </div>;
};

export default WorkbookComparisonPreview;
