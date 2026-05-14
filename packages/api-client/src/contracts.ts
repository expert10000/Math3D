export type {
  CgalHealthResponse,
  CgalMeshRequest,
  CgalMeshResponse,
  CgalPingResponse,
  CgalStopResponse,
  CgalVersionResponse,
  GeodesicHeatRequest,
  GeodesicHeatResponse,
  MeshContract,
  MeshResult,
  SliceAxis,
  VtkMeshRequest,
  VtkMeshResponse,
  VtkPreviewRequest,
  VtkVolumeDistanceRequest,
  VtkVolumeDistanceResponse,
  VtkVolumeIsosurfaceRequest,
  VtkVolumeIsosurfaceResponse,
  VtkVolumeSliceRequest,
  VtkVolumeSliceResponse,
  VtkVolumeStreamlinesRequest,
  VtkVolumeStreamlinesResponse,
  WorkerRequest,
  WorkerResponse,
} from "@math3d/core";

export type MeshBackendCapabilities = {
  cgalHealth: boolean;
  cgalMesh: boolean;
  cgalGeodesicHeat: boolean;
  vtkPreviewImplicit: boolean;
  vtkMeshCleanNormals: boolean;
  vtkMeshDecimate: boolean;
  vtkMeshSmooth: boolean;
  vtkVolumeSlice: boolean;
  vtkVolumeIsosurface: boolean;
  vtkVolumeDistance: boolean;
  vtkVolumeStreamlines: boolean;
};
