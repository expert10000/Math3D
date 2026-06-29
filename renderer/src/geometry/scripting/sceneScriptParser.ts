import { createSceneScriptDiagnostic } from "./sceneScriptDiagnostics";
import type {
  SceneScriptAssignment,
  SceneScriptDiagnostic,
  SceneScriptParseResult,
} from "./sceneScriptTypes";

const tokenizeScriptLine = (line: string): string[] =>
  (line.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\S+/g) ?? []).map((token) => {
    if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
      return token
        .slice(1, -1)
        .replace(/\\(["'])/g, "$1")
        .replace(/\\\\/g, "\\");
    }
    return token;
  });

const parseAssignments = (
  tokens: string[],
  startIndex: number,
  line: number
): {
  assignments: SceneScriptAssignment[];
  diagnostic: SceneScriptDiagnostic | null;
} => {
  const assignments: SceneScriptAssignment[] = [];
  for (let index = startIndex; index < tokens.length; index += 1) {
    const token = tokens[index];
    const equalsIndex = token.indexOf("=");
    if (equalsIndex <= 0) {
      return {
        assignments,
        diagnostic: createSceneScriptDiagnostic(line, "invalid-assignment", `expected key=value, got '${token}'`),
      };
    }
    assignments.push({
      key: token.slice(0, equalsIndex),
      value: token.slice(equalsIndex + 1),
    });
  }
  return { assignments, diagnostic: null };
};

export const parseSceneScript = (script: string): SceneScriptParseResult => {
  const commands: SceneScriptParseResult["commands"] = [];
  const diagnostics: SceneScriptDiagnostic[] = [];
  const lines = script.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = index + 1;
    const raw = lines[index].trim();
    if (!raw || raw.startsWith("#")) continue;

    const tokens = tokenizeScriptLine(raw);
    if (!tokens.length) continue;
    const head = tokens[0].toLowerCase();

    if (head === "clear") {
      commands.push({ kind: "clear", line, raw });
      continue;
    }

    if (head === "add" || head === "object") {
      const objectType = tokens[1];
      if (!objectType) {
        diagnostics.push(createSceneScriptDiagnostic(line, "missing-object-type", "missing object type"));
        continue;
      }
      let assignmentStart = 2;
      let id: string | null = null;
      if (tokens[assignmentStart]?.toLowerCase() === "as") {
        id = tokens[assignmentStart + 1] ?? "";
        assignmentStart += 2;
      }
      const parsedAssignments = parseAssignments(tokens, assignmentStart, line);
      commands.push({ kind: "add", line, raw, objectType, id, assignments: parsedAssignments.assignments });
      if (parsedAssignments.diagnostic) diagnostics.push(parsedAssignments.diagnostic);
      continue;
    }

    if (head === "set" || head === "update") {
      const id = tokens[1];
      if (!id) {
        diagnostics.push(createSceneScriptDiagnostic(line, "missing-object-id", "missing object id"));
        continue;
      }
      if (tokens.length < 3) {
        diagnostics.push(createSceneScriptDiagnostic(line, "missing-assignment", "set needs at least one key=value pair"));
        commands.push({ kind: "set", line, raw, id, assignments: [] });
        continue;
      }
      const parsedAssignments = parseAssignments(tokens, 2, line);
      commands.push({ kind: "set", line, raw, id, assignments: parsedAssignments.assignments });
      if (parsedAssignments.diagnostic) diagnostics.push(parsedAssignments.diagnostic);
      continue;
    }

    if (head === "delete" || head === "remove") {
      const id = tokens[1];
      if (!id) {
        diagnostics.push(createSceneScriptDiagnostic(line, "missing-object-id", "missing object id"));
        continue;
      }
      commands.push({ kind: "delete", line, raw, id });
      continue;
    }

    if (head === "show" || head === "hide") {
      const id = tokens[1];
      if (!id) {
        diagnostics.push(createSceneScriptDiagnostic(line, "missing-object-id", "missing object id"));
        continue;
      }
      commands.push({ kind: "setVisibility", line, raw, id, visible: head === "show" });
      continue;
    }

    if (head === "select") {
      const id = tokens[1];
      if (!id) {
        diagnostics.push(createSceneScriptDiagnostic(line, "missing-object-id", "missing object id"));
        continue;
      }
      commands.push({ kind: "select", line, raw, id });
      continue;
    }

    diagnostics.push(createSceneScriptDiagnostic(line, "unknown-command", `unknown command '${tokens[0]}'`));
  }

  return { commands, diagnostics };
};
