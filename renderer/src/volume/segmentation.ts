import { marchingCubesVolume } from "../math/marchingCubes";
import type { VolumeGrid } from "../scene/datasets";
import type { SurfaceMesh } from "../scene/renderPrimitives";
import { volumeGridIndexToWorld } from "./spatial";

export type VolumeConnectivity = 6 | 18 | 26;
export type VolumeRoi = { min: [number, number, number]; max: [number, number, number] } | Uint8Array | null;
export type VolumeLabelDefinition = { id: number; name: string; color: string; visible: boolean; locked: boolean };
export type VolumeSegmentationProvenance = {
  operation: string;
  sourceVolumeId: string;
  sourceVolumeRevision: number;
  parameters: Readonly<Record<string, number | string | boolean>>;
  createdAt: number;
};
export type BinaryVolumeMask = {
  kind: "binary-mask";
  dimensions: [number, number, number];
  data: Uint8Array;
  interpolation: "nearest";
  provenance: VolumeSegmentationProvenance;
};
export type IntegerVolumeLabelMap = {
  kind: "label-map";
  dimensions: [number, number, number];
  data: Uint32Array;
  interpolation: "nearest";
  labels: VolumeLabelDefinition[];
  provenance: VolumeSegmentationProvenance;
};
export type VolumeLabelStatistics = {
  label: number;
  voxelCount: number;
  physicalVolume: number;
  centroid: [number, number, number] | null;
  bounds: { min: [number, number, number]; max: [number, number, number] } | null;
};
export type VolumeSegmentationPreview = { token: string; result: IntegerVolumeLabelMap; operation: string; createdAt: number };
export type VolumeSegmentationSnapshot = { id: string; labelMap: IntegerVolumeLabelMap; operation: string; timestamp: number };
export type SerializedVolumeLabelMap = Omit<IntegerVolumeLabelMap, "data"> & { data: number[] };

const idx = (dims: readonly [number,number,number],x:number,y:number,z:number):number=>x+dims[0]*(y+dims[1]*z);
const coords = (dims:readonly[number,number,number],index:number):[number,number,number]=>{const z=Math.floor(index/(dims[0]*dims[1]));const rest=index-z*dims[0]*dims[1];const y=Math.floor(rest/dims[0]);return[rest-y*dims[0],y,z];};
const assertLength=(dims:readonly[number,number,number],length:number)=>{const expected=dims[0]*dims[1]*dims[2];if(length!==expected)throw new Error(`Categorical Volume payload has ${length} samples; expected ${expected}.`);};
const copyLabelMap=(map:IntegerVolumeLabelMap):IntegerVolumeLabelMap=>({...map,dimensions:[...map.dimensions],data:new Uint32Array(map.data),labels:map.labels.map(label=>({...label})),provenance:{...map.provenance,parameters:{...map.provenance.parameters}}});
const inRoi=(roi:VolumeRoi,dims:readonly[number,number,number],index:number):boolean=>{if(!roi)return true;if(roi instanceof Uint8Array)return roi[index]===1;const [x,y,z]=coords(dims,index);return x>=roi.min[0]&&y>=roi.min[1]&&z>=roi.min[2]&&x<=roi.max[0]&&y<=roi.max[1]&&z<=roi.max[2];};
const checkpoint=(cancelled?:()=>boolean)=>{if(cancelled?.())throw new DOMException("Volume segmentation cancelled.","AbortError");};
export const volumeNeighborOffsets=(connectivity:VolumeConnectivity):readonly [number,number,number][]=>{const offsets:[number,number,number][]=[];for(let z=-1;z<=1;z+=1)for(let y=-1;y<=1;y+=1)for(let x=-1;x<=1;x+=1){if(!x&&!y&&!z)continue;const d=Math.abs(x)+Math.abs(y)+Math.abs(z);if(connectivity===6?d===1:connectivity===18?d<=2:true)offsets.push([x,y,z]);}return offsets;};
const provenance=(operation:string,sourceVolumeId:string,sourceVolumeRevision:number,parameters:Record<string,number|string|boolean>,createdAt=Date.now()):VolumeSegmentationProvenance=>({operation,sourceVolumeId,sourceVolumeRevision,parameters,createdAt});

