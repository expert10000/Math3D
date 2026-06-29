import { GEOMETRY_OBJECT_REGISTRY, type GeometryObject } from "../proceduralObjects";

export type SerializeSceneToScriptOptions = {
  includeHeader?: boolean;
  selectedObjectId?: string | null;
};

const formatNumber = (value: number): string => {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.abs(value) < 1e-12 ? 0 : value;
  return Number.parseFloat(rounded.toFixed(6)).toString();
};

const formatColor = (value: number): string =>
  `#${Math.max(0, Math.min(0xffffff, Math.round(value))).toString(16).padStart(6, "0")}`;

const quoteAssignmentToken = (key: string, value: string): string => {
  const token = `${key}=${value}`;
  if (token && !/[\s"'\\]/.test(token)) return token;
  return `"${token.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
};

const appendNumberAssignment = (assignments: string[], key: string, value: unknown) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return;
  assignments.push(`${key}=${formatNumber(value)}`);
};

const appendScalarAssignment = (assignments: string[], key: string, value: unknown) => {
  if (typeof value === "number") {
    appendNumberAssignment(assignments, key, value);
    return;
  }
  if (typeof value === "boolean") {
    assignments.push(`${key}=${value ? "true" : "false"}`);
    return;
  }
  if (typeof value === "string") {
    assignments.push(quoteAssignmentToken(key, value));
  }
};

export const serializeSceneToScript = (
  objects: GeometryObject[],
  options: SerializeSceneToScriptOptions = {}
): string => {
  const lines: string[] = [];
  if (options.includeHeader ?? true) {
    lines.push("# Procedural scene script");
    lines.push("# Generated from the current Geometry scene.");
  }
  lines.push("clear");

  for (const object of objects) {
    const registry = GEOMETRY_OBJECT_REGISTRY[object.type];
    const assignments: string[] = [];

    for (const param of registry.params) {
      appendScalarAssignment(assignments, param.id, object.params[param.id]);
    }
    for (const [key, value] of Object.entries(object.params)) {
      if (registry.params.some((param) => param.id === key)) continue;
      appendScalarAssignment(assignments, key, value);
    }

    appendNumberAssignment(assignments, "x", object.transform.position.x);
    appendNumberAssignment(assignments, "y", object.transform.position.y);
    appendNumberAssignment(assignments, "z", object.transform.position.z);
    appendNumberAssignment(assignments, "rx", object.transform.rotation.x);
    appendNumberAssignment(assignments, "ry", object.transform.rotation.y);
    appendNumberAssignment(assignments, "rz", object.transform.rotation.z);
    appendNumberAssignment(assignments, "sx", object.transform.scale.x);
    appendNumberAssignment(assignments, "sy", object.transform.scale.y);
    appendNumberAssignment(assignments, "sz", object.transform.scale.z);

    if (typeof object.material.color === "number" && Number.isFinite(object.material.color)) {
      assignments.push(`color=${formatColor(object.material.color)}`);
    }
    appendNumberAssignment(assignments, "opacity", object.material.opacity);
    appendNumberAssignment(assignments, "roughness", object.material.roughness);
    appendNumberAssignment(assignments, "metalness", object.material.metalness);
    assignments.push(`visible=${object.visible ? "true" : "false"}`);
    assignments.push(quoteAssignmentToken("name", object.name));
    if (object.group) assignments.push(quoteAssignmentToken("group", object.group));

    lines.push(`add ${object.type} as ${object.id}${assignments.length ? ` ${assignments.join(" ")}` : ""}`);
  }

  if (options.selectedObjectId && objects.some((object) => object.id === options.selectedObjectId)) {
    lines.push(`select ${options.selectedObjectId}`);
  }

  return lines.join("\n");
};
