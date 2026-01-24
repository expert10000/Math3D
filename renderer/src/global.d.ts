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
    quality: { target_edge: number };
    scalars?: string[];
  };

  type CgalMeshResponse =
    | { ok: true; positions: number[]; indices: number[]; scalars?: { name: string; values: number[] }[] }
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
    };
  }
}
