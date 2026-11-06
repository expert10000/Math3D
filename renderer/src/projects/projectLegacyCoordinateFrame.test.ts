import { describe, expect, it } from "vitest";
import { inspectProjectCompositionAvailability, parseMath3DProject,
  readProjectCoordinateFrame, serializeMath3DProject, type ProjectCoordinateFrame } from "@math3d/core";
import { createProjectComparisonTemplate } from "../../../packages/core/src/projectComparisonTemplates";
import { createProjectComparisonEvidence } from "./projectComparisonEvidence";
import { declareLegacyGeometryCoordinateFrame } from "./projectLegacyCoordinateFrame";
import { resolveProjectCompositionMember } from "../components/ProjectCompositionView";

const frame: ProjectCoordinateFrame = { format: "math3d.coordinate-frame/v1", frame: "laboratory xyz",
  unit: "mm", axes: ["x", "y", "z"], handedness: "right" };

describe("PC03 legacy Geometry frame declaration", () => {
  it("revises the owning source, retains its old checkpoint, and pins a new exact overlay", () => {
    const original = createProjectComparisonTemplate("coordinate-overlay-study", "pc03-frame-declaration");
    const asserted = original.compositions!.find(item => item.title === "Unverified A/D overlay")!;
    const { project: next, comparison } = declareLegacyGeometryCoordinateFrame(original, asserted, 1, frame);
    const reopened = parseMath3DProject(serializeMath3DProject(next));
    const entry = reopened.workspace.entries.find(item => item.expected.id === asserted.members[1].documentId)!;
    expect(entry.checkpoint.identity).toEqual(asserted.members[1].expected);
    expect(entry.expected).toEqual(comparison.members[1].expected);
    expect(entry.expected.revision).toBe(entry.checkpoint.identity.revision + 1);
    expect(readProjectCoordinateFrame(entry.checkpoint).status).toBe("missing");
    expect(inspectProjectCompositionAvailability(asserted, reopened.workspace)).toEqual(["current", "retained-checkpoint"]);
    expect(inspectProjectCompositionAvailability(comparison, reopened.workspace)).toEqual(["current", "current"]);
    expect(createProjectComparisonEvidence(reopened, asserted, () => null).alignment).toBe("operator assertion");
    expect(createProjectComparisonEvidence(reopened, comparison, () => null).alignment).toBe("source-declared match");
    expect(resolveProjectCompositionMember(reopened, asserted.members[1], () => null).coordinates.status).toBe("missing");
    expect(resolveProjectCompositionMember(reopened, comparison.members[1], () => null).coordinates.value).toEqual(frame);
    expect(original.workspace).not.toEqual(next.workspace);
  });

  it("refuses an unsaved, incompatible, repeated, or invalid declaration", () => {
    const project = createProjectComparisonTemplate("coordinate-overlay-study", "pc03-frame-refusal");
    const asserted = project.compositions!.find(item => item.title === "Unverified A/D overlay")!;
    expect(() => declareLegacyGeometryCoordinateFrame(project, { ...asserted, title: "edited" }, 1, frame)).toThrow(/exact overlay/i);
    expect(() => declareLegacyGeometryCoordinateFrame(project, asserted, 1, { ...frame, unit: "cm" })).toThrow(/exact overlay/i);
    expect(() => declareLegacyGeometryCoordinateFrame(project, asserted, 0, frame)).toThrow(/already declares/i);
    expect(() => declareLegacyGeometryCoordinateFrame(project, asserted, 1, { ...frame, axes: ["x", "x", "z"] })).toThrow(/invalid/i);
    expect(() => declareLegacyGeometryCoordinateFrame(project, asserted, 1, { ...frame, handedness: "left" })).toThrow(/handedness/i);
    const { project: revised } = declareLegacyGeometryCoordinateFrame(project, asserted, 1, frame);
    expect(() => declareLegacyGeometryCoordinateFrame(revised, asserted, 1, frame)).toThrow(/exact replay checkpoint/i);
  });
});
