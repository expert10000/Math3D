export {};

declare global {
  type PresetKind = "graph" | "implicit" | "param";

  type SurfacePresetRecord = {
    id: string;
    kind: PresetKind;
    label: string;

    // graph / implicit
    expr?: string;

    // param
    xExpr?: string;
    yExpr?: string;
    zExpr?: string;

    createdAt: number;
    updatedAt: number;
  };

  type CgalMeshRequest = {
    jobId: string;
    f: string;
    iso: number;
    domain: { min: [number, number, number]; max: [number, number, number] };
    quality: { target_edge: number; radiusBound?: number };
    scalars?: string[];
    verbose?: boolean;
    preflightSamples?: number;
  };

  type CgalMeshResponse =
    | { ok: true; positions: number[]; indices: number[]; scalars?: { name: string; values: number[] }[] }
    | { ok: false; error: string };

  type GeodesicHeatRequest = {
    jobId: string;
    mesh: { V: number[][]; F: number[][] };
    source: { face: number; bary: [number, number, number] };
    target: { face: number; bary: [number, number, number] };
    options?: {
      t_factor?: number;
      step_factor?: number;
      max_steps?: number;
      stop_eps?: number;
      return_phi?: boolean;
    };
  };

  type GeodesicHeatResponse =
    | { ok: true; polyline: number[][]; length: number; phi_vertex?: number[] }
    | { ok: false; error: string };

  type VtkMeshRequest = {
    jobId: string;
    positions: ArrayBuffer | ArrayBufferView;
    indices: ArrayBuffer | ArrayBufferView;
    options?: {
      targetReduction?: number;
      targetFaces?: number;
      iterations?: number;
      passband?: number;
      computeNormals?: boolean;
    };
  };

  type VtkMeshResponse =
    | {
        ok: true;
        positions: ArrayBuffer | ArrayBufferView;
        indices: ArrayBuffer | ArrayBufferView;
        normals?: ArrayBuffer | ArrayBufferView;
        vertexCount: number;
        triCount: number;
      }
    | { ok: false; error: string };

  type VtkPreviewRequest = {
    jobId: string;
    expr: string;
    iso: number;
    domain: { min: [number, number, number]; max: [number, number, number] };
    resolution: number;
    targetFaces?: number;
    targetReduction?: number;
  };

  type VtkVolumeSliceRequest = {
    jobId: string;
    dims: [number, number, number];
    scalars: ArrayBuffer | ArrayBufferView;
    axis: "x" | "y" | "z";
    index: number;
    spacing?: [number, number, number];
    origin?: [number, number, number];
  };

  type VtkVolumeSliceResponse =
    | {
        ok: true;
        data: ArrayBuffer | ArrayBufferView;
        width: number;
        height: number;
        format: "rgba8";
        min?: number;
        max?: number;
      }
    | { ok: false; error: string };

  interface Window {
    surfacePresets?: {
      list: (kind: PresetKind) => Promise<SurfacePresetRecord[]>;
      upsert: (preset: SurfacePresetRecord) => Promise<void>;
      remove: (id: string) => Promise<void>;
    };
    cgalMesh?: {
      health: () => Promise<{ ok: boolean; error?: string }>;
      mesh: (req: CgalMeshRequest) => Promise<CgalMeshResponse>;
      stop: () => Promise<{ ok: boolean; error?: string }>;
      geodesicHeat: (req: GeodesicHeatRequest) => Promise<GeodesicHeatResponse>;
    };
    vtkMesh?: {
      cleanNormals: (req: VtkMeshRequest) => Promise<VtkMeshResponse>;
      decimate: (req: VtkMeshRequest) => Promise<VtkMeshResponse>;
      smooth: (req: VtkMeshRequest) => Promise<VtkMeshResponse>;
      previewImplicit: (req: VtkPreviewRequest) => Promise<VtkMeshResponse>;
    };
    vtkVolume?: {
      slice: (req: VtkVolumeSliceRequest) => Promise<VtkVolumeSliceResponse>;
    };
  }
}
