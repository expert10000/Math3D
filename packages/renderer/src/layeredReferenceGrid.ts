import * as THREE from "three";

export type LayeredReferenceGridOverlay = {
  group: THREE.Group;
  dispose: () => void;
};

export type LayeredReferenceGridOptions = {
  halfSize: number;
  majorStep?: number;
  minorDivisions?: number;
  labelEveryMajor?: number;
  labelScale?: number;
  labelSkin?: ReferencePlaneLabelSkin;
  lineLift?: number;
  originDotRadius?: number;
  showGrid?: boolean;
  showMinorGrid?: boolean;
  showLabels?: boolean;
  showAxisLabels?: boolean;
  showXY?: boolean;
  showXZ?: boolean;
  showYZ?: boolean;
  autoGridScale?: boolean;
  gridDensity?: number;
  planeOpacity?: number;
};

export type ReferencePlaneLabelSkin = "slate" | "glass" | "neon" | "paper";

export type ReferencePlaneGridSettings = {
  showGrid: boolean;
  showMinorGrid: boolean;
  showLabels: boolean;
  showAxisLabels: boolean;
  labelSkin: ReferencePlaneLabelSkin;
  showXY: boolean;
  showXZ: boolean;
  showYZ: boolean;
  autoGridScale: boolean;
  gridDensity: number;
  planeOpacity: number;
};

export const DEFAULT_REFERENCE_PLANE_GRID_SETTINGS: ReferencePlaneGridSettings = {
  showGrid: true,
  showMinorGrid: true,
  showLabels: true,
  showAxisLabels: true,
  labelSkin: "slate",
  showXY: true,
  showXZ: true,
  showYZ: true,
  autoGridScale: true,
  gridDensity: 10,
  planeOpacity: 0.06,
};

type PlaneSpec = {
  id: "xy" | "xz" | "yz";
  rotation: [number, number, number];
  tint: number;
  labelColor: string;
  axisU: "x" | "y" | "z";
  axisV: "x" | "y" | "z";
};

const EPS = 1e-6;

const AXIS_COLORS: Record<"x" | "y" | "z", number> = {
  x: 0xe35b5b,
  y: 0x44b572,
  z: 0x4a83ff,
};

const PLANE_SPECS: PlaneSpec[] = [
  {
    id: "xy",
    rotation: [0, 0, 0],
    tint: 0x74abff,
    labelColor: "#8db8ff",
    axisU: "x",
    axisV: "y",
  },
  {
    id: "xz",
    rotation: [-Math.PI / 2, 0, 0],
    tint: 0x69ca84,
    labelColor: "#8fe2a6",
    axisU: "x",
    axisV: "z",
  },
  {
    id: "yz",
    rotation: [0, Math.PI / 2, 0],
    tint: 0xffa877,
    labelColor: "#ffc498",
    axisU: "z",
    axisV: "y",
  },
];

const chooseMajorStep = (rawStep: number) => {
  const raw = Math.max(EPS, rawStep);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  if (normalized <= 1) return 1 * magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
};

const formatTickValue = (value: number) => {
  if (Math.abs(value) <= EPS) return "0";
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) <= 1e-6) return String(rounded);
  const oneDecimal = Number(value.toFixed(1));
  if (Math.abs(value - oneDecimal) <= 1e-6) return String(oneDecimal);
  return String(Number(value.toFixed(2)));
};

const toCssHex = (value: number) => `#${value.toString(16).padStart(6, "0")}`;