export const thresholdVolumeMask=(grid:VolumeGrid,low:number,high=Number.POSITIVE_INFINITY,options:{roi?:VolumeRoi;invert?:boolean;cancelled?:()=>boolean;sourceVolumeId?:string;sourceVolumeRevision?:number}={}):BinaryVolumeMask=>{const data=new Uint8Array(grid.scalars.length);for(let i=0;i<data.length;i+=1){if((i&8191)===0)checkpoint(options.cancelled);if(!inRoi(options.roi??null,grid.dims,i))continue;const value=grid.scalars[i];const selected=Number.isFinite(value)&&value>=low&&value<=high;data[i]=(options.invert?!selected:selected)?1:0;}return{kind:"binary-mask",dimensions:[...grid.dims],data,interpolation:"nearest",provenance:provenance(options.invert?"invert-threshold":"range-threshold",options.sourceVolumeId??"volume",options.sourceVolumeRevision??1,{low,high:Number.isFinite(high)?high:"infinity"})};};
export const invertVolumeMask=(mask:BinaryVolumeMask,roi:VolumeRoi=null):BinaryVolumeMask=>({...mask,data:mask.data.map((value,index)=>inRoi(roi,mask.dimensions,index)?(value?0:1):value),provenance:provenance("invert",mask.provenance.sourceVolumeId,mask.provenance.sourceVolumeRevision,{})});
const binary=(operation:"union"|"intersection"|"subtraction",a:BinaryVolumeMask,b:BinaryVolumeMask):BinaryVolumeMask=>{if(a.dimensions.some((v,i)=>v!==b.dimensions[i]))throw new Error("Mask dimensions must match.");const data=new Uint8Array(a.data.length);for(let i=0;i<data.length;i+=1)data[i]=operation==="union"?(a.data[i]||b.data[i]?1:0):operation==="intersection"?(a.data[i]&&b.data[i]?1:0):(a.data[i]&&!b.data[i]?1:0);return{...a,data,provenance:provenance(operation,a.provenance.sourceVolumeId,a.provenance.sourceVolumeRevision,{})};};
export const unionVolumeMasks=(a:BinaryVolumeMask,b:BinaryVolumeMask)=>binary("union",a,b);
export const intersectVolumeMasks=(a:BinaryVolumeMask,b:BinaryVolumeMask)=>binary("intersection",a,b);
export const subtractVolumeMasks=(a:BinaryVolumeMask,b:BinaryVolumeMask)=>binary("subtraction",a,b);

export const connectedComponentsLabelMap=(mask:BinaryVolumeMask,connectivity:VolumeConnectivity=6,options:{roi?:VolumeRoi;cancelled?:()=>boolean}={}):IntegerVolumeLabelMap=>{assertLength(mask.dimensions,mask.data.length);const labels=new Uint32Array(mask.data.length);const queue=new Uint32Array(mask.data.length);const [nx,ny,nz]=mask.dimensions;const offsets=volumeNeighborOffsets(connectivity);let label=0;for(let seed=0;seed<labels.length;seed+=1){if(!mask.data[seed]||labels[seed]||!inRoi(options.roi??null,mask.dimensions,seed))continue;checkpoint(options.cancelled);label+=1;let head=0,tail=0;queue[tail++]=seed;labels[seed]=label;while(head<tail){const current=queue[head++];const[x,y,z]=coords(mask.dimensions,current);for(const[dx,dy,dz]of offsets){const xx=x+dx,yy=y+dy,zz=z+dz;if(xx<0||yy<0||zz<0||xx>=nx||yy>=ny||zz>=nz)continue;const next=idx(mask.dimensions,xx,yy,zz);if(mask.data[next]&&!labels[next]&&inRoi(options.roi??null,mask.dimensions,next)){labels[next]=label;queue[tail++]=next;}}}}return{kind:"label-map",dimensions:[...mask.dimensions],data:labels,interpolation:"nearest",labels:Array.from({length:label},(_,i)=>({id:i+1,name:`Region ${i+1}`,color:defaultLabelColor(i+1),visible:true,locked:false})),provenance:provenance("connected-components",mask.provenance.sourceVolumeId,mask.provenance.sourceVolumeRevision,{connectivity})};};

