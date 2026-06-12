export const PROCEDURAL_SCENE_SCRIPT_STARTER = [
  "# Procedural scene script",
  "# Commands: clear | add <type> [as id] [field=value ...] | set <id> field=value ... | delete <id>",
  "clear",
  "add box as base width=2 height=0.6 depth=1.4 y=-0.4 color=#8aa4ff",
  "add sphere as marker radius=0.45 x=1.15 y=0.25 z=0.2 color=#22c55e",
  "set marker opacity=0.9",
].join("\n");

export const PROCEDURAL_SCENE_SCRIPT_SYNTAX_EXAMPLES = [
  "clear",
  "add box as box1 x=1 y=2 z=3 color=#ff0000",
  "set box1 width=4 opacity=0.5",
  "hide box1",
  "show box1",
  "select box1",
  "delete box1",
] as const;
