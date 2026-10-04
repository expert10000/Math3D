import { describe, expect, it } from "vitest";
import { additionalRepresentationFixture } from "../../../tests/fixtures/unified-projects/additionalRepresentations";
import { AdditionalProjectSession } from "./additionalProjectSession";
import { sourceFromSurfaceFormulaFields, surfaceFormulaFields } from "./surfaceFormulaFields";

describe("saved Surface formula controls", () => {
  const fixture = additionalRepresentationFixture();
  for (const document of fixture.docs.filter(d => d.format === "math3d.surface-document" && ["weierstrass", "explicit", "implicit", "parametric"].includes(d.source.representation))) {
    if (document.format !== "math3d.surface-document") continue;
    it(`retains ${document.source.representation} recipe metadata, domain policies and history`, () => {
      const fields = surfaceFormulaFields(document), values = Object.fromEntries(fields.map(field => [field.id, field.value]));
      expect(sourceFromSurfaceFormulaFields(document, values)).toEqual(document.source);
      const first = fields.find(field => !field.numeric)!;
      values[first.id] = document.source.representation === "weierstrass" ? "z" : document.source.representation === "implicit" ? "x*x+y*y+z*z-0.25" : "0";
      const next = sourceFromSurfaceFormulaFields(document, values);
      const session = new AdditionalProjectSession(fixture.project.workspace.entries.find(entry => entry.expected.id === document.identity.id)!, document, () => ({ documents: new Map(fixture.docs.map(d => [d.identity.id, d])) }));
      session.commit(next as never); expect(session.document().source).toEqual(next);
      session.undo(); expect(session.document().source).toEqual(document.source);
      session.redo(); expect(session.document().source).toEqual(next);
      values[first.id] = " "; expect(() => sourceFromSurfaceFormulaFields(document, values)).toThrow("Enter");
    });
  }
  it("rejects empty, infinite and reversed ranges before mutating source", () => {
    const document = fixture.docs.find(d => d.format === "math3d.surface-document" && d.source.representation === "weierstrass")!;
    if (document.format !== "math3d.surface-document") throw Error();
    const values = Object.fromEntries(surfaceFormulaFields(document).map(field => [field.id, field.value])), original = structuredClone(document);
    for (const value of ["", "Infinity", "100"]) expect(() => sourceFromSurfaceFormulaFields(document, { ...values, "u.min": value })).toThrow();
    expect(document).toEqual(original);
  });
});
