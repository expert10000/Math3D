import type { Image2D, SurfaceMesh } from "../scene/renderPrimitives";
import type { VolumeGrid } from "../scene/datasets";
import type { VolumeObject, VolumeScalarType } from "./contracts";
import type { ManagedVolumeArray } from "./typedArrayStore";
import type { BinaryVolumeMask, IntegerVolumeLabelMap } from "./segmentation";

export type VolumeScientificFormat = "raw" | "npy" | "vti";
export type VolumeByteOrder = "little-endian" | "big-endian";
export type ScientificVolumeMetadata = {
  dimensions: [number, number, number];
  spacing: [number, number, number];
  origin: [number, number, number];
  direction: [number, number, number, number, number, number, number, number, number];
  centering: "point" | "cell";
  scalarType: VolumeScalarType;
  components: number;
  coordinateSystem: string;
  positionUnits: string;
  valueUnits: string;
  missingValuePolicy: "none" | "nan" | "sentinel";
  missingValueSentinel: number | null;
  byteOrder: VolumeByteOrder;
};
export type ScientificVolumeFile = { fileName: string; bytes: Uint8Array };
export type ScientificVolumeArtifact = { fileName: string; bytes: Uint8Array; mediaType: string };
export type ScientificVolumeProbe = {
  format: VolumeScientificFormat;
  fileName: string;
  metadata: ScientificVolumeMetadata;
  expectedBytes: number;
  warnings: string[];
};
export type ScientificVolumeImport = ScientificVolumeProbe & {
  values: ManagedVolumeArray;
  externalReference: { fileName: string; byteLength: number; contentHash: string };
};
export type ScientificVolumeImportOptions = {
  maximumBytes?: number;
  cancelled?: () => boolean;
  onProgress?: (progress: number, phase: string) => void;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const identityDirection: ScientificVolumeMetadata["direction"] = [1,0,0,0,1,0,0,0,1];
const bytesPerScalar: Record<VolumeScalarType, number> = { float32:4,float64:8,int32:4,uint32:4,int16:2,uint16:2,int8:1,uint8:1 };
const scalarCtor = (type: VolumeScalarType, buffer: ArrayBuffer): ManagedVolumeArray => {
  if(type==="float64")return new Float64Array(buffer); if(type==="int32")return new Int32Array(buffer); if(type==="uint32")return new Uint32Array(buffer); if(type==="int16")return new Int16Array(buffer); if(type==="uint16")return new Uint16Array(buffer); if(type==="int8")return new Int8Array(buffer); if(type==="uint8")return new Uint8Array(buffer); return new Float32Array(buffer);
};
const elementCount=(metadata:ScientificVolumeMetadata)=>metadata.dimensions[0]*metadata.dimensions[1]*metadata.dimensions[2]*metadata.components;
const expectedBytes=(metadata:ScientificVolumeMetadata)=>elementCount(metadata)*bytesPerScalar[metadata.scalarType];
const checkCancelled=(options:ScientificVolumeImportOptions)=>{if(options.cancelled?.())throw new DOMException("Scientific Volume I/O cancelled.","AbortError");};
const validateMetadata=(metadata:ScientificVolumeMetadata,maximumBytes:number)=>{if(!metadata.dimensions.every(value=>Number.isSafeInteger(value)&&value>0))throw new Error("Volume dimensions must be positive integers.");if(!metadata.spacing.every(value=>Number.isFinite(value)&&value!==0))throw new Error("Volume spacing must be finite and non-zero.");if(!metadata.origin.every(Number.isFinite)||!metadata.direction.every(Number.isFinite))throw new Error("Volume spatial transform contains non-finite values.");if(!Number.isSafeInteger(metadata.components)||metadata.components<1||metadata.components>64)throw new Error("Volume component count is unsupported.");const bytes=expectedBytes(metadata);if(!Number.isSafeInteger(bytes)||bytes>maximumBytes)throw new Error(`Volume allocation of ${bytes} bytes exceeds the ${maximumBytes} byte safety limit.`);};
const hashBytes=(bytes:Uint8Array):string=>{let hash=2166136261;for(const value of bytes){hash^=value;hash=Math.imul(hash,16777619);}return(hash>>>0).toString(36);};
const baseName=(fileName:string)=>fileName.replace(/\.[^.]+$/u,"");
const extension=(fileName:string)=>fileName.split(".").pop()?.toLowerCase()??"";
const findSidecar=(files:readonly ScientificVolumeFile[],primary:string)=>files.find(file=>file.fileName.toLowerCase()===`${baseName(primary)}.json`.toLowerCase()||file.fileName.toLowerCase()===`${primary}.json`.toLowerCase());
const metadataFromUnknown = (value: unknown): ScientificVolumeMetadata => {
  if (!value || typeof value !== "object") {
    throw new Error("Volume metadata sidecar must be a JSON object.");
  }
  const input = value as Record<string, unknown>;
  const tuple = (key: string, length: number, fallback?: readonly number[]): number[] => {
    const source = input[key] ?? fallback;
    if (!Array.isArray(source) || source.length !== length || !source.every((item) => typeof item === "number")) {
      throw new Error(`Volume metadata ${key} is invalid.`);
    }
    return source as number[];
  };
  const scalarType = String(input.scalarType ?? "float32") as VolumeScalarType;
  if (!(scalarType in bytesPerScalar)) throw new Error(`Unsupported scalar type: ${scalarType}.`);
  return {
    dimensions: tuple("dimensions", 3) as [number, number, number],
    spacing: tuple("spacing", 3, [1, 1, 1]) as [number, number, number],
    origin: tuple("origin", 3, [0, 0, 0]) as [number, number, number],
    direction: tuple("direction", 9, identityDirection) as ScientificVolumeMetadata["direction"],
    centering: input.centering === "cell" ? "cell" : "point",
    scalarType,
    components: Number(input.components ?? 1),
    coordinateSystem: String(input.coordinateSystem ?? "world-cartesian"),
    positionUnits: String(input.positionUnits ?? "unit"),
    valueUnits: String(input.valueUnits ?? "unitless"),
    missingValuePolicy: input.missingValuePolicy === "nan" ? "nan" : input.missingValuePolicy === "sentinel" ? "sentinel" : "none",
    missingValueSentinel: typeof input.missingValueSentinel === "number" ? input.missingValueSentinel : null,
    byteOrder: input.byteOrder === "big-endian" ? "big-endian" : "little-endian",
  };
};

const copyEndian=(bytes:Uint8Array,type:VolumeScalarType,order:VolumeByteOrder):ManagedVolumeArray=>{const width=bytesPerScalar[type];if(bytes.byteLength%width)throw new Error("Volume payload is truncated or misaligned.");const buffer=bytes.slice().buffer;if(width===1||order==="little-endian")return scalarCtor(type,buffer);const view=new DataView(buffer);for(let offset=0;offset<buffer.byteLength;offset+=width)for(let left=0,right=width-1;left<right;left+=1,right-=1){const a=view.getUint8(offset+left);view.setUint8(offset+left,view.getUint8(offset+right));view.setUint8(offset+right,a);}return scalarCtor(type,buffer);};
const rawMetadata=(files:readonly ScientificVolumeFile[],primary:ScientificVolumeFile):ScientificVolumeMetadata=>{const sidecar=findSidecar(files,primary.fileName);if(!sidecar)throw new Error("RAW import requires an explicit JSON metadata sidecar.");try{return metadataFromUnknown(JSON.parse(textDecoder.decode(sidecar.bytes)));}catch(error){throw new Error(`Malformed RAW metadata: ${error instanceof Error?error.message:String(error)}`);}};

const npyType=(descriptor:string):{type:VolumeScalarType;order:VolumeByteOrder}=>{const order=descriptor.startsWith(">")?"big-endian":"little-endian";const code=descriptor.replace(/^[<>=|]/u,"");const types:Record<string,VolumeScalarType>={f4:"float32",f8:"float64",i4:"int32",u4:"uint32",i2:"int16",u2:"uint16",i1:"int8",u1:"uint8"};const type=types[code];if(!type)throw new Error(`Unsupported NPY dtype: ${descriptor}.`);return{type,order};};
const parseNpyHeader=(bytes:Uint8Array)=>{if(bytes.length<10||String.fromCharCode(...bytes.slice(0,6))!=="NUMPY")throw new Error("Malformed NPY magic header.");const major=bytes[6];const headerLength=major===1?bytes[8]|(bytes[9]<<8):new DataView(bytes.buffer,bytes.byteOffset+8,4).getUint32(0,true);const offset=major===1?10:12;if(major!==1&&major!==2)throw new Error(`Unsupported NPY version ${major}.${bytes[7]}.`);if(offset+headerLength>bytes.length)throw new Error("Truncated NPY header.");const header=textDecoder.decode(bytes.slice(offset,offset+headerLength));const descr=header.match(/['"]descr['"]\s*:\s*['"]([^'"]+)['"]/u)?.[1];const fortran=header.match(/['"]fortran_order['"]\s*:\s*(True|False)/u)?.[1];const shapeText=header.match(/['"]shape['"]\s*:\s*\(([^)]*)\)/u)?.[1];if(!descr||!fortran||shapeText==null)throw new Error("Malformed NPY header fields.");if(fortran==="True")throw new Error("Fortran-order NPY arrays are unsupported; convert to C order.");const shape=shapeText.split(",").map(value=>value.trim()).filter(Boolean).map(Number);if(shape.length<3||shape.length>4||!shape.every(value=>Number.isSafeInteger(value)&&value>0))throw new Error("NPY shape must be (z,y,x) or (z,y,x,components).");return{descriptor:descr,shape,offset:offset+headerLength};};
const metadataSidecar=(files:readonly ScientificVolumeFile[],primary:ScientificVolumeFile,fallback:ScientificVolumeMetadata):ScientificVolumeMetadata=>{const sidecar=findSidecar(files,primary.fileName);if(!sidecar)return fallback;try{return{...fallback,...metadataFromUnknown(JSON.parse(textDecoder.decode(sidecar.bytes))),dimensions:fallback.dimensions,components:fallback.components,scalarType:fallback.scalarType,byteOrder:fallback.byteOrder};}catch(error){throw new Error(`Malformed NPY metadata sidecar: ${error instanceof Error?error.message:String(error)}`);}};
const npyMetadata=(files:readonly ScientificVolumeFile[],primary:ScientificVolumeFile)=>{const header=parseNpyHeader(primary.bytes);const dtype=npyType(header.descriptor);const shape=header.shape;const dimensions:[number,number,number]=[shape[2],shape[1],shape[0]];const components=shape.length===4?shape[3]:1;const fallback:ScientificVolumeMetadata={dimensions,spacing:[1,1,1],origin:[0,0,0],direction:[...identityDirection],centering:"point",scalarType:dtype.type,components,coordinateSystem:"world-cartesian",positionUnits:"unit",valueUnits:"unitless",missingValuePolicy:dtype.type.startsWith("float")?"nan":"none",missingValueSentinel:null,byteOrder:dtype.order};return{header,metadata:metadataSidecar(files,primary,fallback)};};

const attribute=(tag:string,name:string)=>tag.match(new RegExp(`${name}=["']([^"']+)["']`,"i"))?.[1]??null;
const numberTuple=(text:string|null,count:number,label:string):number[]=>{const values=(text??"").trim().split(/\s+/u).filter(Boolean).map(Number);if(values.length!==count||!values.every(Number.isFinite))throw new Error(`VTI ${label} is invalid.`);return values;};
const vtkType=(name:string):VolumeScalarType=>{const map:Record<string,VolumeScalarType>={Float32:"float32",Float64:"float64",Int32:"int32",UInt32:"uint32",Int16:"int16",UInt16:"uint16",Int8:"int8",UInt8:"uint8"};const type=map[name];if(!type)throw new Error(`Unsupported VTI scalar type: ${name}.`);return type;};
const parseVti=(bytes:Uint8Array):{metadata:ScientificVolumeMetadata;values:ManagedVolumeArray}=>{const xml=textDecoder.decode(bytes);if(/compressor\s*=/iu.test(xml)||/<AppendedData/iu.test(xml))throw new Error("Compressed or appended VTI payloads are unsupported in this staged importer.");const image=xml.match(/<ImageData\b[^>]*>/iu)?.[0];const arrayTag=xml.match(/<DataArray\b[^>]*>/iu)?.[0];const arrayBody=xml.match(/<DataArray\b[^>]*>([\s\S]*?)<\/DataArray>/iu)?.[1];if(!image||!arrayTag||arrayBody==null)throw new Error("Malformed VTI ImageData or DataArray header.");if((attribute(arrayTag,"format")??"ascii").toLowerCase()!=="ascii")throw new Error("Only ASCII VTI DataArray payloads are supported.");const extent=numberTuple(attribute(image,"WholeExtent"),6,"WholeExtent");const dimensions:[number,number,number]=[extent[1]-extent[0]+1,extent[3]-extent[2]+1,extent[5]-extent[4]+1];const scalarType=vtkType(attribute(arrayTag,"type")??"");const components=Number(attribute(arrayTag,"NumberOfComponents")??1);const metadata:ScientificVolumeMetadata={dimensions,spacing:numberTuple(attribute(image,"Spacing"),3,"Spacing")as[number,number,number],origin:numberTuple(attribute(image,"Origin"),3,"Origin")as[number,number,number],direction:(attribute(image,"Direction")?numberTuple(attribute(image,"Direction"),9,"Direction"):identityDirection)as ScientificVolumeMetadata["direction"],centering:/<CellData\b/iu.test(xml)?"cell":"point",scalarType,components,coordinateSystem:attribute(image,"CoordinateSystem")??"world-cartesian",positionUnits:attribute(image,"PositionUnits")??"unit",valueUnits:attribute(arrayTag,"ValueUnits")??"unitless",missingValuePolicy:attribute(arrayTag,"MissingValuePolicy")==="sentinel"?"sentinel":attribute(arrayTag,"MissingValuePolicy")==="nan"?"nan":"none",missingValueSentinel:attribute(arrayTag,"MissingValueSentinel")!=null?Number(attribute(arrayTag,"MissingValueSentinel")):null,byteOrder:"little-endian"};const numbers=arrayBody.trim().split(/\s+/u).filter(Boolean).map(Number);if(numbers.length!==elementCount(metadata)||numbers.some(value=>!Number.isFinite(value)&&metadata.missingValuePolicy!=="nan"))throw new Error("VTI scalar payload is truncated or invalid.");const values=scalarCtor(scalarType,new ArrayBuffer(numbers.length*bytesPerScalar[scalarType]));for(let i=0;i<numbers.length;i+=1)values[i]=numbers[i];return{metadata,values};};

export const probeScientificVolume=(files:readonly ScientificVolumeFile[],options:ScientificVolumeImportOptions={}):ScientificVolumeProbe=>{if(!files.length)throw new Error("No scientific Volume file was selected.");const primary=files.find(file=>["raw","npy","vti"].includes(extension(file.fileName)));if(!primary)throw new Error("Supported staged formats are RAW + JSON, NPY + optional JSON, and VTI.");checkCancelled(options);const format=extension(primary.fileName)as VolumeScientificFormat;let metadata:ScientificVolumeMetadata;if(format==="raw")metadata=rawMetadata(files,primary);else if(format==="npy")metadata=npyMetadata(files,primary).metadata;else metadata=parseVti(primary.bytes).metadata;const maximum=options.maximumBytes??1024*1024*1024;validateMetadata(metadata,maximum);const bytes=expectedBytes(metadata);if(format==="raw"&&primary.bytes.byteLength!==bytes)throw new Error(`RAW payload length ${primary.bytes.byteLength} does not match expected ${bytes}.`);if(format==="npy"){const {header}=npyMetadata(files,primary);if(primary.bytes.byteLength-header.offset!==bytes)throw new Error("NPY payload is truncated or has trailing bytes.");}return{format,fileName:primary.fileName,metadata,expectedBytes:bytes,warnings:format==="npy"&&!findSidecar(files,primary.fileName)?["NPY has no Math3D spatial sidecar; unit spacing and origin were assumed."]:[]};};
export const importScientificVolume=(files:readonly ScientificVolumeFile[],options:ScientificVolumeImportOptions={}):ScientificVolumeImport=>{const probe=probeScientificVolume(files,options);const primary=files.find(file=>file.fileName===probe.fileName)!;options.onProgress?.(.25,"metadata-validated");checkCancelled(options);let values:ManagedVolumeArray;if(probe.format==="raw")values=copyEndian(primary.bytes,probe.metadata.scalarType,probe.metadata.byteOrder);else if(probe.format==="npy"){const {header}=npyMetadata(files,primary);values=copyEndian(primary.bytes.slice(header.offset),probe.metadata.scalarType,probe.metadata.byteOrder);}else values=parseVti(primary.bytes).values;options.onProgress?.(1,"complete");return{...probe,values,externalReference:{fileName:primary.fileName,byteLength:primary.bytes.byteLength,contentHash:hashBytes(primary.bytes)}};};

export const scientificMetadataFromVolume=(volume:VolumeObject):ScientificVolumeMetadata=>({dimensions:[...volume.spatial.dimensions],spacing:[...volume.spatial.spacing],origin:[...volume.spatial.origin],direction:[...volume.spatial.direction],centering:volume.spatial.centering,scalarType:volume.spatial.scalarType,components:volume.spatial.components,coordinateSystem:volume.spatial.coordinateSystem,positionUnits:volume.spatial.positionUnits,valueUnits:volume.spatial.valueUnits,missingValuePolicy:volume.spatial.missingValuePolicy,missingValueSentinel:volume.spatial.missingValueSentinel,byteOrder:"little-endian"});
const bytesOf=(values:ManagedVolumeArray)=>new Uint8Array(values.buffer.slice(values.byteOffset,values.byteOffset+values.byteLength));
const npyDescriptor=(type:VolumeScalarType)=>({float32:"<f4",float64:"<f8",int32:"<i4",uint32:"<u4",int16:"<i2",uint16:"<u2",int8:"|i1",uint8:"|u1"}[type]);
const encodeNpy=(values:ManagedVolumeArray,metadata:ScientificVolumeMetadata):Uint8Array=>{const shape=metadata.components===1?`${metadata.dimensions[2]}, ${metadata.dimensions[1]}, ${metadata.dimensions[0]}`:`${metadata.dimensions[2]}, ${metadata.dimensions[1]}, ${metadata.dimensions[0]}, ${metadata.components}`;let header=`{'descr': '${npyDescriptor(metadata.scalarType)}', 'fortran_order': False, 'shape': (${shape},), }`;const prefix=10;const padding=(16-((prefix+header.length+1)%16))%16;header+=`${" ".repeat(padding)}\n`;const headerBytes=textEncoder.encode(header);const output=new Uint8Array(prefix+headerBytes.length+values.byteLength);output.set([0x93,0x4e,0x55,0x4d,0x50,0x59,1,0,headerBytes.length&255,headerBytes.length>>8],0);output.set(headerBytes,prefix);output.set(bytesOf(values),prefix+headerBytes.length);return output;};
const metadataBytes=(metadata:ScientificVolumeMetadata)=>textEncoder.encode(JSON.stringify(metadata,null,2));
const xmlEscape=(value:string)=>value.replace(/&/gu,"&amp;").replace(/"/gu,"&quot;").replace(/</gu,"&lt;");
const vtkName=(type:VolumeScalarType)=>({float32:"Float32",float64:"Float64",int32:"Int32",uint32:"UInt32",int16:"Int16",uint16:"UInt16",int8:"Int8",uint8:"UInt8"}[type]);
const encodeVti=(values:ManagedVolumeArray,metadata:ScientificVolumeMetadata):Uint8Array=>{const[nx,ny,nz]=metadata.dimensions;const association=metadata.centering==="cell"?"CellData":"PointData";const payload=Array.from(values,value=>Number.isNaN(value)?"NaN":String(value)).join(" ");return textEncoder.encode(`<?xml version="1.0"?>\n<VTKFile type="ImageData" version="1.0" byte_order="LittleEndian"><ImageData WholeExtent="0 ${nx-1} 0 ${ny-1} 0 ${nz-1}" Origin="${metadata.origin.join(" ")}" Spacing="${metadata.spacing.join(" ")}" Direction="${metadata.direction.join(" ")}" CoordinateSystem="${xmlEscape(metadata.coordinateSystem)}" PositionUnits="${xmlEscape(metadata.positionUnits)}"><Piece Extent="0 ${nx-1} 0 ${ny-1} 0 ${nz-1}"><${association} Scalars="values"><DataArray type="${vtkName(metadata.scalarType)}" Name="values" NumberOfComponents="${metadata.components}" format="ascii" ValueUnits="${xmlEscape(metadata.valueUnits)}" MissingValuePolicy="${metadata.missingValuePolicy}"${metadata.missingValueSentinel==null?"":` MissingValueSentinel="${metadata.missingValueSentinel}"`}>${payload}</DataArray></${association}></Piece></ImageData></VTKFile>`);};
export const exportScientificVolume=(base:string,format:VolumeScientificFormat,values:ManagedVolumeArray,metadata:ScientificVolumeMetadata):ScientificVolumeArtifact[]=>{validateMetadata(metadata,Number.MAX_SAFE_INTEGER);if(values.length!==elementCount(metadata))throw new Error("Volume export payload length does not match metadata.");const stem=baseName(base)||"math3d-volume";if(format==="raw")return[{fileName:`${stem}.raw`,bytes:bytesOf(values),mediaType:"application/octet-stream"},{fileName:`${stem}.json`,bytes:metadataBytes(metadata),mediaType:"application/json"}];if(format==="npy")return[{fileName:`${stem}.npy`,bytes:encodeNpy(values,metadata),mediaType:"application/octet-stream"},{fileName:`${stem}.json`,bytes:metadataBytes(metadata),mediaType:"application/json"}];return[{fileName:`${stem}.vti`,bytes:encodeVti(values,metadata),mediaType:"application/vnd.vtk"}];};

export const exportMaskArtifacts=(base:string,mask:BinaryVolumeMask,metadata:ScientificVolumeMetadata)=>exportScientificVolume(base,"npy",mask.data,{...metadata,scalarType:"uint8",components:1});
export const exportLabelArtifacts=(base:string,map:IntegerVolumeLabelMap,metadata:ScientificVolumeMetadata):ScientificVolumeArtifact[]=>[...exportScientificVolume(base,"npy",map.data,{...metadata,scalarType:"uint32",components:1}),{fileName:`${baseName(base)}.labels.json`,bytes:textEncoder.encode(JSON.stringify(map.labels,null,2)),mediaType:"application/json"}];
export const exportReportArtifact=(base:string,report:unknown):ScientificVolumeArtifact=>({fileName:`${baseName(base)}.analysis.json`,bytes:textEncoder.encode(JSON.stringify(report,null,2)),mediaType:"application/json"});
export const exportSliceArtifact=(base:string,image:Image2D):ScientificVolumeArtifact=>({fileName:`${baseName(base)}.slice.json`,bytes:textEncoder.encode(JSON.stringify({width:image.width,height:image.height,format:image.format,data:Array.from(image.data)})),mediaType:"application/json"});
export const exportIsosurfaceArtifact=(base:string,mesh:SurfaceMesh):ScientificVolumeArtifact=>({fileName:`${baseName(base)}.mesh.json`,bytes:textEncoder.encode(JSON.stringify({positions:Array.from(mesh.positions),indices:mesh.indices?Array.from(mesh.indices):null})),mediaType:"application/json"});
export const importedVolumeGrid=(value:ScientificVolumeImport):VolumeGrid=>({dims:[...value.metadata.dimensions],spacing:[...value.metadata.spacing],origin:[...value.metadata.origin],direction:[...value.metadata.direction],centering:value.metadata.centering,scalars:value.values instanceof Float32Array?value.values:Float32Array.from(value.values)});
