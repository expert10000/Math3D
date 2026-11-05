import type { ImportedQuantumScene } from "./importer";

export type QuantumComparison = Readonly<{
  status: "compatible" | "incompatible";
  reasons: string[];
  warnings: string[];
  metadataDiffs: { key: string; a: string | number | null; b: string | number | null }[];
  convergence: { quantity: "bulk gap"; gridA: [number, number]; gridB: [number, number];
    absoluteChange: number; status: "two-resolution-indicator" } | null;
  quantity: string | null;
  unit: string | null;
  samples: number;
  meanAbsolute: number | null;
  rootMeanSquare: number | null;
  maximumAbsolute: number | null;
  bulkGapDelta: number | null;
  alignment: "exact" | "linear-1d" | null;
  stateMatching: "unavailable";
}>;

export type QuantumAlignmentPolicy = "exact" | "linear-1d";
const energyScale: Record<string, number> = {eV:1,meV:1e-3,ueV:1e-6,"µeV":1e-6,"μeV":1e-6};
const conversion=(from:string,to:string):number|null=>from===to?1:
  energyScale[from]!==undefined&&energyScale[to]!==undefined?energyScale[from]/energyScale[to]:null;
const plainCoordinates=(scene:ImportedQuantumScene)=>({handedness:scene.source.coordinates.handedness,
  axes:scene.source.coordinates.axes.slice(0,2),units:scene.source.coordinates.units.slice(0,2)});
function pathAxis(values:Float64Array):number[]|null{
  if(values.length%3!==0||values.length<6)return null;
  const axis:number[]=[];
  for(let i=0;i<values.length;i+=3){
    if(!Number.isFinite(values[i])||Math.abs(values[i+1]-values[1])>1e-10||
       Math.abs(values[i+2]-values[2])>1e-10)return null;
    axis.push(values[i]);
  }
  if(axis.some((value,i)=>i>0&&value<=axis[i-1]))return null;
  return axis;
}
function interpolate(axis:number[],values:Float64Array,target:number[]):number[]|null{
  if(values.length!==axis.length||target[0]<axis[0]-1e-10||
      target[target.length-1]>axis[axis.length-1]+1e-10)return null;
  const result:number[]=[];let j=0;
  for(const x of target){
    while(j<axis.length-2&&axis[j+1]<x)j++;
    const weight=(x-axis[j])/(axis[j+1]-axis[j]);
    if(weight < -1e-10||weight>1+1e-10)return null;
    result.push(values[j]*(1-weight)+values[j+1]*weight);
  }
  return result;
}

