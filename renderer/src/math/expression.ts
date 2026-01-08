// src/math/expression.ts
type Tok =
  | { k: "num"; v: number; i: number }
  | { k: "id"; v: string; i: number }
  | { k: "op"; v: string; i: number }
  | { k: "lp"; i: number }
  | { k: "rp"; i: number }
  | { k: "comma"; i: number };

export type ExprError = { message: string; index: number; line: number; col: number };

const FUNCS: Record<string, (...args: number[]) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  log: Math.log,
  exp: Math.exp,
  min: Math.min,
  max: Math.max,
};

const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

function err(message: string, index: number): ExprError {
  return { message, index, line: 1, col: index + 1 };
}

function isWS(ch: string) { return ch === " " || ch === "\t" || ch === "\n" || ch === "\r"; }
function isDigit(ch: string) { return ch >= "0" && ch <= "9"; }
function isAlpha(ch: string) { return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_"; }

function tokenize(src: string): { toks: Tok[]; error?: ExprError } {
  const toks: Tok[] = [];
  let i = 0;

  while (i < src.length) {
    const ch = src[i];
    if (isWS(ch)) { i++; continue; }

    if (isDigit(ch) || (ch === "." && i + 1 < src.length && isDigit(src[i + 1]))) {
      const start = i;
      i++;
      while (i < src.length && (isDigit(src[i]) || src[i] === ".")) i++;
      const s = src.slice(start, i);
      const v = Number(s);
      if (!Number.isFinite(v)) return { toks, error: err(`Bad number: ${s}`, start) };
      toks.push({ k: "num", v, i: start });
      continue;
    }

    if (isAlpha(ch)) {
      const start = i;
      i++;
      while (i < src.length && (isAlpha(src[i]) || isDigit(src[i]))) i++;
      toks.push({ k: "id", v: src.slice(start, i), i: start });
      continue;
    }

    if (ch === "(") { toks.push({ k: "lp", i }); i++; continue; }
    if (ch === ")") { toks.push({ k: "rp", i }); i++; continue; }
    if (ch === ",") { toks.push({ k: "comma", i }); i++; continue; }

    // operators
    if ("+-*/^".includes(ch)) { toks.push({ k: "op", v: ch, i }); i++; continue; }

    return { toks, error: err(`Unexpected character '${ch}'`, i) };
  }

  return { toks };
}

// Insert implicit multiplications:
// num id, num lp, id num, id lp, rp id, rp num, rp lp
function insertImplicitMul(toks: Tok[]): Tok[] {
  const out: Tok[] = [];
  const isValueEnd = (t: Tok) => t.k === "num" || t.k === "id" || t.k === "rp";
  const isValueStart = (t: Tok) => t.k === "num" || t.k === "id" || t.k === "lp";

  for (let i = 0; i < toks.length; i++) {
    const a = toks[i];
    out.push(a);
    const b = toks[i + 1];
    if (!b) continue;
    if (isValueEnd(a) && isValueStart(b)) {
      out.push({ k: "op", v: "*", i: b.i });
    }
  }
  return out;
}

// Shunting-yard to RPN (supports unary minus as "neg")
type Rpn =
  | { t: "num"; v: number }
  | { t: "var"; name: string }
  | { t: "op"; op: string }
  | { t: "call"; fn: string; argc: number };

const PREC: Record<string, number> = { neg: 5, "^": 4, "*": 3, "/": 3, "+": 2, "-": 2 };
const RIGHT_ASSOC = new Set(["^", "neg"]);

export function compileExpression(
  src: string,
  allowedVars: string[]
): { fn?: (vars: Record<string, number>) => number; error?: ExprError } {
  const t0 = tokenize(src);
  if (t0.error) return { error: t0.error };

  const toks = insertImplicitMul(t0.toks);

  // parse to RPN
  const output: Rpn[] = [];
  const ops: Array<Tok | { k: "fn"; name: string; i: number } | { k: "uop"; op: string; i: number } | { k: "argc"; n: number }> = [];

  let prev: Tok | null = null;

  const pushOp = (op: string, i: number) => {
    const isUnary = op === "-" && (!prev || (prev.k === "op" || prev.k === "lp" || prev.k === "comma"));
    const realOp = isUnary ? "neg" : op;

    while (ops.length) {
      const top = ops[ops.length - 1];
      const topOp =
        (top as any).k === "uop" ? (top as any).op :
        (top as any).k === "op" ? (top as any).v :
        null;
      if (!topOp) break;

      const p1 = PREC[realOp] ?? 0;
      const p2 = PREC[topOp] ?? 0;

      if ((RIGHT_ASSOC.has(realOp) && p1 < p2) || (!RIGHT_ASSOC.has(realOp) && p1 <= p2)) {
        ops.pop();
        output.push({ t: "op", op: topOp });
        continue;
      }
      break;
    }

    // store as uop/op for disambiguation
    if (realOp === "neg") ops.push({ k: "uop", op: "neg", i });
    else ops.push({ k: "op", v: realOp, i } as any);
  };

  // function arg counting via markers
  for (let idx = 0; idx < toks.length; idx++) {
    const t = toks[idx];

    if (t.k === "num") {
      output.push({ t: "num", v: t.v });
    } else if (t.k === "id") {
      const name = t.v;
      const next = toks[idx + 1];

      if (name in FUNCS && next?.k === "lp") {
        ops.push({ k: "fn", name, i: t.i });
        // argc marker will be pushed when we see "("
      } else if (name in CONSTS) {
        output.push({ t: "num", v: CONSTS[name] });
      } else if (allowedVars.includes(name)) {
        output.push({ t: "var", name });
      } else {
        return { error: err(`Unknown identifier '${name}'`, t.i) };
      }
    } else if (t.k === "op") {
      pushOp(t.v, t.i);
    } else if (t.k === "lp") {
      ops.push(t);
      // if top-1 is a function, start argc at 0 (we’ll bump to 1 on first expr)
      const prevOp = ops[ops.length - 2];
      if (prevOp && (prevOp as any).k === "fn") ops.push({ k: "argc", n: 0 });
    } else if (t.k === "comma") {
      // pop until "("
      while (ops.length && (ops[ops.length - 1] as any).k !== "lp") {
        const top = ops.pop()!;
        const topOp = (top as any).op ?? (top as any).v;
        if (topOp) output.push({ t: "op", op: topOp });
      }
      if (!ops.length) return { error: err("Comma outside of function call", t.i) };
      // increment argc marker
      for (let j = ops.length - 1; j >= 0; j--) {
        if ((ops[j] as any).k === "argc") { (ops[j] as any).n++; break; }
        if ((ops[j] as any).k === "lp") break;
      }
    } else if (t.k === "rp") {
      while (ops.length && (ops[ops.length - 1] as any).k !== "lp") {
        const top = ops.pop()!;
        const topOp = (top as any).op ?? (top as any).v;
        if (topOp) output.push({ t: "op", op: topOp });
      }
      if (!ops.length) return { error: err("Mismatched ')'", t.i) };
      ops.pop(); // pop "("

      // handle function call if present
      const argcIdx = ops.length - 1;
      const maybeArgc = ops[argcIdx];
      const maybeFn = ops[argcIdx - 1];

      if (maybeArgc && (maybeArgc as any).k === "argc" && maybeFn && (maybeFn as any).k === "fn") {
        const argc = (maybeArgc as any).n + 1; // commas + 1
        ops.pop(); // argc
        const fn = ops.pop() as any; // fn
        output.push({ t: "call", fn: fn.name, argc });
      }
    }

    prev = t;
  }

  while (ops.length) {
    const top = ops.pop()!;
    if ((top as any).k === "lp") return { error: err("Mismatched '('", (top as any).i) };
    const topOp = (top as any).op ?? (top as any).v;
    if (topOp) output.push({ t: "op", op: topOp });
  }

  // Evaluate RPN safely (no new Function)
  const fn = (vars: Record<string, number>) => {
    const st: number[] = [];
    for (const n of output) {
      if (n.t === "num") st.push(n.v);
      else if (n.t === "var") st.push(vars[n.name] ?? 0);
      else if (n.t === "op") {
        if (n.op === "neg") {
          const a = st.pop() ?? 0;
          st.push(-a);
        } else {
          const b = st.pop() ?? 0;
          const a = st.pop() ?? 0;
          switch (n.op) {
            case "+": st.push(a + b); break;
            case "-": st.push(a - b); break;
            case "*": st.push(a * b); break;
            case "/": st.push(a / b); break;
            case "^": st.push(Math.pow(a, b)); break;
            default: st.push(NaN);
          }
        }
      } else if (n.t === "call") {
        const f = FUNCS[n.fn];
        const args = st.splice(Math.max(0, st.length - n.argc), n.argc);
        st.push(f(...args));
      }
    }
    return st.length ? st[st.length - 1] : NaN;
  };

  return { fn };
}
