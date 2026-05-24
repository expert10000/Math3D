import type { GeometryObjectType } from "./proceduralObjects";

type GeometryParamValue = number | boolean | string;

export type GeometryGalleryCategoryId =
  | "basic-solids"
  | "polyhedra"
  | "curves-frames"
  | "construction-helpers"
  | "procedural-generated"
  | "boolean-ready"
  | "educational-scenes";

export type GeometryGalleryBadge = "Primitive" | "Polyhedron" | "Curve" | "Surface" | "Helper";

export type GeometryGalleryRecipe = {
  type: GeometryObjectType;
  name?: string;
  params?: Record<string, GeometryParamValue>;
};

export type GeometryGalleryPreset = {
  id: string;
  label: string;
  description: string;
  tags: string[];
  recipe: GeometryGalleryRecipe;
  renderedThumbnailDataUrl: string;
  diagramThumbnailDataUrl: string;
  thumbnailDataUrl: string;
};

export type GeometryGalleryVisualStyle =
  | "sphere"
  | "box"
  | "cylinder"
  | "cone"
  | "torus"
  | "polyhedron"
  | "curve"
  | "surface"
  | "helper";

export type GeometryGalleryCard = {
  id: string;
  name: string;
  description: string;
  categoryId: GeometryGalleryCategoryId;
  badge: GeometryGalleryBadge;
  tags: string[];
  demoReady: boolean;
  supported: boolean;
  renderedThumbnailDataUrl: string;
  diagramThumbnailDataUrl: string;
  thumbnailDataUrl: string;
  defaultRecipe?: GeometryGalleryRecipe;
  presets: GeometryGalleryPreset[];
  visualStyle: GeometryGalleryVisualStyle;
  comingSoonNote?: string;
};

export type GeometryGalleryCategory = {
  id: GeometryGalleryCategoryId;
  label: string;
  description: string;
};

export type GeometryGalleryCategoryFilter = GeometryGalleryCategoryId | "all";

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const paletteForBadge = (
  badge: GeometryGalleryBadge
): { top: string; bottom: string; accent: string; ink: string } => {
  if (badge === "Primitive") return { top: "#ebf4ff", bottom: "#dbeafe", accent: "#1d4ed8", ink: "#0f2b67" };
  if (badge === "Polyhedron") return { top: "#fff7ed", bottom: "#ffedd5", accent: "#d97706", ink: "#7c2d12" };
  if (badge === "Curve") return { top: "#f0f9ff", bottom: "#dbeafe", accent: "#0891b2", ink: "#155e75" };
  if (badge === "Surface") return { top: "#ecfeff", bottom: "#cffafe", accent: "#0e7490", ink: "#134e4a" };
  return { top: "#f8fafc", bottom: "#e2e8f0", accent: "#475569", ink: "#0f172a" };
};

