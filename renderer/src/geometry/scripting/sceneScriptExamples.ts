export const PROCEDURAL_SCENE_SCRIPT_STARTER = [
  "# Procedural scene script",
  "# Commands: clear | add <type> [as id] [field=value ...] | set <id> field=value ... | delete <id>",
  "# Types include box, cube, sphere, cylinder, cone, torus, plane, polygon, polyhedron.",
  "clear",
  "add box as base width=2 height=0.6 depth=1.4 y=-0.4 color=#8aa4ff",
  "add cube as block size=0.6 x=-1.1 y=0.15 color=#f59e0b",
  "add sphere as marker radius=0.45 x=1.15 y=0.25 z=0.2 color=#22c55e",
  "set marker opacity=0.9",
].join("\n");

export const PROCEDURAL_SCENE_SCRIPT_ROUND_TRIP_FIXTURE = [
  "# Bidirectional Scene Script UI self-test",
  "clear",
  'add box as box_alpha width=2.75 height=1.25 depth=3.5 x=-1.5 y=0.25 z=2 rx=0.1 ry=0.2 rz=0.3 sx=1.1 sy=0.9 sz=1.2 color=#123abc opacity=0.65 roughness=0.42 metalness=0.17 visible=true "name=Primary Box" "group=roundtrip group"',
  'add sphere as sphere_beta radius=1.375 widthSegments=24 heightSegments=16 x=2 y=-0.5 z=0.75 color=#22c55e opacity=0.8 roughness=0.3 metalness=0.05 visible=false "name=Hidden Sphere" "group=roundtrip group"',
  'add torus as torus_gamma radius=1.6 tube=0.2 radialSegments=10 tubularSegments=36 arc=5.5 x=0 y=1.25 z=-1.5 rx=1.570796 color=#f97316 opacity=0.9 roughness=0.25 metalness=0.4 visible=true "name=Orbit Torus" "group=secondary group"',
  "select box_alpha",
].join("\n");

export const PROCEDURAL_SCENE_SCRIPT_SYNTAX_EXAMPLES = [
  "clear",
  "add cube as cube1 size=2 x=-1 color=#f59e0b",
  "add box as box1 x=1 y=2 z=3 color=#ff0000",
  "set box1 width=4 opacity=0.5",
  "hide box1",
  "show box1",
  "select box1",
  "delete box1",
] as const;

export type PreparedGeometrySceneScript = {
  id: string;
  title: string;
  description: string;
  objectCount: number;
  cameraRadius: number;
  script: string;
};

const objectAtlasTypes = ["box", "sphere", "cylinder", "cone", "torus"] as const;
const objectAtlasColors = ["#4169af", "#19a7a0", "#ef9b43", "#ad69c8", "#dc6576"] as const;
const objectAtlas = [
  "# Twenty-object atlas: four rows of five editable solids",
  "clear",
  ...Array.from({ length: 20 }, (_, index) => {
    const column = index % 5;
    const row = Math.floor(index / 5);
    const type = objectAtlasTypes[(column + row) % objectAtlasTypes.length];
    const color = objectAtlasColors[(column + row * 2) % objectAtlasColors.length];
    return `add ${type} as atlas_${index + 1} x=${(column - 2) * 1.8} y=${(1.5 - row) * 1.8} z=0 sx=0.58 sy=0.58 sz=0.58${type === "torus" ? " arc=6.283185" : ""} color=${color} "name=Atlas ${index + 1}" "group=Object atlas"`;
  }),
  "select atlas_1",
].join("\n");

