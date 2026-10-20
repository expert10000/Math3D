import { useRef } from "react";

type Props = { label: string; ariaLabel: string; value: string; onChange: (value: string) => void; suffix?: string };

const functions = [
  { label: "sin", name: "sin" }, { label: "cos", name: "cos" }, { label: "tg", name: "tan" },
  { label: "exp", name: "exp" }, { label: "√", name: "sqrt" }, { label: "abs", name: "abs" },
  { label: "ln", name: "ln" }, { label: "log", name: "log" },
] as const;

export function insertGraph2DFormulaFunction(value: string, start: number, end: number, name: string) {
  const selected = value.slice(start, end);
  const replacement = `${name}(${selected})`;
  return {
    value: value.slice(0, start) + replacement + value.slice(end),
    cursor: start + name.length + 1 + selected.length,
  };
}

export function Graph2DFormulaInput({ label, ariaLabel, value, onChange, suffix }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const insert = (name: string) => {
    const input = inputRef.current;
    if (!input) return;
    const active = document.activeElement === input;
    const start = active ? input.selectionStart ?? value.length : value.length;
    const end = active ? input.selectionEnd ?? start : start;
    const next = insertGraph2DFormulaFunction(value, start, end, name);
    onChange(next.value);
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(next.cursor, next.cursor); });
  };
  return <div className="graph2d-formula-input">
    <label>{label} <input ref={inputRef} aria-label={ariaLabel} value={value} spellCheck={false}
      onChange={event => onChange(event.target.value)} />{suffix}</label>
    <div className="graph2d-formula-buttons" role="group" aria-label="Formula functions">
      {functions.map(({ label: buttonLabel, name }) => <button key={name} type="button" title={`Insert ${name}(…)`}
        onMouseDown={event => event.preventDefault()} onClick={() => insert(name)}>{buttonLabel}</button>)}
    </div>
  </div>;
}
