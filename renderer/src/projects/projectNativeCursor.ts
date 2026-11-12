import { matchesScientificSourceGeneration, readProjectCoordinateFrame, viewerSourceFromDocument,
  type KernelWorkspaceDocument, type KernelWorkspaceModule, type Math3DProject } from "@math3d/core";
import { projectCurveParameterToGraph } from "../graph2d/graphCurveCursor";
import { projectCurveSurfaceParameter } from "../curveAnalysis/curveSurfaceCursor";
import type { ProjectScientificCursor } from "../components/scientificCursor";
import { qualifyStudyGraphCurveLink, studyHasQualifiedGraphCurveLink } from "./studyGraphCurveLink";
import { qualifyStudyCurveSurfaceLink, studyHasQualifiedCurveSurfaceLink } from "./studyCurveSurfaceLink";
import { qualifyStudySurfaceMeshLink, studyHasQualifiedSurfaceMeshLink } from "./studySurfaceMeshLink";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";

export type NativeCursorProjection = { status: "matched"; coordinates: readonly number[];
  axes: readonly string[]; unit: string; method: string } |
  { status: "withheld"; reason: string };

/** Inspect a native document only after its exact Project generation and an explicit mapping qualify. */
export function projectNativeCursor(project: Math3DProject, target: KernelWorkspaceDocument,
  module: KernelWorkspaceModule, cursor: ProjectScientificCursor): NativeCursorProjection {
  const targetEntry = project.workspace.entries.find(entry => entry.expected.id === target.identity.id && entry.module === module);
  if (!targetEntry || !matchesScientificSourceGeneration(viewerSourceFromDocument(target),
    viewerSourceFromDocument({ identity: targetEntry.expected })))
    return { status: "withheld", reason: "The open document is not the saved Project generation." };
  const sourceEntry = project.workspace.entries.find(entry => entry.expected.id === cursor.source.documentId &&
    entry.module === cursor.sourceModule);
  const replayed = verifyMixedWorkspaceReplay(project.workspace);
  if (!sourceEntry || !matchesScientificSourceGeneration(cursor.source,
    viewerSourceFromDocument({ identity: sourceEntry.expected })) ||
    !replayed.get(cursor.source.documentId) ||
    !matchesScientificSourceGeneration(cursor.source, viewerSourceFromDocument(replayed.get(cursor.source.documentId)!)))
    return { status: "withheld", reason: "Cursor source changed or is unavailable." };
  if (!replayed.get(target.identity.id))
    return { status: "withheld", reason: "Open document checkpoint cannot be replayed." };
  if (target.identity.id === cursor.source.documentId) {
    if (module === "graph2d" && (cursor.frame.kind !== "cartesian" ||
      cursor.frame.axes.length !== 2 || cursor.frame.axes.some((axis, index) =>
        axis.name !== ["x", "y"][index])))
      return { status: "withheld", reason: "Graph cursor axes differ from the native x/y frame." };
    if (module === "curve" && target.format === "math3d.curve-document") {
      const parameter = cursor.frame.kind === "parameter" && cursor.frame.frameId === target.identity.id &&
        cursor.frame.axes.length === 1 && cursor.frame.axes[0]?.name === target.source.domain.parameter &&
        cursor.frame.axes[0]?.unit === target.source.units.parameter;
      const physical = cursor.frame.kind === "cartesian" && [2, 3].includes(cursor.frame.axes.length) &&
        cursor.frame.axes.every((axis, index) => axis.name === ["x", "y", "z"][index]);
      if (!parameter && !physical)
        return { status: "withheld", reason: "Curve cursor frame differs from its parameter or physical axes." };
    }
    if (module === "surface" || module === "mesh") {
      const declared = readProjectCoordinateFrame(target);
      if (declared.status !== "declared" || !declared.value ||
        cursor.frame.frameId !== declared.value.frame ||
        cursor.frame.axes.length !== declared.value.axes.length ||
        cursor.frame.axes.some((axis, index) => axis.name !== declared.value!.axes[index] ||
          axis.unit !== declared.value!.unit))
        return { status: "withheld", reason: "Cursor frame differs from the saved document declaration." };
    }
    return { status: "matched", coordinates: cursor.position,
      axes: cursor.frame.axes.map(axis => axis.name), unit: cursor.frame.axes[0]?.unit ?? "1",
      method: "Exact saved source" };
  }
  if (module === "graph2d" && cursor.sourceModule === "curve") {
    for (const study of project.workspace.studies ?? []) {
      const pair = qualifyStudyGraphCurveLink(project, study);
      if (!pair || pair.graphId !== target.identity.id || !studyHasQualifiedGraphCurveLink(study, pair)) continue;
      const mapped = projectCurveParameterToGraph(cursor, project, pair.graphId, pair.objectId);
      if (mapped.status === "matched") return { status: "matched",
        coordinates: [mapped.value.x, mapped.value.y], axes: ["x", "y"], unit: "graph coordinates",
        method: "Qualified Curve promotion" };
      return { status: "withheld", reason: mapped.reason };
    }
  }
  if (module === "surface" && cursor.sourceModule === "curve") {
    for (const study of project.workspace.studies ?? []) {
      const pair = qualifyStudyCurveSurfaceLink(project, study);
      if (!pair || pair.surface.identity.id !== target.identity.id ||
        !studyHasQualifiedCurveSurfaceLink(study, pair)) continue;
      const mapped = projectCurveSurfaceParameter(cursor, project, target.identity.id);
      if (mapped.status === "matched") return { status: "matched",
        coordinates: [mapped.value.u, mapped.value.v], axes: ["u", "v"], unit: "chart coordinates",
        method: "Qualified Curve to Surface chart" };
      return { status: "withheld", reason: mapped.reason };
    }
  }
  if ((module === "surface" && cursor.sourceModule === "mesh") ||
      (module === "mesh" && cursor.sourceModule === "surface")) {
    for (const study of project.workspace.studies ?? []) {
      const link = qualifyStudySurfaceMeshLink(project, study);
      if (link?.status !== "ready" || !studyHasQualifiedSurfaceMeshLink(study, link.value) ||
        link.value[module].identity.id !== target.identity.id ||
        link.value[cursor.sourceModule].identity.id !== cursor.source.documentId) continue;
      if (cursor.frame.frameId !== link.value.frame.frame ||
        cursor.frame.axes.length !== 3 || cursor.frame.axes.some((axis, index) =>
          axis.name !== link.value.frame.axes[index] || axis.unit !== link.value.frame.unit))
        return { status: "withheld", reason: "Physical coordinate frame differs from the qualified Study link." };
      return { status: "matched", coordinates: cursor.position,
        axes: link.value.frame.axes, unit: link.value.frame.unit,
        method: "Qualified physical marker; no element correspondence" };
    }
  }
  return { status: "withheld", reason: "No current Study mapping connects this cursor to the open document." };
}
