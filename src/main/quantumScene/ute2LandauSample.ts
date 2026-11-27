import type {ImportedQuantumScene} from "./importer";

export type Ute2LandauSampleRequest={fingerprint:string;sampleIndex:number};
export type Ute2LandauSample={
  fingerprint:string;runId:string;resultSha256:string;sampleIndex:number;
  amplitudes:[number,number];freeEnergy:number;state:"normal"|"order-1"|"order-2"|"mixed";
  locallyStable:boolean;globalMinimum:boolean;units:{amplitude:"dimensionless";freeEnergy:"dimensionless"};
  qualification:"producer-supplied stationary candidate";
};

/** Inspect an exact imported GL scene. This checks the saved candidate receipt, never minimizes a new model. */
export function inspectVerifiedUte2LandauSample(imported:ImportedQuantumScene,request:Ute2LandauSampleRequest):Ute2LandauSample {
  if(!request||typeof request.fingerprint!=="string"||!/^[a-f0-9]{64}$/.test(request.fingerprint)||
      !Number.isSafeInteger(request.sampleIndex))throw new TypeError("Invalid UTe2 Landau selection");
  const {source,arrays}=imported;
  if(source.schema!=="quantum-scene/v1"||source.provenance.model!=="two_order_landau"||
      source.coordinates.axes.join("|")!=="order amplitude r1|order amplitude r2|free energy F"||
      source.coordinates.units.some(unit=>unit!=="dimensionless"))
    throw new TypeError("Scene is not a declared dimensionless two-order Landau view");
  const positions=(id:string)=>{
    const object=source.objects.find(item=>item.id===id&&item.kind==="point-cloud");
    if(!object||!imported.mappedObjectIds.includes(id))throw new TypeError(`Landau ${id} role is unavailable`);
    const values=arrays.get(object.positions);
    if(!values||values.length%3)throw new TypeError(`Landau ${id} positions are unavailable`);
    return values;
  };
  const candidates=positions("stationary"),stable=positions("stable"),global=positions("global");
  if(candidates.length<3||candidates.length>12||stable.length<3||global.length<3||
      request.sampleIndex<0||request.sampleIndex>=candidates.length/3)
    throw new RangeError("Landau candidate is outside the verified scene");
  const parameters=source.provenance.parameters;
  if(!parameters||!["a1","a2","b1","b2","g"].every(key=>typeof parameters[key]==="number"&&Number.isFinite(parameters[key])))
    throw new TypeError("Landau coefficients are unavailable");
  const [a1,a2,b1,b2,g]=["a1","a2","b1","b2","g"].map(key=>parameters[key] as number);
  const point=(values:Float64Array,index:number)=>[values[3*index],values[3*index+1],values[3*index+2]] as const;
  const key=(p:readonly number[])=>p.join("|");
  const all=new Map(Array.from({length:candidates.length/3},(_,i)=>[key(point(candidates,i)),i]));
  const group=(values:Float64Array)=>Array.from({length:values.length/3},(_,i)=>point(values,i));
  const stablePoints=group(stable),globalPoints=group(global);
  if(stablePoints.some(p=>!all.has(key(p)))||globalPoints.some(p=>!all.has(key(p)))||
      globalPoints.some(p=>!stablePoints.some(s=>key(s)===key(p))))
    throw new TypeError("Landau stability or minimum roles differ from saved candidates");
  const candidatePoints=group(candidates);
  for(const [r1,r2,f] of candidatePoints){
    if(r1<0||r2<0||Math.abs(f-(a1*r1*r1+a2*r2*r2+b1*r1**4/2+b2*r2**4/2+g*r1*r1*r2*r2))>1e-8)
      throw new TypeError("Landau candidate free energy disagrees with declared coefficients");
  }
  const minimum=Math.min(...candidatePoints.map(p=>p[2]));
  if(globalPoints.some(p=>Math.abs(p[2]-minimum)>1e-8))
    throw new TypeError("Landau minimum role disagrees with saved candidate energies");
  const [r1,r2,f]=point(candidates,request.sampleIndex);
  return {fingerprint:request.fingerprint,runId:source.provenance.runId,
    resultSha256:source.provenance.resultSha256,sampleIndex:request.sampleIndex,
    amplitudes:[r1,r2],freeEnergy:f,
    state:r1<=1e-9?r2<=1e-9?"normal":"order-2":r2<=1e-9?"order-1":"mixed",
    locallyStable:stablePoints.some(p=>key(p)===key([r1,r2,f])),
    globalMinimum:globalPoints.some(p=>key(p)===key([r1,r2,f])),
    units:{amplitude:"dimensionless",freeEnergy:"dimensionless"},
    qualification:"producer-supplied stationary candidate"};
}