const orbitLab = [
  "# Orbit lab: central sphere and nine satellite solids",
  "clear",
  'add sphere as center radius=0.9 x=0 y=0 z=0 color=#f4b544 "name=Center" "group=Orbit lab"',
  ...Array.from({ length: 9 }, (_, index) => {
    const angle = (index / 9) * Math.PI * 2;
    const x = (Math.cos(angle) * 3.1).toFixed(3);
    const y = (Math.sin(angle) * 3.1).toFixed(3);
    const type = index % 3 === 0 ? "torus" : index % 3 === 1 ? "sphere" : "cone";
    const color = ["#2c8cbe", "#44b49a", "#b77bc9"][index % 3];
    return `add ${type} as satellite_${index + 1} x=${x} y=${y} z=0 sx=0.42 sy=0.42 sz=0.42${type === "torus" ? " arc=6.283185" : ""} color=${color} "name=Satellite ${index + 1}" "group=Orbit lab"`;
  }),
  "select center",
].join("\n");

export const PREPARED_GEOMETRY_SCENE_SCRIPTS: readonly PreparedGeometrySceneScript[] = [
  {
    id: "five-solids",
    title: "Five solids",
    description: "Box, sphere, cylinder, cone, and torus for a quick material and transform tour.",
    objectCount: 5,
    cameraRadius: 6.5,
    script: [
      "# Five solids: a compact editable scene",
      "clear",
      'add box as box_1 x=-3.6 y=0 z=0 sx=0.75 sy=0.75 sz=0.75 color=#4169af "name=Blue box"',
      'add sphere as sphere_1 x=-1.8 y=0 z=0 radius=0.75 color=#1fa79c "name=Teal sphere"',
      'add cylinder as cylinder_1 x=0 y=0 z=0 sx=0.65 sy=0.65 sz=0.65 color=#e8a13f "name=Amber cylinder"',
      'add cone as cone_1 x=1.8 y=0 z=0 sx=0.7 sy=0.7 sz=0.7 color=#b36ac8 "name=Violet cone"',
      'add torus as torus_1 x=3.6 y=0 z=0 sx=0.65 sy=0.65 sz=0.65 arc=6.283185 color=#d97077 "name=Coral torus"',
      "select box_1",
    ].join("\n"),
  },
  {
    id: "five-symmetry",
    title: "Five-point symmetry",
    description: "One center and four cardinal markers for symmetry and distance checks.",
    objectCount: 5,
    cameraRadius: 4.6,
    script: [
      "# Five-point symmetry",
      "clear",
      'add sphere as center radius=0.8 color=#efac42 "name=Center"',
      'add sphere as east radius=0.48 x=2.3 color=#2d8fb9 "name=East"',
      'add sphere as west radius=0.48 x=-2.3 color=#2d8fb9 "name=West"',
      'add sphere as north radius=0.48 y=2.3 color=#8e70ce "name=North"',
      'add sphere as south radius=0.48 y=-2.3 color=#8e70ce "name=South"',
      "select center",
    ].join("\n"),
  },
  {
    id: "ten-workshop",
    title: "Ten-object workshop",
    description: "Two rows of contrasting primitives for selection, measurement, and comparison.",
    objectCount: 10,
    cameraRadius: 6.5,
    script: [
      "# Ten-object workshop",
      "clear",
      ...Array.from({ length: 10 }, (_, index) => {
        const column = index % 5;
        const row = Math.floor(index / 5);
        const type = objectAtlasTypes[(column + row) % objectAtlasTypes.length];
        const color = objectAtlasColors[(column + row) % objectAtlasColors.length];
        return `add ${type} as workshop_${index + 1} x=${(column - 2) * 1.8} y=${row === 0 ? 1.1 : -1.1} sx=0.62 sy=0.62 sz=0.62${type === "torus" ? " arc=6.283185" : ""} color=${color} "name=Workshop ${index + 1}" "group=Workshop"`;
      }),
      "select workshop_1",
    ].join("\n"),
  },
  {
    id: "ten-orbit",
    title: "Ten-object orbit lab",
    description: "A central sphere with nine satellite solids arranged on a circular orbit.",
    objectCount: 10,
    cameraRadius: 6.1,
    script: orbitLab,
  },
  {
    id: "twenty-atlas",
    title: "Twenty-object atlas",
    description: "A 4 × 5 collection for stress-testing selection, visibility, and Scene Script round trips.",
    objectCount: 20,
    cameraRadius: 8.4,
    script: objectAtlas,
  },
];
