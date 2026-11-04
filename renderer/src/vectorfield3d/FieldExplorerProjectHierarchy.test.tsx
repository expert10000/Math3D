import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildDerivedProfileProvenance, parseMath3DProject, serializeMath3DProject } from "@math3d/core";
import { FieldExplorerProjectHierarchy } from "./FieldExplorerProjectHierarchy";
import { DerivedProfileProvenanceCard } from "../shared/DerivedProfileProvenanceCard";

const fixture = new URL("../../../tests/fixtures/derived-field/gf03-magnitude-slice-profile.math3d", import.meta.url);
const load = () => parseMath3DProject(readFileSync(fixture, "utf8"));

describe("GF-06 Field Explorer Project hierarchy", () => {
  it("finds saved sources, selections and the derived profile after Project reopen", () => {
    const project = parseMath3DProject(serializeMath3DProject(load()));
    const source = project.workspace.entries.find(entry => entry.module === "vector3d")!;
    const profileId = project.workspace.derivedFields![2]!.identity.id;
    const profile = buildDerivedProfileProvenance(project, profileId,
      { verifySource: document => document.source.field.kind === "expressions" });
    const html = renderToStaticMarkup(<FieldExplorerProjectHierarchy project={project}
      activeSourceId={source.expected.id} activeSourceTitle="Vector field" profiles={[profile]} />);
    expect(html).toContain("Sources (1)");
    expect(html).toContain("Derived (3)");
    expect(html).toContain("Selections (10)");
    expect(html).toContain("Results (1)");
    expect(html).toContain(profileId);
    expect(html).toContain("Magnitude profile");
    expect(html).toContain("Point · x (m) = 1");
    expect(html).toContain("Planar region");
    expect(html).toContain("x -2…2 m");
    expect(html).toContain("y -1…1 m");
    expect(html).toContain("Line · x (m)");
    expect(html).toContain('href="#field-explorer-source-controls"');
    expect(html).toContain('aria-label="Field Explorer Project objects"');
  });

  it("labels the GF-05 source verification withholding reason without inventing coverage", () => {
    const project = load();
    const source = project.workspace.entries.find(entry => entry.module === "vector3d")!;
    const profileId = project.workspace.derivedFields![2]!.identity.id;
    const profile = buildDerivedProfileProvenance(project, profileId, { verifySource: () => false });
    expect(profile).toMatchObject({ status: "withheld", reason: "source-unverified" });
    const html = renderToStaticMarkup(<FieldExplorerProjectHierarchy project={project}
      activeSourceId={source.expected.id} activeSourceTitle="Vector field" profiles={[profile]} />);
    expect(html).toContain("Values withheld: source-unverified");
    expect(html).not.toContain("Verified transfer coverage");
    const inspector = renderToStaticMarkup(<DerivedProfileProvenanceCard view="explorer"
      provenance={profile} />);
    expect(inspector).toContain(profileId);
    expect(inspector).toContain("The source cannot be verified. Profile values are withheld until verification succeeds.");
    expect(inspector).toContain("0 available");
  });

  it("keeps controls discoverable for a session field layer beside a saved vector source", () => {
    const html = renderToStaticMarkup(<FieldExplorerProjectHierarchy project={load()}
      activeSourceId="math3d:scientific-field:session" activeSourceTitle="Scalar layer"
      profiles={[]} onOpenSourceControls={() => {}} />);
    expect(html).toContain("Sources (2)");
    expect(html).toContain("Scalar layer");
    expect(html).toContain("Open field controls");
    expect(html).not.toContain('href="#field-explorer-source-controls"');
  });
});