export const floodFillVolumeMask=(mask:BinaryVolumeMask,seed:[number,number,number],connectivity:VolumeConnectivity=6,options:{target?:0|1;roi?:VolumeRoi;cancelled?:()=>boolean}={}):BinaryVolumeMask=>{const[nx,ny,nz]=mask.dimensions;if(seed.some((v,i)=>v<0||v>=mask.dimensions[i]))throw new Error("Flood-fill seed is outside the Volume.");const start=idx(mask.dimensions,...seed);const target=options.target??mask.data[start] as 0|1;const data=new Uint8Array(mask.data.length);const visited=new Uint8Array(mask.data.length);const queue=new Uint32Array(mask.data.length);let head=0,tail=0;queue[tail++]=start;visited[start]=1;while(head<tail){checkpoint(options.cancelled);const current=queue[head++];if(mask.data[current]!==target||!inRoi(options.roi??null,mask.dimensions,current))continue;data[current]=1;const[x,y,z]=coords(mask.dimensions,current);for(const[dx,dy,dz]of volumeNeighborOffsets(connectivity)){const xx=x+dx,yy=y+dy,zz=z+dz;if(xx<0||yy<0||zz<0||xx>=nx||yy>=ny||zz>=nz)continue;const next=idx(mask.dimensions,xx,yy,zz);if(!visited[next]){visited[next]=1;queue[tail++]=next;}}}return{...mask,data,provenance:provenance("flood-fill",mask.provenance.sourceVolumeId,mask.provenance.sourceVolumeRevision,{connectivity,target})};};

const morph=(mask:BinaryVolumeMask,mode:"dilate"|"erode",iterations:number,connectivity:VolumeConnectivity,roi:VolumeRoi,cancelled?:()=>boolean):BinaryVolumeMask=>{let source=new Uint8Array(mask.data);const[nx,ny,nz]=mask.dimensions;const offsets=volumeNeighborOffsets(connectivity);for(let pass=0;pass<Math.max(0,Math.floor(iterations));pass+=1){const output=new Uint8Array(source);for(let z=0;z<nz;z+=1){checkpoint(cancelled);for(let y=0;y<ny;y+=1)for(let x=0;x<nx;x+=1){const i=idx(mask.dimensions,x,y,z);if(!inRoi(roi,mask.dimensions,i))continue;let result=mode==="erode"?source[i]===1:source[i]===1;for(const[dx,dy,dz]of offsets){const xx=x+dx,yy=y+dy,zz=z+dz;const value=xx<0||yy<0||zz<0||xx>=nx||yy>=ny||zz>=nz?0:source[idx(mask.dimensions,xx,yy,zz)];if(mode==="dilate"&&value){result=true;break;}if(mode==="erode"&&!value){result=false;break;}}output[i]=result?1:0;}}source=output;}return{...mask,data:source,provenance:provenance(mode,mask.provenance.sourceVolumeId,mask.provenance.sourceVolumeRevision,{iterations,connectivity})};};
export const dilateVolumeMask=(mask:BinaryVolumeMask,iterations=1,connectivity:VolumeConnectivity=6,roi:VolumeRoi=null,cancelled?:()=>boolean)=>morph(mask,"dilate",iterations,connectivity,roi,cancelled);
export const erodeVolumeMask=(mask:BinaryVolumeMask,iterations=1,connectivity:VolumeConnectivity=6,roi:VolumeRoi=null,cancelled?:()=>boolean)=>morph(mask,"erode",iterations,connectivity,roi,cancelled);
export const openVolumeMask=(mask:BinaryVolumeMask,iterations=1,connectivity:VolumeConnectivity=6)=>dilateVolumeMask(erodeVolumeMask(mask,iterations,connectivity),iterations,connectivity);
export const closeVolumeMask=(mask:BinaryVolumeMask,iterations=1,connectivity:VolumeConnectivity=6)=>erodeVolumeMask(dilateVolumeMask(mask,iterations,connectivity),iterations,connectivity);
export const fillVolumeMaskHoles=(mask:BinaryVolumeMask,connectivity:VolumeConnectivity=6):BinaryVolumeMask=>{const inverse=invertVolumeMask(mask);const outside=new Uint8Array(mask.data.length);const[nx,ny,nz]=mask.dimensions;for(let z=0;z<nz;z+=1)for(let y=0;y<ny;y+=1)for(let x=0;x<nx;x+=1){if(x!==0&&y!==0&&z!==0&&x!==nx-1&&y!==ny-1&&z!==nz-1)continue;const i=idx(mask.dimensions,x,y,z);if(!inverse.data[i]||outside[i])continue;const part=floodFillVolumeMask(inverse,[x,y,z],connectivity);for(let j=0;j<outside.length;j+=1)outside[j]||=part.data[j];}const data=new Uint8Array(mask.data.length);for(let i=0;i<data.length;i+=1)data[i]=mask.data[i]||!outside[i]?1:0;return{...mask,data,provenance:provenance("fill-holes",mask.provenance.sourceVolumeId,mask.provenance.sourceVolumeRevision,{connectivity})};};
export const removeSmallMaskComponents=(mask:BinaryVolumeMask,minimumSize:number,connectivity:VolumeConnectivity=6):BinaryVolumeMask=>{const map=connectedComponentsLabelMap(mask,connectivity);const counts=new Uint32Array(map.labels.length+1);for(const label of map.data)counts[label]+=1;const data=new Uint8Array(mask.data.length);for(let i=0;i<data.length;i+=1)data[i]=map.data[i]&&counts[map.data[i]]>=minimumSize?1:0;return{...mask,data,provenance:provenance("remove-small-components",mask.provenance.sourceVolumeId,mask.provenance.sourceVolumeRevision,{minimumSize,connectivity})};};
export const distanceTransformVolumeMask=(mask:BinaryVolumeMask,spacing:readonly[number,number,number]=[1,1,1]):Float32Array=>{const foreground:number[]=[];for(let i=0;i<mask.data.length;i+=1)if(mask.data[i])foreground.push(i);const output=new Float32Array(mask.data.length);for(let i=0;i<output.length;i+=1){if(mask.data[i])continue;const[x,y,z]=coords(mask.dimensions,i);let best=Infinity;for(const candidate of foreground){const[cx,cy,cz]=coords(mask.dimensions,candidate);best=Math.min(best,Math.hypot((x-cx)*spacing[0],(y-cy)*spacing[1],(z-cz)*spacing[2]));}output[i]=best;}return output;};