const pushSegment = (
  positions: number[],
  colors: number[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  color: THREE.Color
) => {
  positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
  colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
};

const createLabelSprite = (
  text: string,
  color: string,
  worldScale: number,
  skin: ReferencePlaneLabelSkin,
  kind: "tick" | "axis" | "origin" = "tick"
) => {
  const width = 128;
  const height = 72;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, width, height);
  let background = "rgba(16,24,40,0.55)";
  let border = "rgba(203,213,225,0.45)";
  let textColor = color;
  let fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  let fontWeight = kind === "axis" ? "700" : "600";
  let textShadowBlur = 0;
  let textShadowColor = "transparent";

  if (skin === "glass") {
    background = "rgba(248,250,252,0.34)";
    border = "rgba(148,163,184,0.62)";
    textColor = kind === "axis" ? color : "#0f172a";
    fontFamily = "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  } else if (skin === "neon") {
    background = "rgba(2,6,23,0.78)";
    border = "rgba(51,65,85,0.8)";
    textColor = color;
    fontWeight = "700";
    textShadowBlur = kind === "axis" ? 9 : 7;
    textShadowColor = color;
  } else if (skin === "paper") {
    background = "rgba(255,252,242,0.9)";
    border = "rgba(180,145,105,0.55)";
    textColor = kind === "axis" ? color : "#3f3a34";
    fontFamily = "Georgia, Times New Roman, serif";
  }

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = border;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, height - 2);
  ctx.fillStyle = textColor;
  const fontSize = kind === "axis" ? 36 : kind === "origin" ? 30 : 32;
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (textShadowBlur > 0) {
    ctx.shadowBlur = textShadowBlur;
    ctx.shadowColor = textShadowColor;
  }
  ctx.fillText(text, width / 2, height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 300;
  const scaleX = kind === "axis" ? 1.55 : kind === "origin" ? 1.3 : 1.4;
  const scaleY = kind === "axis" ? 0.86 : kind === "origin" ? 0.72 : 0.78;
  sprite.scale.set(worldScale * scaleX, worldScale * scaleY, 1);
  return sprite;
};

