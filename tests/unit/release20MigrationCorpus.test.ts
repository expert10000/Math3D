import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseMath3DProject } from "@math3d/core";
import { exportProjectFile, previewProjectImport } from "../../renderer/src/projects/projectTransfer";

// These are checked-in source-format specimens, not claims about installed 1.x binaries.
const specimens = [
  ["legacy scientific selection", "../fixtures/scientific-selection/gf01-legacy-project.math3d", "f7af424fcdecd62d005c03acf572a6f5a400c714cbe0cd3c77daafa560d6c00c"],
  ["derived field", "../fixtures/derived-field/gf03-magnitude-slice-profile.math3d", "80a220a9151b083d180680f441ed3c19250220990c00e4804a8a1548e1e8bbee"],
  ["field return graph", "../fixtures/graph-field/gf49-return-graph.math3d.project.json", "757a59ac7a1ad86c9367f084ee9f57b9baf78c4b26fdb4a3a1c20afc1636dc72"],
] as const;

describe("M3D20-17a source Project migration corpus", () => {
  for (const [label, path, expectedSha256] of specimens) {
    it(`previews, exports, and independently reimports ${label}`, () => {
      const original = readFileSync(new URL(path, import.meta.url));
      const sourceSha256 = createHash("sha256").update(original).digest("hex");
      const first = previewProjectImport(original.toString("utf8"));
      const before = first.project;
      const portable = exportProjectFile(before);
      const second = previewProjectImport(portable);
      const reopened = parseMath3DProject(portable);

      expect(sourceSha256).toBe(expectedSha256);
      expect(second.project).toEqual(reopened);
      expect(second.project.identity).toEqual(before.identity);
      expect(second.project.workspace.entries.map(entry => entry.expected))
        .toEqual(before.workspace.entries.map(entry => entry.expected));
      expect(second.project.workspace.results).toEqual(before.workspace.results);
      expect(second.project.workspace.relations).toEqual(before.workspace.relations);
      expect(second.project.notes).toEqual(before.notes);
      expect(second.sidecars.map(item => [item.id, item.checksum, item.requiredForSource]))
        .toEqual(first.sidecars.map(item => [item.id, item.checksum, item.requiredForSource]));
      expect(second.canOpenWorkspace).toBe(first.canOpenWorkspace);
      expect(second.reasons).toEqual(first.reasons);
    });
  }

  it("refuses future envelopes and changed identity rather than upgrading them silently", () => {
    const raw = readFileSync(new URL(specimens[0][1], import.meta.url), "utf8");
    const value = JSON.parse(raw);
    expect(() => previewProjectImport(JSON.stringify({ ...value, schemaVersion: 99 }))).toThrow();
    expect(() => previewProjectImport(JSON.stringify({ ...value, format: "math3d.future-project" }))).toThrow();
    const document = value.workspace.entries[0];
    document.expected.structuralHash = "sha256:" + "0".repeat(64);
    expect(() => previewProjectImport(JSON.stringify(value))).toThrow();
  });
});