const shapeForStyle = (style: GeometryGalleryVisualStyle, accent: string): string => {
  if (style === "sphere") {
    return `<circle cx="68" cy="48" r="26" fill="none" stroke="${accent}" stroke-width="4" />
<ellipse cx="68" cy="48" rx="18" ry="26" fill="none" stroke="${accent}" stroke-width="2" opacity="0.6" />
<ellipse cx="68" cy="48" rx="26" ry="11" fill="none" stroke="${accent}" stroke-width="2" opacity="0.6" />`;
  }
  if (style === "box") {
    return `<path d="M36 60 L36 30 L74 30 L74 60 Z" fill="none" stroke="${accent}" stroke-width="3" />
<path d="M74 30 L92 20 L92 50 L74 60" fill="none" stroke="${accent}" stroke-width="3" />
<path d="M36 30 L54 20 L92 20" fill="none" stroke="${accent}" stroke-width="3" />`;
  }
  if (style === "cylinder") {
    return `<ellipse cx="68" cy="26" rx="24" ry="8" fill="none" stroke="${accent}" stroke-width="3" />
<path d="M44 26 V62 M92 26 V62" fill="none" stroke="${accent}" stroke-width="3" />
<ellipse cx="68" cy="62" rx="24" ry="8" fill="none" stroke="${accent}" stroke-width="3" />`;
  }
  if (style === "cone") {
    return `<path d="M68 18 L38 62 H98 Z" fill="none" stroke="${accent}" stroke-width="3" />
<ellipse cx="68" cy="62" rx="30" ry="8" fill="none" stroke="${accent}" stroke-width="3" opacity="0.7" />`;
  }
  if (style === "torus") {
    return `<ellipse cx="68" cy="46" rx="32" ry="18" fill="none" stroke="${accent}" stroke-width="4" />
<ellipse cx="68" cy="46" rx="15" ry="8" fill="none" stroke="${accent}" stroke-width="3" opacity="0.8" />`;
  }
  if (style === "polyhedron") {
    return `<path d="M68 16 L34 36 L44 70 H92 L102 36 Z" fill="none" stroke="${accent}" stroke-width="3" />
<path d="M68 16 V44 M34 36 L68 44 L102 36 M44 70 L68 44 L92 70" fill="none" stroke="${accent}" stroke-width="2.5" opacity="0.75" />`;
  }
  if (style === "curve") {
    return `<path d="M30 62 C46 22, 78 74, 98 30" fill="none" stroke="${accent}" stroke-width="4" stroke-linecap="round" />
<circle cx="30" cy="62" r="3" fill="${accent}" />
<circle cx="98" cy="30" r="3" fill="${accent}" />`;
  }
  if (style === "surface") {
    return `<path d="M28 58 C40 30, 58 28, 72 52 C85 74, 102 60, 108 34" fill="none" stroke="${accent}" stroke-width="3" />
<path d="M24 46 C40 20, 62 18, 80 42 C94 60, 104 56, 112 32" fill="none" stroke="${accent}" stroke-width="2" opacity="0.6" />
<path d="M32 68 C46 42, 68 40, 86 64 C98 78, 108 72, 116 50" fill="none" stroke="${accent}" stroke-width="2" opacity="0.6" />`;
  }
  return `<path d="M24 56 H112 M34 30 V82 M62 30 V82 M90 30 V82" fill="none" stroke="${accent}" stroke-width="3" />
<circle cx="34" cy="30" r="4" fill="${accent}" />
<circle cx="62" cy="56" r="4" fill="${accent}" />
<circle cx="90" cy="82" r="4" fill="${accent}" />`;
};

