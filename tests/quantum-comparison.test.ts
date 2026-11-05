import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compareVerifiedQuantumScenes } from "../src/main/quantumScene/comparison";
import type { ImportedQuantumScene } from "../src/main/quantumScene/importer";

const imported = (values: number[], coordinates = [0, 0, 0, 1, 0, 0], unit = "eV") => ({
  source: { provenance: { model: "qwz", parameters: { mass: 1 } },
    coordinates: { handedness: "right", axes: ["kx", "ky", "E"], units: ["rad", "rad", unit] },
    bands: { kind: "path", coordinates: "k", energies: ["low", "high"], energyUnit: unit, bulkGap: 1 },
  }, arrays: new Map([["k", Float64Array.from(coordinates)], ["low", Float64Array.from(values.slice(0, 2))],
    ["high", Float64Array.from(values.slice(2))]]) }) as unknown as ImportedQuantumScene;

describe("verified quantum A/B comparison", () => {
  it("reports reproducible aligned energy residuals", () => {
    const result = compareVerifiedQuantumScenes(imported([0, 1, 2, 3]), imported([1, 2, 3, 4]));
    assert.equal(result.status, "compatible"); assert.equal(result.samples, 4);
    assert.equal(result.meanAbsolute, 1); assert.equal(result.rootMeanSquare, 1);
    assert.equal(result.maximumAbsolute, 1); assert.equal(result.bulkGapDelta, 0);
  });
  it("flags unit and coordinate incompatibility before subtraction", () => {
    const result = compareVerifiedQuantumScenes(imported([0, 1, 2, 3]), imported([0, 1, 2, 3], [0, 0, 0, 2, 0, 0], "meV"));
    assert.equal(result.status, "incompatible"); assert.equal(result.samples, 0);
  });
  it("reports a two-resolution gap indicator with an explicit convergence warning", () => {
    const a = imported([0, 1, 2, 3]), b = imported([0, 1, 2, 3]);
    const coarse = { ...a, source: { ...a.source, bands: { ...a.source.bands!, grid: [9, 9] as [number, number], bulkGap: 0.8 } } } as ImportedQuantumScene;
    const fine = { ...b, source: { ...b.source, bands: { ...b.source.bands!, grid: [17, 17] as [number, number], bulkGap: 0.9 } } } as ImportedQuantumScene;
    const result = compareVerifiedQuantumScenes(coarse, fine);
    assert.equal(result.status, "incompatible");
    assert.ok(Math.abs(result.convergence!.absoluteChange - 0.1) < 1e-12);
    assert.match(result.warnings.join(" "), /not established/);
  });
  it("compares density rather than gauge-dependent complex amplitudes", () => {
    const field = (real: number, imaginary: number) => ({ source: {
      provenance: { model: "hydrogenic" }, coordinates: { axes: ["x", "y", "z"], units: ["a0", "a0", "a0"] },
      fields: [{ kind: "complex-field", real: "real", imaginary: "imaginary", grid: { shape: [1, 1, 1], origin: [0, 0, 0], spacing: [1, 1, 1] } }],
      datasets: [{ id: "real", unit: "a0^-3/2" }, { id: "imaginary", unit: "a0^-3/2" }],
    }, arrays: new Map([["real", Float64Array.from([real])], ["imaginary", Float64Array.from([imaginary])]]) }) as unknown as ImportedQuantumScene;
    const result = compareVerifiedQuantumScenes(field(1, 0), field(0, 1));
    assert.equal(result.status, "compatible"); assert.equal(result.maximumAbsolute, 0);
  });
  const path=(axis:number[],low:number[],high:number[],unit="eV")=>({
    source:{provenance:{model:"two-band",parameters:{}},coordinates:{handedness:"right",axes:["k","display y","E"],units:["rad","rad",unit]},
      bands:{kind:"path",coordinates:"k",energies:["low","high"],labels:["lower","upper"],energyUnit:unit,bulkGap:2}},
    arrays:new Map([["k",Float64Array.from(axis.flatMap(x=>[x,0,0]))],["low",Float64Array.from(low)],["high",Float64Array.from(high)]])
  }) as unknown as ImportedQuantumScene;
  it("converts explicitly compatible energy units before exact subtraction",()=>{
    const a=path([0,1],[-1,-2],[1,2]);
    const b=path([0,1],[-1000,-2000],[1000,2000],"meV");
    const result=compareVerifiedQuantumScenes(a,b);
    assert.equal(result.status,"compatible");assert.equal(result.maximumAbsolute,0);
    assert.match(result.warnings.join(" "),/converted/);
    assert.equal(result.stateMatching,"unavailable");
  });
  it("interpolates only bounded nondegenerate one-dimensional paths",()=>{
    const a=path([0,1],[-1,-2],[1,2]);
    const b=path([0,0.5,1],[-1,-1.5,-2],[1,1.5,2]);
    assert.equal(compareVerifiedQuantumScenes(a,b).status,"incompatible");
    const result=compareVerifiedQuantumScenes(a,b,"linear-1d");
    assert.equal(result.status,"compatible");assert.equal(result.maximumAbsolute,0);
    assert.equal(result.alignment,"linear-1d");
  });
  it("refuses extrapolation and sampled degeneracy",()=>{
    assert.match(compareVerifiedQuantumScenes(path([-1,0],[-1,-2],[1,2]),path([0,1],[-1,-2],[1,2]),"linear-1d").reasons.join(" "),/extrapolate/);
    assert.match(compareVerifiedQuantumScenes(path([0,1],[-1,0],[1,0]),path([0,0.5,1],[-1,-1,-1],[1,1,1]),"linear-1d").reasons.join(" "),/Degenerate/);
  });
});