export const defaultLabelColor=(id:number):string=>["#3b82f6","#ef4444","#22c55e","#f59e0b","#a855f7","#06b6d4"][(Math.max(1,id)-1)%6];
export const labelStatistics=(map:IntegerVolumeLabelMap,grid:Pick<VolumeGrid,"spacing"|"origin"|"direction"|"centering">):VolumeLabelStatistics[]=>{const ids=[...new Set(map.data)].filter(id=>id!==0).sort((a,b)=>a-b);const volume=Math.abs((grid.spacing?.[0]??1)*(grid.spacing?.[1]??1)*(grid.spacing?.[2]??1));const pseudo:VolumeGrid={dims:map.dimensions,scalars:new Float32Array(0),...grid};return ids.map(label=>{let count=0;const sum:[number,number,number]=[0,0,0],min:[number,number,number]=[Infinity,Infinity,Infinity],max:[number,number,number]=[-Infinity,-Infinity,-Infinity];for(let i=0;i<map.data.length;i+=1)if(map.data[i]===label){const world=volumeGridIndexToWorld(pseudo,coords(map.dimensions,i));count+=1;for(let a=0;a<3;a+=1){sum[a]+=world[a];min[a]=Math.min(min[a],world[a]);max[a]=Math.max(max[a],world[a]);}}return{label,voxelCount:count,physicalVolume:count*volume,centroid:count?sum.map(v=>v/count)as[number,number,number]:null,bounds:count?{min,max}:null};});};
const locked=(map:IntegerVolumeLabelMap,id:number)=>map.labels.some(label=>label.id===id&&label.locked);
export const relabelVolume=(map:IntegerVolumeLabelMap,from:number,to:number):IntegerVolumeLabelMap=>{if(locked(map,from))return copyLabelMap(map);const data=new Uint32Array(map.data);for(let i=0;i<data.length;i+=1)if(data[i]===from)data[i]=to;const labels=map.labels.filter(l=>l.id!==from&&l.id!==to);const target=map.labels.find(l=>l.id===to)??{id:to,name:`Label ${to}`,color:defaultLabelColor(to),visible:true,locked:false};labels.push({...target});labels.sort((a,b)=>a.id-b.id);return{...map,data,labels,provenance:provenance("relabel",map.provenance.sourceVolumeId,map.provenance.sourceVolumeRevision,{from,to})};};
export const mergeVolumeLabels=(map:IntegerVolumeLabelMap,ids:readonly number[],target:number):IntegerVolumeLabelMap=>ids.reduce((result,id)=>id===target?result:relabelVolume(result,id,target),map);
export const splitDisconnectedVolumeLabel=(map:IntegerVolumeLabelMap,label:number,connectivity:VolumeConnectivity=6):IntegerVolumeLabelMap=>{if(locked(map,label))return copyLabelMap(map);const mask:BinaryVolumeMask={kind:"binary-mask",dimensions:[...map.dimensions],data:Uint8Array.from(map.data,v=>v===label?1:0),interpolation:"nearest",provenance:map.provenance};const components=connectedComponentsLabelMap(mask,connectivity);if(components.labels.length<=1)return copyLabelMap(map);const data=new Uint32Array(map.data);let next=Math.max(0,...map.labels.map(l=>l.id))+1;const remap=new Map<number,number>([[1,label]]);for(let i=2;i<=components.labels.length;i+=1)remap.set(i,next++);for(let i=0;i<data.length;i+=1)if(components.data[i])data[i]=remap.get(components.data[i])!;const labels=map.labels.map(l=>({...l}));for(const[id,newId]of remap)if(id>1)labels.push({id:newId,name:`${map.labels.find(l=>l.id===label)?.name??`Label ${label}`} ${id}`,color:defaultLabelColor(newId),visible:true,locked:false});return{...map,data,labels,provenance:provenance("split",map.provenance.sourceVolumeId,map.provenance.sourceVolumeRevision,{label,connectivity})};};
export const updateVolumeLabel=(map:IntegerVolumeLabelMap,id:number,patch:Partial<Omit<VolumeLabelDefinition,"id">>):IntegerVolumeLabelMap=>({...map,labels:map.labels.map(label=>label.id===id?{...label,...patch}:label)});
export const extractLabelBoundaryMesh=(map:IntegerVolumeLabelMap,grid:Pick<VolumeGrid,"spacing"|"origin"|"direction"|"centering">,labels:readonly number[]):SurfaceMesh|null=>{const selected=new Set(labels);const scalars=Float32Array.from(map.data,value=>selected.has(value)?1:0);const result=marchingCubesVolume({dims:[...map.dimensions],scalars,...grid},.5);if(!result)return null;return{label:`Label boundary ${labels.join(", ")}`,positions:result.positions,indices:result.indices,source:{kind:"derivedVolume",role:"snapshot",resultId:`label-boundary:${labels.join("-")}`,sourceVolumeId:map.provenance.sourceVolumeId,sourceVolumeRevision:map.provenance.sourceVolumeRevision,sourceSampledGridRevision:map.provenance.sourceVolumeRevision,isoValue:.5,algorithm:"marching-cubes",backend:"cpu-fallback",correspondenceId:"label-map",createdAt:Date.now()},adjacency:null,meanEdgeLength:null,validation:null};};
export const resampleLabelMapNearest=(map:IntegerVolumeLabelMap,target:[number,number,number]):IntegerVolumeLabelMap=>{const data=new Uint32Array(target[0]*target[1]*target[2]);for(let z=0;z<target[2];z+=1)for(let y=0;y<target[1];y+=1)for(let x=0;x<target[0];x+=1){const sx=Math.round(x/Math.max(1,target[0]-1)*(map.dimensions[0]-1));const sy=Math.round(y/Math.max(1,target[1]-1)*(map.dimensions[1]-1));const sz=Math.round(z/Math.max(1,target[2]-1)*(map.dimensions[2]-1));data[idx(target,x,y,z)]=map.data[idx(map.dimensions,sx,sy,sz)];}return{...map,dimensions:[...target],data,interpolation:"nearest",provenance:provenance("nearest-resample",map.provenance.sourceVolumeId,map.provenance.sourceVolumeRevision,{nx:target[0],ny:target[1],nz:target[2]})};};
export const serializeVolumeLabelMap=(map:IntegerVolumeLabelMap):SerializedVolumeLabelMap=>({...map,data:Array.from(map.data),labels:map.labels.map(l=>({...l}))});
export const restoreVolumeLabelMap=(value:SerializedVolumeLabelMap):IntegerVolumeLabelMap=>{assertLength(value.dimensions,value.data.length);if(value.interpolation!=="nearest")throw new Error("Label maps require nearest-neighbor interpolation.");for(const label of value.data)if(!Number.isSafeInteger(label)||label<0||label>0xffffffff)throw new Error("Label IDs must be unsigned 32-bit integers.");return{...value,dimensions:[...value.dimensions],data:Uint32Array.from(value.data),labels:value.labels.map(l=>({...l}))};};

