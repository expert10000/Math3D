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