/** Both inputs must come from independently verified, fingerprint-pinned bundles. */
export function compareVerifiedQuantumScenes(a: ImportedQuantumScene, b: ImportedQuantumScene,
    policy:QuantumAlignmentPolicy="exact"): QuantumComparison {
  const sa = a.source, sb = b.source;
  const reasons: string[] = [];
  const warnings: string[] = [];
  if (sa.provenance.model !== sb.provenance.model) reasons.push("Model differs.");
  if (JSON.stringify(plainCoordinates(a)) !== JSON.stringify(plainCoordinates(b))) reasons.push("Coordinate axes or spatial units differ.");
  if(!["exact","linear-1d"].includes(policy))reasons.push("Unknown interpolation policy.");
  const pa = sa.provenance.parameters ?? {}, pb = sb.provenance.parameters ?? {};
  const metadataDiffs = [...new Set([...Object.keys(pa), ...Object.keys(pb)])].sort()
    .filter(key => pa[key] !== pb[key]).map(key => ({ key, a: pa[key] ?? null, b: pb[key] ?? null }));
  if (metadataDiffs.length) warnings.push("Model parameters differ; residuals compare different parameterizations.");
  const convergence = sa.bands?.grid && sb.bands?.grid && sa.provenance.model === sb.provenance.model &&
    conversion(sb.bands.energyUnit,sa.bands.energyUnit)!==null &&
    JSON.stringify(plainCoordinates(a)) === JSON.stringify(plainCoordinates(b)) &&
    JSON.stringify(sa.bands.grid) !== JSON.stringify(sb.bands.grid) ?
    { quantity: "bulk gap" as const, gridA: sa.bands.grid, gridB: sb.bands.grid,
      absoluteChange: Math.abs(sb.bands.bulkGap*conversion(sb.bands.energyUnit,sa.bands.energyUnit)! - sa.bands.bulkGap), status: "two-resolution-indicator" as const } : null;
  if (convergence) warnings.push("A two-resolution bulk-gap change is shown; asymptotic convergence is not established.");
  let quantity: string | null = null, unit: string | null = null;
  let va: number[] | null = null, vb: number[] | null = null;
  if (sa.bands && sb.bands) {
    const aa = sa.bands, bb = sb.bands;
    if (aa.kind !== bb.kind || (policy==="exact"&&JSON.stringify(aa.grid) !== JSON.stringify(bb.grid)) ||
        aa.energies.length !== bb.energies.length || JSON.stringify(aa.labels) !== JSON.stringify(bb.labels))
      reasons.push("Band shape or identity differs.");
    const scale=conversion(bb.energyUnit,aa.energyUnit);
    if (scale===null) reasons.push("Band energy units are not convertible.");
    const ca = a.arrays.get(aa.coordinates), cb = b.arrays.get(bb.coordinates);
    const exact=!!ca&&!!cb&&ca.length===cb.length&&!ca.some((value,i)=>Math.abs(value-cb[i])>1e-10);
    if(policy==="exact"&&!exact)reasons.push("Band coordinate grids do not align exactly.");
    if(policy==="linear-1d"&&aa.kind!=="path")reasons.push("Linear interpolation supports one-dimensional band paths only.");
    const axisA=ca&&pathAxis(ca),axisB=cb&&pathAxis(cb);
    if(policy==="linear-1d"&&(!axisA||!axisB))reasons.push("Band paths must be strictly increasing in one coordinate with fixed other coordinates.");
    if(policy==="linear-1d"&&axisA&&axisB&&(!aa.energies.every(id=>a.arrays.get(id)?.length===axisA.length)||
      !bb.energies.every(id=>b.arrays.get(id)?.length===axisB.length)))reasons.push("Band sample counts do not match path coordinates.");
    if(policy==="linear-1d"&&axisA&&axisB&&aa.energies.length>1&&bb.energies.length>1){
      const gap=(scene:ImportedQuantumScene,ids:string[],count:number)=>Array.from({length:count},(_,i)=>
        Math.min(...ids.slice(1).map((id,j)=>Math.abs(scene.arrays.get(id)![i]-scene.arrays.get(ids[j])![i]))));
      if(gap(a,aa.energies,axisA.length).some(value=>value<=1e-8)||
         gap(b,bb.energies,axisB.length).some(value=>value<=1e-8))
        reasons.push("Degenerate sampled bands prevent interpolation; state identity is unresolved.");
    }
    if (!reasons.length) {
      quantity = "band energy"; unit = aa.energyUnit;
      va = aa.energies.flatMap(id => [...a.arrays.get(id)!]);
      if(policy==="linear-1d"&&axisA&&axisB){
        const aligned=bb.energies.map(id=>interpolate(axisB,b.arrays.get(id)!,axisA));
        if(aligned.some(item=>item===null))reasons.push("Interpolation would extrapolate beyond the supplied path.");
        else vb=aligned.flatMap(item=>item!.map(value=>value*scale!));
        warnings.push("Linear interpolation is on A's path only. No eigenvectors are supplied: band-index energies are compared, and state matching or unsampled crossings cannot be certified.");
      }else vb=bb.energies.flatMap(id=>[...b.arrays.get(id)!].map(value=>value*scale!));
      if(scale!==1)warnings.push(`B energies converted from ${bb.energyUnit} to ${aa.energyUnit} before subtraction.`);
    }
  } else if (sa.fields?.length === 1 && sb.fields?.length === 1) {
    const fa = sa.fields[0], fb = sb.fields[0];
    if(JSON.stringify(sa.coordinates)!==JSON.stringify(sb.coordinates))reasons.push("Field coordinate axes or units differ.");
    if (JSON.stringify(fa.grid) !== JSON.stringify(fb.grid)) reasons.push("Field grids do not align exactly.");
    const da = sa.datasets.find(item => item.id === fa.real), db = sb.datasets.find(item => item.id === fb.real);
    if (!da || !db || da.unit !== db.unit) reasons.push("Field amplitude units differ.");
    const ia = fa.imaginary ? sa.datasets.find(item => item.id === fa.imaginary) : null;
    const ib = fb.imaginary ? sb.datasets.find(item => item.id === fb.imaginary) : null;
    if (fa.kind === "complex-field" && (!ia || !ib || ia.unit !== da?.unit || ib.unit !== db?.unit))
      reasons.push("Complex field components have inconsistent units.");
    if (fa.kind !== fb.kind) reasons.push("Field kinds differ.");
    if (!reasons.length) {
      quantity = fa.kind === "complex-field" ? "probability density" : "scalar field";
      unit = fa.kind === "complex-field" ? `${da!.unit}²` : da!.unit;
      const ar = a.arrays.get(fa.real)!, br = b.arrays.get(fb.real)!;
      const ai = fa.imaginary ? a.arrays.get(fa.imaginary)! : null;
      const bi = fb.imaginary ? b.arrays.get(fb.imaginary)! : null;
      va = [...ar].map((value, i) => ai ? value * value + ai[i] * ai[i] : value);
      vb = [...br].map((value, i) => bi ? value * value + bi[i] * bi[i] : value);
    }
  } else reasons.push("No matching supported band or field quantity exists.");
  if (va && vb && va.length !== vb.length) reasons.push("Aligned quantity sample counts differ.");
  if (reasons.length || !va || !vb) return { status: "incompatible", reasons, warnings, metadataDiffs, convergence,
    quantity: null, unit: null, samples: 0, meanAbsolute: null, rootMeanSquare: null,
    maximumAbsolute: null, bulkGapDelta: null,alignment:null,stateMatching:"unavailable" };
  let abs = 0, square = 0, max = 0;
  for (let i = 0; i < va.length; i++) { const delta = va[i] - vb[i], magnitude = Math.abs(delta);
    abs += magnitude; square += delta * delta; max = Math.max(max, magnitude); }
  return { status: "compatible", reasons: [], warnings, metadataDiffs, convergence, quantity, unit, samples: va.length,
    meanAbsolute: abs / va.length, rootMeanSquare: Math.sqrt(square / va.length), maximumAbsolute: max,
    bulkGapDelta: sa.bands && sb.bands ? sb.bands.bulkGap*conversion(sb.bands.energyUnit,sa.bands.energyUnit)! - sa.bands.bulkGap : null,
    alignment:policy==="linear-1d"?"linear-1d":"exact",stateMatching:"unavailable" };
}