export class VolumeSegmentationSession {
  private currentMap: IntegerVolumeLabelMap | null = null;
  private undoStack: VolumeSegmentationSnapshot[] = [];
  private redoStack: VolumeSegmentationSnapshot[] = [];
  private previewValue: VolumeSegmentationPreview | null = null;
  private sequence = 1;
  private readonly maximumHistory: number;

  constructor(initial?: IntegerVolumeLabelMap, maximumHistory = 32) {
    this.maximumHistory = Math.max(1, Math.floor(maximumHistory));
    if (initial) this.currentMap = copyLabelMap(initial);
  }

  current(): IntegerVolumeLabelMap | null {
    return this.currentMap ? copyLabelMap(this.currentMap) : null;
  }

  preview(): VolumeSegmentationPreview | null {
    return this.previewValue ? { ...this.previewValue, result: copyLabelMap(this.previewValue.result) } : null;
  }

  createPreview(result: IntegerVolumeLabelMap, operation: string, now = Date.now()): VolumeSegmentationPreview {
    this.previewValue = {
      token: `segmentation-preview-${this.sequence++}`,
      result: copyLabelMap(result),
      operation,
      createdAt: now,
    };
    return this.preview()!;
  }

  cancelPreview(): void {
    this.previewValue = null;
  }