const buildThumbnail = (
  title: string,
  subtitle: string,
  style: GeometryGalleryVisualStyle,
  badge: GeometryGalleryBadge
) => {
  const palette = paletteForBadge(badge);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100" viewBox="0 0 132 84" preserveAspectRatio="none">
<defs>
  <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${palette.top}" />
    <stop offset="100%" stop-color="${palette.bottom}" />
  </linearGradient>
</defs>
<rect x="0.5" y="0.5" width="131" height="83" rx="10" fill="url(#g)" stroke="#d1d5db" />
${shapeForStyle(style, palette.accent)}
<rect x="8" y="64" width="116" height="14" rx="4" fill="#ffffff" opacity="0.75" />
<text x="12" y="74" font-family="Segoe UI, Arial, sans-serif" font-size="8.5" font-weight="700" fill="${palette.ink}">${escapeXml(
    title
  )}</text>
<text x="12" y="12" font-family="Segoe UI, Arial, sans-serif" font-size="8" fill="${palette.ink}" opacity="0.8">${escapeXml(
    subtitle
  )}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const CAPTURED_OBJECT_THUMB_IDS = new Set<string>([
  "sphere",
  "box",
  "cylinder",
  "cone",
  "torus",
  "tetrahedron",
  "cube",
  "octahedron",
  "dodecahedron",
  "icosahedron",
  "prism",
  "pyramid",
]);

const resolveGalleryAssetPath = (relativePath: string): string => {
  const normalized = relativePath.replace(/^\/+/, "");
  const base =
    typeof document !== "undefined" && document.baseURI
      ? document.baseURI
      : typeof window !== "undefined" && window.location?.href
        ? window.location.href
        : "/";
  try {
    return new URL(normalized, base).toString();
  } catch {
    return `./${normalized}`;
  }
};

const capturedObjectThumbPath = (objectId: string): string | null =>
  CAPTURED_OBJECT_THUMB_IDS.has(objectId)
    ? resolveGalleryAssetPath(`gallery-images/captured/objects/${objectId}.png`)
    : null;

const preset = (
  cardId: string,
  id: string,
  label: string,
  description: string,
  tags: string[],
  recipe: GeometryGalleryRecipe,
  visualStyle: GeometryGalleryVisualStyle,
  badge: GeometryGalleryBadge
): GeometryGalleryPreset => {
  const diagramThumb = buildThumbnail(label, "Preset", visualStyle, badge);
  const renderedThumb = capturedObjectThumbPath(cardId) ?? diagramThumb;
  return {
    id: `${cardId}:${id}`,
    label,
    description,
    tags,
    recipe,
    renderedThumbnailDataUrl: renderedThumb,
    diagramThumbnailDataUrl: diagramThumb,
    thumbnailDataUrl: renderedThumb,
  };
};

const unsupportedCard = (
  id: string,
  name: string,
  description: string,
  categoryId: GeometryGalleryCategoryId,
  badge: GeometryGalleryBadge,
  visualStyle: GeometryGalleryVisualStyle
): GeometryGalleryCard => {
  const diagramThumb = buildThumbnail(name, "Planned", visualStyle, badge);
  const renderedThumb = capturedObjectThumbPath(id) ?? diagramThumb;
  return {
    id,
    name,
    description,
    categoryId,
    badge,
    tags: ["Planned", "Gallery"],
    demoReady: false,
    supported: false,
    visualStyle,
    renderedThumbnailDataUrl: renderedThumb,
    diagramThumbnailDataUrl: diagramThumb,
    thumbnailDataUrl: renderedThumb,
    presets: [],
    comingSoonNote: "Planned for a future update.",
  };
};

const supportedCard = (
  card: Omit<GeometryGalleryCard, "thumbnailDataUrl" | "renderedThumbnailDataUrl" | "diagramThumbnailDataUrl">
): GeometryGalleryCard => {
  const diagramThumb = buildThumbnail(card.name, card.badge, card.visualStyle, card.badge);
  const renderedThumb = capturedObjectThumbPath(card.id) ?? diagramThumb;
  return {
    ...card,
    renderedThumbnailDataUrl: renderedThumb,
    diagramThumbnailDataUrl: diagramThumb,
    thumbnailDataUrl: renderedThumb,
  };
};

export const GEOMETRY_GALLERY_CATEGORIES: GeometryGalleryCategory[] = [
  { id: "basic-solids", label: "Basic solids", description: "Core editable 3D primitives." },
  { id: "polyhedra", label: "Polyhedra", description: "Platonic and constructive solid families." },
  { id: "curves-frames", label: "Curves / frames", description: "Curve primitives and frame scaffolds." },
  { id: "construction-helpers", label: "Construction helpers", description: "Reference axes, planes, frames, and measurement aids." },
  { id: "procedural-generated", label: "Procedural / generated", description: "Sweeps, lofts, revolutions, and generated surfaces." },
  { id: "boolean-ready", label: "Boolean-ready objects", description: "Cutters and operands prepared for boolean workflows." },
  { id: "educational-scenes", label: "Educational scenes", description: "Teaching-focused scene templates and demonstrations." },
];

export const GEOMETRY_GALLERY_CARDS: GeometryGalleryCard[] = [
  supportedCard({
    id: "sphere",
    name: "Sphere",
    description: "Basic 3D primitive defined by center and radius.",
    categoryId: "basic-solids",
    badge: "Primitive",
    tags: ["3D", "Editable", "Has presets"],
    demoReady: true,
    supported: true,
    visualStyle: "sphere",
    defaultRecipe: { type: "sphere", name: "Sphere" },
    presets: [
      preset(
        "sphere",
        "unit",
        "Unit sphere",
        "Radius 1 sphere centered at origin.",
        ["3D", "Default"],
        { type: "sphere", name: "Unit sphere", params: { radius: 1, widthSegments: 32, heightSegments: 20 } },
        "sphere",
        "Primitive"
      ),
      preset(
        "sphere",
        "large",
        "Large sphere",
        "Large smooth sphere useful for scale demos.",
        ["Demo", "Scaled"],
        { type: "sphere", name: "Large sphere", params: { radius: 2, widthSegments: 40, heightSegments: 24 } },
        "sphere",
        "Primitive"
      ),
    ],
  }),
  supportedCard({
    id: "box",
    name: "Box",
    description: "Axis-aligned solid with editable width, height, and depth.",
    categoryId: "basic-solids",
    badge: "Primitive",
    tags: ["3D", "Editable", "Has presets"],
    demoReady: true,
    supported: true,
    visualStyle: "box",
    defaultRecipe: { type: "box", name: "Box" },
    presets: [
      preset(
        "box",
        "unit",
        "Unit box",
        "Balanced 1x1x1 box for baseline scenes.",
        ["3D", "Default"],
        { type: "box", name: "Unit box", params: { width: 1, height: 1, depth: 1 } },
        "box",
        "Primitive"
      ),
      preset(
        "box",
        "slab",
        "Flat slab",
        "Wide low slab for cutting-plane demos.",
        ["Demo", "Scaled"],
        { type: "box", name: "Flat slab", params: { width: 2.4, height: 0.35, depth: 1.3 } },
        "box",
        "Primitive"
      ),
    ],
  }),
  supportedCard({
    id: "cylinder",
    name: "Cylinder",
    description: "Radial solid with top and bottom radii plus segment controls.",
    categoryId: "basic-solids",
    badge: "Primitive",
    tags: ["3D", "Editable", "Has presets"],
    demoReady: true,
    supported: true,
    visualStyle: "cylinder",
    defaultRecipe: { type: "cylinder", name: "Cylinder" },
    presets: [
      preset(
        "cylinder",
        "unit",
        "Unit cylinder",
        "Radius 1, height 2 default cylinder.",
        ["Default"],
        { type: "cylinder", name: "Unit cylinder", params: { radiusTop: 1, radiusBottom: 1, height: 2 } },
        "cylinder",
        "Primitive"
      ),
      preset(
        "cylinder",
        "tall",
        "Tall column",
        "Tall, narrow cylinder for architectural demos.",
        ["Demo", "Scaled"],
        { type: "cylinder", name: "Tall column", params: { radiusTop: 0.55, radiusBottom: 0.55, height: 4 } },
        "cylinder",
        "Primitive"
      ),
    ],
  }),
  supportedCard({
    id: "cone",
    name: "Cone",
    description: "Tapered primitive controlled by radius, height, and segments.",
    categoryId: "basic-solids",
    badge: "Primitive",
    tags: ["3D", "Editable", "Has presets"],
    demoReady: true,
    supported: true,
    visualStyle: "cone",
    defaultRecipe: { type: "cone", name: "Cone" },
    presets: [
      preset(
        "cone",
        "default",
        "Default cone",
        "Classic cone profile for quick demonstrations.",
        ["Default"],
        { type: "cone", name: "Cone", params: { radius: 1, height: 2 } },
        "cone",
        "Primitive"
      ),
      preset(
        "cone",
        "wide",
        "Wide cone",
        "Shorter cone with larger base radius.",
        ["Demo", "Scaled"],
        { type: "cone", name: "Wide cone", params: { radius: 1.6, height: 1.6 } },
        "cone",
        "Primitive"
      ),
    ],
  }),
  supportedCard({
    id: "torus",
    name: "Torus",
    description: "Ring primitive defined by major radius and tube radius.",
    categoryId: "basic-solids",
    badge: "Primitive",
    tags: ["3D", "Editable", "Has presets"],
    demoReady: true,
    supported: true,
    visualStyle: "torus",
    defaultRecipe: { type: "torus", name: "Torus" },
    presets: [
      preset(
        "torus",
        "standard",
        "Standard torus",
        "Balanced torus for general scenes.",
        ["Default"],
        { type: "torus", name: "Standard torus", params: { radius: 1, tube: 0.35 } },
        "torus",
        "Primitive"
      ),
      preset(
        "torus",
        "thin",
        "Thin torus",
        "Large major radius with slim tube.",
        ["Demo", "Scaled"],
        { type: "torus", name: "Thin torus", params: { radius: 1.35, tube: 0.2, tubularSegments: 64 } },
        "torus",
        "Primitive"
      ),
    ],
  }),
  supportedCard({
    id: "polygon",
    name: "Polygon",
    description: "Regular planar polygon primitive with editable side count and radius.",
    categoryId: "basic-solids",
    badge: "Primitive",
    tags: ["2D", "Planar", "Editable", "Has presets"],
    demoReady: true,
    supported: true,
    visualStyle: "surface",
    defaultRecipe: { type: "polygon", name: "Polygon" },
    presets: [
      preset(
        "polygon",
        "pentagon",
        "Pentagon",
        "Regular pentagon on the XY plane.",
        ["2D", "Default"],
        { type: "polygon", name: "Pentagon", params: { sides: 5, radius: 1.2, thetaStart: Math.PI * 0.5 } },
        "surface",
        "Primitive"
      ),
      preset(
        "polygon",
        "octagon",
        "Octagon",
        "Regular octagon with larger radius for edge-label demos.",
        ["2D", "Demo"],
        { type: "polygon", name: "Octagon", params: { sides: 8, radius: 1.45, thetaStart: Math.PI * 0.5 } },
        "surface",
        "Primitive"
      ),
    ],
  }),
  unsupportedCard(
    "plane",
    "Plane",
    "Infinite plane helper with orientation presets (XY/XZ/YZ).",
    "basic-solids",
    "Helper",
    "helper"
  ),
  supportedCard({
    id: "tetrahedron",
    name: "Tetrahedron",
    description: "Regular tetrahedron polyhedron preset.",
    categoryId: "polyhedra",
    badge: "Polyhedron",
    tags: ["3D", "Polyhedron", "Has presets"],
    demoReady: true,
    supported: true,
    visualStyle: "polyhedron",
    defaultRecipe: {
      type: "polyhedron",
      name: "Tetrahedron",
      params: { family: "platonic", kind: "tetra", radius: 1, subdivision: 0 },
    },
    presets: [
      preset(
        "tetrahedron",
        "regular",
        "Regular tetrahedron",
        "Classical tetrahedron with flat faces.",
        ["Polyhedron", "Default"],
        { type: "polyhedron", name: "Tetrahedron", params: { family: "platonic", kind: "tetra", radius: 1, subdivision: 0 } },
        "polyhedron",
        "Polyhedron"
      ),
      preset(
        "tetrahedron",
        "subdivided",
        "Subdivided tetrahedron",
        "Higher subdivision for smooth shading studies.",
        ["Polyhedron", "Demo"],
        { type: "polyhedron", name: "Subdivided tetrahedron", params: { family: "platonic", kind: "tetra", radius: 1, subdivision: 2 } },
        "polyhedron",
        "Polyhedron"
      ),
    ],
  }),
  supportedCard({
    id: "cube",
    name: "Cube",
    description: "Platonic cube with optional subdivisions.",
    categoryId: "polyhedra",
    badge: "Polyhedron",
    tags: ["3D", "Polyhedron", "Has presets"],
    demoReady: true,
    supported: true,
    visualStyle: "box",
    defaultRecipe: { type: "polyhedron", name: "Cube", params: { family: "platonic", kind: "cube", radius: 1, subdivision: 0 } },
    presets: [
      preset(
        "cube",
        "unit",
        "Unit cube",
        "Base cube with sharp edges.",
        ["Polyhedron", "Default"],
        { type: "polyhedron", name: "Cube", params: { family: "platonic", kind: "cube", radius: 1, subdivision: 0 } },
        "box",
        "Polyhedron"
      ),
      preset(
        "cube",
        "subdivided",
        "Subdivided cube",
        "Higher segmentation for smooth visualizations.",
        ["Polyhedron", "Demo"],
        { type: "polyhedron", name: "Subdivided cube", params: { family: "platonic", kind: "cube", radius: 1, subdivision: 2 } },
        "box",
        "Polyhedron"
      ),
    ],
  }),
  supportedCard({
    id: "octahedron",
    name: "Octahedron",
    description: "Eight-faced Platonic solid.",
    categoryId: "polyhedra",
    badge: "Polyhedron",
    tags: ["3D", "Polyhedron", "Has presets"],
    demoReady: true,
    supported: true,
    visualStyle: "polyhedron",
    defaultRecipe: { type: "polyhedron", name: "Octahedron", params: { family: "platonic", kind: "octa", radius: 1, subdivision: 0 } },
    presets: [
      preset(
        "octahedron",
        "regular",
        "Regular octahedron",
        "Default octahedron for symmetry demos.",
        ["Polyhedron", "Default"],
        { type: "polyhedron", name: "Octahedron", params: { family: "platonic", kind: "octa", radius: 1, subdivision: 0 } },
        "polyhedron",
        "Polyhedron"
      ),
      preset(
        "octahedron",
        "smooth",
        "Smooth octahedron",
        "Subdivision enabled to study shading.",
        ["Polyhedron", "Demo"],
        { type: "polyhedron", name: "Smooth octahedron", params: { family: "platonic", kind: "octa", radius: 1, subdivision: 2 } },
        "polyhedron",
        "Polyhedron"
      ),
    ],
  }),
  supportedCard({
    id: "dodecahedron",
    name: "Dodecahedron",
    description: "Twelve-faced Platonic solid.",
    categoryId: "polyhedra",
    badge: "Polyhedron",
    tags: ["3D", "Polyhedron", "Has presets"],
    demoReady: true,
    supported: true,
    visualStyle: "polyhedron",
    defaultRecipe: {
      type: "polyhedron",
      name: "Dodecahedron",
      params: { family: "platonic", kind: "dodeca", radius: 1, subdivision: 0 },
    },
    presets: [
      preset(
        "dodecahedron",
        "classic",
        "Classic dodecahedron",
        "Default dodecahedron setup.",
        ["Polyhedron", "Default"],
        { type: "polyhedron", name: "Dodecahedron", params: { family: "platonic", kind: "dodeca", radius: 1, subdivision: 0 } },
        "polyhedron",
        "Polyhedron"
      ),
      preset(
        "dodecahedron",
        "expanded",
        "Expanded dodecahedron",
        "Larger radius version for demos.",
        ["Polyhedron", "Demo"],
        { type: "polyhedron", name: "Expanded dodecahedron", params: { family: "platonic", kind: "dodeca", radius: 1.5, subdivision: 0 } },
        "polyhedron",
        "Polyhedron"
      ),
    ],
  }),
  supportedCard({
    id: "icosahedron",
    name: "Icosahedron",
    description: "Twenty-faced Platonic solid often used for geodesic seeds.",
    categoryId: "polyhedra",
    badge: "Polyhedron",
    tags: ["3D", "Polyhedron", "Has presets"],
    demoReady: true,
    supported: true,
    visualStyle: "polyhedron",
    defaultRecipe: { type: "polyhedron", name: "Icosahedron", params: { family: "platonic", kind: "icosa", radius: 1, subdivision: 0 } },
    presets: [
      preset(
        "icosahedron",
        "regular",
        "Regular icosahedron",
        "Default icosahedron with crisp facets.",
        ["Polyhedron", "Default"],
        { type: "polyhedron", name: "Icosahedron", params: { family: "platonic", kind: "icosa", radius: 1, subdivision: 0 } },
        "polyhedron",
        "Polyhedron"
      ),
      preset(
        "icosahedron",
        "geodesic-seed",
        "Geodesic seed",
        "Higher subdivision as a geodesic starter.",
        ["Polyhedron", "Demo"],
        { type: "polyhedron", name: "Geodesic seed", params: { family: "platonic", kind: "icosa", radius: 1, subdivision: 2 } },
        "polyhedron",
        "Polyhedron"
      ),
    ],
  }),
  supportedCard({
    id: "prism",
    name: "Prism",
    description: "N-sided prism family with configurable sides and height.",
    categoryId: "polyhedra",
    badge: "Polyhedron",
    tags: ["3D", "Polyhedron", "Parametric", "Has presets"],
    demoReady: true,
    supported: true,
    visualStyle: "polyhedron",
    defaultRecipe: { type: "polyhedron", name: "Prism", params: { family: "prism", n: 6, radius: 1, height: 1.6 } },
    presets: [
      preset(
        "prism",
        "hex",
        "Hex prism",
        "Regular six-sided prism.",
        ["Polyhedron", "Default"],
        { type: "polyhedron", name: "Hex prism", params: { family: "prism", n: 6, radius: 1, height: 1.6 } },
        "polyhedron",
        "Polyhedron"
      ),
      preset(
        "prism",
        "oct",
        "Oct prism",
        "Eight-sided prism, slightly taller.",
        ["Polyhedron", "Demo"],
        { type: "polyhedron", name: "Oct prism", params: { family: "prism", n: 8, radius: 1, height: 2 } },
        "polyhedron",
        "Polyhedron"
      ),
    ],
  }),
  supportedCard({
    id: "pyramid",
    name: "Pyramid",
    description: "N-sided pyramid family with controllable height.",
    categoryId: "polyhedra",
    badge: "Polyhedron",
    tags: ["3D", "Polyhedron", "Parametric", "Has presets"],
    demoReady: true,
    supported: true,
    visualStyle: "polyhedron",
    defaultRecipe: { type: "polyhedron", name: "Pyramid", params: { family: "pyramid", n: 4, radius: 1, height: 1.8 } },
    presets: [
      preset(
        "pyramid",
        "square",
        "Square pyramid",
        "Four-sided base with central apex.",
        ["Polyhedron", "Default"],
        { type: "polyhedron", name: "Square pyramid", params: { family: "pyramid", n: 4, radius: 1, height: 1.8 } },
        "polyhedron",
        "Polyhedron"
      ),
      preset(
        "pyramid",
        "pentagonal",
        "Pentagonal pyramid",
        "Five-sided base, useful for demos.",
        ["Polyhedron", "Demo"],
        { type: "polyhedron", name: "Pentagonal pyramid", params: { family: "pyramid", n: 5, radius: 1, height: 2 } },
        "polyhedron",
        "Polyhedron"
      ),
    ],
  }),
  unsupportedCard("line-segment", "Line segment", "Finite segment between two points.", "curves-frames", "Curve", "curve"),
  unsupportedCard("polyline", "Polyline", "Piecewise linear chain through editable vertices.", "curves-frames", "Curve", "curve"),
  unsupportedCard("circle", "Circle", "Circle primitive in 3D with radius and orientation.", "curves-frames", "Curve", "curve"),
  unsupportedCard("arc", "Arc", "Circular arc with start/end angle controls.", "curves-frames", "Curve", "curve"),
  unsupportedCard("helix", "Helix", "Parametric helical curve with turn and pitch controls.", "curves-frames", "Curve", "curve"),

  unsupportedCard("point", "Point", "Reference point marker.", "construction-helpers", "Helper", "helper"),
  unsupportedCard("axis", "Axis", "Reference axis helper.", "construction-helpers", "Helper", "helper"),
  unsupportedCard("plane", "Plane", "Infinite reference plane with orientation presets.", "construction-helpers", "Helper", "helper"),
  unsupportedCard("frame", "Coordinate frame", "Local coordinate frame helper.", "construction-helpers", "Helper", "helper"),
  unsupportedCard("grid-plane", "Grid plane", "Reference grid plane helper.", "construction-helpers", "Helper", "helper"),
  unsupportedCard("measurement-ruler", "Measurement ruler", "Distance/angle readout helper for constructions.", "construction-helpers", "Helper", "helper"),

  unsupportedCard("sweep", "Sweep", "Generate surface/solid by sweeping a profile along a path.", "procedural-generated", "Surface", "surface"),
  unsupportedCard("loft", "Loft", "Generated geometry interpolating multiple profile sections.", "procedural-generated", "Surface", "surface"),
  unsupportedCard("revolution", "Revolution", "Lathe/revolution surface generated from a profile curve.", "procedural-generated", "Surface", "surface"),
  unsupportedCard("extrusion", "Extrusion", "Linear extrusion of a 2D profile into a 3D object.", "procedural-generated", "Surface", "surface"),
  unsupportedCard("tube-along-curve", "Tube along curve", "Tube generated around a guide curve.", "procedural-generated", "Surface", "surface"),

  unsupportedCard("box-cutter", "Box cutter", "Boolean-ready box operand for subtraction operations.", "boolean-ready", "Primitive", "box"),
  unsupportedCard("sphere-cutter", "Sphere cutter", "Boolean-ready sphere operand for subtraction operations.", "boolean-ready", "Primitive", "sphere"),
  unsupportedCard("cylinder-cutter", "Cylinder cutter", "Boolean-ready cylinder operand for subtraction operations.", "boolean-ready", "Primitive", "cylinder"),
  unsupportedCard("half-space-plane", "Half-space plane", "Infinite cutting plane for half-space booleans.", "boolean-ready", "Helper", "helper"),

  unsupportedCard("edu-euler-characteristic", "Euler characteristic examples", "Scene pack illustrating V - E + F and quotient-surface topology.", "educational-scenes", "Surface", "surface"),
  unsupportedCard("edu-platonic-solids", "Platonic solids", "Teaching scene with all five Platonic solids and metrics.", "educational-scenes", "Polyhedron", "polyhedron"),
  unsupportedCard("edu-conic-sections", "Conic sections", "Interactive cone-plane intersections: circle, ellipse, parabola, hyperbola.", "educational-scenes", "Curve", "curve"),
  unsupportedCard("edu-projection-demos", "Projection demos", "Orthographic and perspective projection teaching scenes.", "educational-scenes", "Helper", "helper"),

  unsupportedCard("explicit-surface", "Explicit surface", "Surface defined as z = f(x, y).", "educational-scenes", "Surface", "surface"),
  unsupportedCard("parametric-surface", "Parametric surface", "Surface defined by sigma(u,v).", "educational-scenes", "Surface", "surface"),
  unsupportedCard("implicit-surface", "Implicit surface", "Surface defined by F(x,y,z)=0.", "educational-scenes", "Surface", "surface"),
  unsupportedCard("mobius-strip", "Mobius strip", "One-sided parametric strip with half twist.", "educational-scenes", "Surface", "surface"),
  unsupportedCard("klein-bottle", "Klein bottle", "Closed non-orientable surface immersion.", "educational-scenes", "Surface", "surface"),
  unsupportedCard("catenoid", "Catenoid", "Minimal surface of revolution.", "educational-scenes", "Surface", "surface"),
  unsupportedCard("helicoid", "Helicoid", "Minimal ruled surface with helical structure.", "educational-scenes", "Surface", "surface"),
  unsupportedCard("enneper", "Enneper", "Classical self-intersecting minimal surface.", "educational-scenes", "Surface", "surface"),
  unsupportedCard("pseudosphere", "Pseudosphere", "Surface with constant negative curvature.", "educational-scenes", "Surface", "surface"),
];

export const GEOMETRY_GALLERY_DEFAULT_CARD_ID = "box";

export const GEOMETRY_GALLERY_CARD_BY_ID = new Map(
  GEOMETRY_GALLERY_CARDS.map((card) => [card.id, card] as const)
);