const makeLineSegments = (
  positions: number[],
  colors: number[],
  opacity: number,
  fallbackColor: number
) => {
  if (!positions.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.LineBasicMaterial({
    color: fallbackColor,
    vertexColors: true,
    transparent: true,
    opacity,
    depthWrite: false,
    toneMapped: false,
  });
  const lines = new THREE.LineSegments(geometry, material);
  lines.renderOrder = 120;
  return lines;
};

const disposeGroupDeep = (group: THREE.Group) => {
  group.traverse((obj) => {
    const anyObj = obj as any;
    if (anyObj.geometry && typeof anyObj.geometry.dispose === "function") {
      anyObj.geometry.dispose();
    }
    const matAny = anyObj.material as THREE.Material | THREE.Material[] | undefined;
    if (!matAny) return;
    const disposeMaterial = (m: THREE.Material) => {
      const anyMat = m as any;
      if (anyMat?.map && typeof anyMat.map.dispose === "function") {
        anyMat.map.dispose();
      }
      m.dispose();
    };
    if (Array.isArray(matAny)) matAny.forEach((m) => disposeMaterial(m));
    else disposeMaterial(matAny);
  });
};

export const createLayeredReferenceGrid = (
  options: LayeredReferenceGridOptions
): LayeredReferenceGridOverlay => {
  const halfSize = Math.max(1, options.halfSize);
  const showGrid = options.showGrid ?? DEFAULT_REFERENCE_PLANE_GRID_SETTINGS.showGrid;
  const showMinorGrid = options.showMinorGrid ?? DEFAULT_REFERENCE_PLANE_GRID_SETTINGS.showMinorGrid;
  const showLabels = options.showLabels ?? DEFAULT_REFERENCE_PLANE_GRID_SETTINGS.showLabels;
  const showAxisLabels = options.showAxisLabels ?? DEFAULT_REFERENCE_PLANE_GRID_SETTINGS.showAxisLabels;
  const labelSkin = options.labelSkin ?? DEFAULT_REFERENCE_PLANE_GRID_SETTINGS.labelSkin;
  const showXY = options.showXY ?? DEFAULT_REFERENCE_PLANE_GRID_SETTINGS.showXY;
  const showXZ = options.showXZ ?? DEFAULT_REFERENCE_PLANE_GRID_SETTINGS.showXZ;
  const showYZ = options.showYZ ?? DEFAULT_REFERENCE_PLANE_GRID_SETTINGS.showYZ;
  const autoGridScale = options.autoGridScale ?? DEFAULT_REFERENCE_PLANE_GRID_SETTINGS.autoGridScale;
  const gridDensity = Math.max(4, Math.min(20, options.gridDensity ?? DEFAULT_REFERENCE_PLANE_GRID_SETTINGS.gridDensity));
  const planeOpacity = Math.max(0, Math.min(0.45, options.planeOpacity ?? DEFAULT_REFERENCE_PLANE_GRID_SETTINGS.planeOpacity));
  const targetMajorStep = (halfSize * 2) / Math.max(1, gridDensity);
  const computedMajorStep = autoGridScale ? chooseMajorStep(targetMajorStep) : targetMajorStep;
  const majorStep = Math.max(EPS, options.majorStep ?? computedMajorStep);
  const minorDivisions = Math.max(2, Math.round(options.minorDivisions ?? 5));
  const minorStep = majorStep / minorDivisions;
  const lineLift = options.lineLift ?? Math.max(0.002, halfSize * 0.0012);
  const labelScale = Math.max(0.5, options.labelScale ?? 1);
  const originDotRadius = options.originDotRadius ?? Math.max(0.035, halfSize * 0.016);

  const group = new THREE.Group();
  group.name = "layered-reference-grid";

  let labelEveryMajor = Math.max(1, Math.round(options.labelEveryMajor ?? 1));
  const majorCount = Math.floor((halfSize + EPS) / majorStep);
  if (majorCount > 8 && labelEveryMajor < 2) labelEveryMajor = 2;

  for (const spec of PLANE_SPECS) {
    if (
      (spec.id === "xy" && !showXY) ||
      (spec.id === "xz" && !showXZ) ||
      (spec.id === "yz" && !showYZ)
    ) {
      continue;
    }

    const planeGroup = new THREE.Group();
    planeGroup.name = `layered-reference-grid-${spec.id}`;
    planeGroup.rotation.set(spec.rotation[0], spec.rotation[1], spec.rotation[2]);

    const fillGeometry = new THREE.PlaneGeometry(halfSize * 2, halfSize * 2);
    const fillMaterial = new THREE.MeshBasicMaterial({
      color: spec.tint,
      transparent: true,
      opacity: planeOpacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
    const fillMesh = new THREE.Mesh(fillGeometry, fillMaterial);
    fillMesh.renderOrder = 90;
    planeGroup.add(fillMesh);

    const minorPositions: number[] = [];
    const minorColors: number[] = [];
    const majorPositions: number[] = [];
    const majorColors: number[] = [];

    const minorCount = Math.floor((halfSize + EPS) / minorStep);
    for (let i = -minorCount; i <= minorCount; i++) {
      const offset = i * minorStep;
      if (Math.abs(offset) > halfSize + EPS) continue;
      if (Math.abs(offset) <= EPS) continue;

      const isMajor = i % minorDivisions === 0;
      const normalized = Math.min(1, Math.abs(offset) / halfSize);
      const fade = 1 - 0.72 * Math.pow(normalized, 1.2);
      const intensity = isMajor ? 0.5 + 0.5 * fade : 0.24 + 0.46 * fade;
      const c = new THREE.Color(spec.tint).multiplyScalar(intensity);
      const targetPositions = isMajor ? majorPositions : minorPositions;
      const targetColors = isMajor ? majorColors : minorColors;

      pushSegment(
        targetPositions,
        targetColors,
        new THREE.Vector3(offset, -halfSize, lineLift),
        new THREE.Vector3(offset, halfSize, lineLift),
        c
      );
      pushSegment(
        targetPositions,
        targetColors,
        new THREE.Vector3(-halfSize, offset, lineLift),
        new THREE.Vector3(halfSize, offset, lineLift),
        c
      );
    }

    if (showGrid) {
      if (showMinorGrid) {
        const minorLines = makeLineSegments(minorPositions, minorColors, 0.46, spec.tint);
        if (minorLines) planeGroup.add(minorLines);
      }

      const majorLines = makeLineSegments(majorPositions, majorColors, 0.78, spec.tint);
      if (majorLines) planeGroup.add(majorLines);

      const axisUColor = AXIS_COLORS[spec.axisU];
      const axisVColor = AXIS_COLORS[spec.axisV];
      const axisU = makeLineSegments(
        [-halfSize, 0, lineLift * 1.4, halfSize, 0, lineLift * 1.4],
        [...new THREE.Color(axisUColor).toArray(), ...new THREE.Color(axisUColor).toArray()],
        0.98,
        axisUColor
      );
      const axisV = makeLineSegments(
        [0, -halfSize, lineLift * 1.4, 0, halfSize, lineLift * 1.4],
        [...new THREE.Color(axisVColor).toArray(), ...new THREE.Color(axisVColor).toArray()],
        0.98,
        axisVColor
      );
      if (axisU) planeGroup.add(axisU);
      if (axisV) planeGroup.add(axisV);
    }

    group.add(planeGroup);
  }

  if (showGrid && showLabels && showXY) {
    const labelColor = PLANE_SPECS[0].labelColor;
    for (let k = -majorCount; k <= majorCount; k++) {
      if (k === 0 || k % labelEveryMajor !== 0) continue;
      const tickValue = k * majorStep;
      const text = formatTickValue(tickValue);
      const labelSize = Math.max(0.12, Math.min(0.52, majorStep * 0.23 * labelScale));
      const tickLabel = createLabelSprite(text, labelColor, labelSize, labelSkin, "tick");
      if (!tickLabel) continue;
      tickLabel.position.set(tickValue, -lineLift * 14, lineLift * 2.4);
      group.add(tickLabel);
    }
  }

  const originDot = new THREE.Mesh(
    new THREE.SphereGeometry(originDotRadius, 16, 16),
    new THREE.MeshBasicMaterial({
      color: 0xf8fafc,
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
      toneMapped: false,
    })
  );
  originDot.renderOrder = 210;
  group.add(originDot);

  if (showLabels && showAxisLabels) {
    const axisLabelSize = Math.max(0.16, Math.min(0.72, majorStep * 0.3 * labelScale));
    const axisOffset = Math.max(majorStep * 0.55, halfSize * 0.08);
    const xLabel = createLabelSprite("X", toCssHex(AXIS_COLORS.x), axisLabelSize, labelSkin, "axis");
    const yLabel = createLabelSprite("Y", toCssHex(AXIS_COLORS.y), axisLabelSize, labelSkin, "axis");
    const zLabel = createLabelSprite("Z", toCssHex(AXIS_COLORS.z), axisLabelSize, labelSkin, "axis");
    if (xLabel) {
      xLabel.position.set(halfSize + axisOffset, 0, 0);
      group.add(xLabel);
    }
    if (yLabel) {
      yLabel.position.set(0, halfSize + axisOffset, 0);
      group.add(yLabel);
    }
    if (zLabel) {
      zLabel.position.set(0, 0, halfSize + axisOffset);
      group.add(zLabel);
    }
  }

  if (showLabels) {
    const zeroLabel = createLabelSprite(
      "0",
      "#e2e8f0",
      Math.max(0.16, Math.min(0.56, halfSize * 0.1 * labelScale)),
      labelSkin,
      "origin"
    );
    if (zeroLabel) {
      zeroLabel.position.set(lineLift * 20, lineLift * 20, lineLift * 24);
      group.add(zeroLabel);
    }
  }

  return {
    group,
    dispose: () => disposeGroupDeep(group),
  };
};