  applyPreview(now = Date.now()): IntegerVolumeLabelMap | null {
    if (!this.previewValue) return this.current();
    if (this.currentMap) {
      this.undoStack.push({
        id: `segmentation-${this.sequence++}`,
        labelMap: copyLabelMap(this.currentMap),
        operation: this.previewValue.operation,
        timestamp: now,
      });
      this.undoStack = this.undoStack.slice(-this.maximumHistory);
    }
    this.currentMap = copyLabelMap(this.previewValue.result);
    this.previewValue = null;
    this.redoStack = [];
    return this.current();
  }

  replace(result: IntegerVolumeLabelMap, operation: string, now = Date.now()): IntegerVolumeLabelMap | null {
    this.createPreview(result, operation, now);
    return this.applyPreview(now);
  }

  undo(now = Date.now()): IntegerVolumeLabelMap | null {
    const prior = this.undoStack.pop();
    if (!prior) return this.current();
    if (this.currentMap) {
      this.redoStack.push({
        id: `segmentation-${this.sequence++}`,
        labelMap: copyLabelMap(this.currentMap),
        operation: "undo",
        timestamp: now,
      });
      this.redoStack = this.redoStack.slice(-this.maximumHistory);
    }
    this.currentMap = copyLabelMap(prior.labelMap);
    this.previewValue = null;
    return this.current();
  }

  redo(now = Date.now()): IntegerVolumeLabelMap | null {
    const next = this.redoStack.pop();
    if (!next) return this.current();
    if (this.currentMap) {
      this.undoStack.push({
        id: `segmentation-${this.sequence++}`,
        labelMap: copyLabelMap(this.currentMap),
        operation: "redo",
        timestamp: now,
      });
      this.undoStack = this.undoStack.slice(-this.maximumHistory);
    }
    this.currentMap = copyLabelMap(next.labelMap);
    this.previewValue = null;
    return this.current();
  }

  summary() {
    const snapshots = [
      ...(this.currentMap ? [this.currentMap] : []),
      ...this.undoStack.map((snapshot) => snapshot.labelMap),
      ...this.redoStack.map((snapshot) => snapshot.labelMap),
      ...(this.previewValue ? [this.previewValue.result] : []),
    ];
    return {
      undoDepth: this.undoStack.length,
      redoDepth: this.redoStack.length,
      hasPreview: !!this.previewValue,
      ownedBuffers: snapshots.length,
      ownedBytes: snapshots.reduce((sum, map) => sum + map.data.byteLength, 0),
    };
  }

  clear(): void {
    this.currentMap = null;
    this.previewValue = null;
    this.undoStack = [];
    this.redoStack = [];
  }
}
