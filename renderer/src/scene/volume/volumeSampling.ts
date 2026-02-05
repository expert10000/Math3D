export type VolumeSampling = {
  center: [number, number, number];
  extents: [number, number, number];
  dims: [number, number, number];
};

type Bounds = { min: [number, number, number]; max: [number, number, number] };

const clampDim = (value: number, fallback: number) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(512, Math.round(value)));
};

const clampExtent = (value: number, fallback: number) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1e-6, Math.abs(value));
};

export function samplingFromBounds(bounds: Bounds, dims: [number, number, number]): VolumeSampling {
  const center: [number, number, number] = [
    0.5 * (bounds.min[0] + bounds.max[0]),
    0.5 * (bounds.min[1] + bounds.max[1]),
    0.5 * (bounds.min[2] + bounds.max[2]),
  ];
  const extents: [number, number, number] = [
    0.5 * Math.abs(bounds.max[0] - bounds.min[0]),
    0.5 * Math.abs(bounds.max[1] - bounds.min[1]),
    0.5 * Math.abs(bounds.max[2] - bounds.min[2]),
  ];
  return {
    center,
    extents,
    dims: [
      clampDim(dims[0], dims[0]),
      clampDim(dims[1], dims[1]),
      clampDim(dims[2], dims[2]),
    ],
  };
}

export function samplingToBounds(sampling: VolumeSampling): Bounds {
  const c = sampling.center;
  const e = sampling.extents;
  return {
    min: [c[0] - e[0], c[1] - e[1], c[2] - e[2]],
    max: [c[0] + e[0], c[1] + e[1], c[2] + e[2]],
  };
}

export function samplingSpacing(sampling: VolumeSampling): [number, number, number] {
  const dims = sampling.dims;
  const span: [number, number, number] = [sampling.extents[0] * 2, sampling.extents[1] * 2, sampling.extents[2] * 2];
  return [
    dims[0] > 1 ? span[0] / (dims[0] - 1) : span[0],
    dims[1] > 1 ? span[1] / (dims[1] - 1) : span[1],
    dims[2] > 1 ? span[2] / (dims[2] - 1) : span[2],
  ];
}

export function clampSampling(sampling: VolumeSampling): VolumeSampling {
  return {
    center: sampling.center,
    extents: [
      clampExtent(sampling.extents[0], 1),
      clampExtent(sampling.extents[1], 1),
      clampExtent(sampling.extents[2], 1),
    ],
    dims: [
      clampDim(sampling.dims[0], sampling.dims[0]),
      clampDim(sampling.dims[1], sampling.dims[1]),
      clampDim(sampling.dims[2], sampling.dims[2]),
    ],
  };
}
