import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export async function auditBcoDmoVortex(path) {
  const groups = new Map();
  const input = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let lines = 0, missing = 0, malformed = 0;
  for await (const line of input) {
    if (lines++ === 0) {
      if (line !== "X,Y,Z,V_x,V_y,V_z,Flow_field,Level")
        throw new TypeError("Unexpected BCO-DMO flow_field.csv header.");
      continue;
    }
    const fields = line.split(",");
    if (fields.length !== 8) { malformed++; continue; }
    if (fields.slice(0, 6).some(value => value.trim() === "" ||
      !Number.isFinite(Number(value)))) { missing++; continue; }
    const key = `${fields[6]}/${fields[7]}`;
    let group = groups.get(key);
    if (!group) {
      group = { count: 0, coordinates: [new Set(), new Set(), new Set()],
        min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      groups.set(key, group);
    }
    group.count++;
    for (let axis = 0; axis < 3; axis++) group.coordinates[axis].add(Number(fields[axis]));
    for (let component = 0; component < 3; component++) {
      const value = Number(fields[3 + component]);
      group.min[component] = Math.min(group.min[component], value);
      group.max[component] = Math.max(group.max[component], value);
    }
  }
  const summary = Object.fromEntries([...groups].map(([name, group]) => {
    const axes = group.coordinates.map(set => {
      const values = [...set].sort((a, b) => a - b), spacings = values.slice(1).map((value, i) =>
        value - values[i]);
      const ideal = (values.at(-1) - values[0]) / (values.length - 1);
      return { count: values.length, min: values[0], max: values.at(-1), idealSpacing: ideal,
        minSpacing: Math.min(...spacings), maxSpacing: Math.max(...spacings),
        maxGridResidual: Math.max(...values.map((value, i) =>
          Math.abs(value - (values[0] + i * ideal)))) };
    });
    return [name, { rows: group.count, shape: axes.map(axis => axis.count),
      completeCount: axes.reduce((product, axis) => product * axis.count, 1),
      axes, velocityMin: group.min, velocityMax: group.max }];
  }));
  return { rows: lines - 1, missing, malformed, groups: summary };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = process.argv[2];
  if (!path) throw new Error("Usage: node scripts/audit-bco-dmo-vortex.mjs <flow_field.csv>");
  process.stdout.write(`${JSON.stringify(await auditBcoDmoVortex(resolve(path)), null, 2)}\n`);
}
