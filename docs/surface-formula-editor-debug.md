# Surface Formula Editor Debug Procedure

Use this procedure when the surface formula editor looks stuck, shows errors, or fails after switching to another object.

## Quick Triage (User Flow)

1. Open `Surfaces` mode and ensure dataset is `surface`.
2. Open `Surface editor`.
3. Check the validation banner:
   - `Valid expression`: parser accepted current inputs.
   - `Needs attention`: expression or required data is invalid/incomplete.
4. If you switched to a different surface object while the editor was open, reopen the editor for that object.
   - Current behavior auto-closes the editor on object switch to avoid stale state.

## Is Custom Formula Required?

For direct formula editing, the active object must be editable as custom.

1. `Graph` viewer:
   - Custom target is `graph_custom`.
   - Opening the editor from a preset auto-converts to custom when possible.
2. `Implicit` viewer:
   - Custom target is `implicit_custom`.
   - Opening the editor from a preset auto-converts to custom when possible.
3. `Param` viewer:
   - Use `custom` param surface for x(u,v), y(u,v), z(u,v) editing.
   - Rotational surfaces support:
     - `Formula` mode (`r(v)`, `z(v)`), or
     - `Points/Spline` mode with profile points text.
4. `Weierstrass` viewer:
   - Requires valid `g(z)` and `phi(z)`.

## Minimal Known-Good Inputs

Use these to separate parser issues from UI/state issues.

1. Graph: `sin(x)*cos(y)`
2. Implicit: `x^2 + y^2 + z^2 - 1`
3. Param:
   - `x(u,v) = cos(u)*(1+0.3*cos(v))`
   - `y(u,v) = sin(u)*(1+0.3*cos(v))`
   - `z(u,v) = 0.3*sin(v)`
4. Rotational formula:
   - `r(v) = 0.4 + 0.2*cos(v)`
   - `z(v) = 0.5*sin(v)`

## Failure Isolation Checklist

1. Confirm the failure reproduces after entering one known-good input.
2. Switch object, confirm editor closes, then reopen and re-test.
3. If `Needs attention` persists, copy the full detail text (includes parse column).
4. If parser is valid but render still fails, test with lower resolution in editor advanced settings.
5. Reset to a default preset, reopen editor, and re-apply the custom expression.

## Input Hang Debug Logs

Dedicated formula-editor input tracing is opt-in.

Typing stability mode:

1. Graph/implicit editors use manual apply.
2. Type in textarea, then use `Apply` (or `Ctrl+Enter`) to update the rendered surface.

1. Open DevTools Console.
2. Run: `localStorage.setItem("math3d:formula-editor-debug", "1")`
3. Reload app/view.
4. Reproduce the hang while watching Console for `FormulaEditorDebug` events:
   - `graph.input.focus` / `implicit.input.focus`
   - `graph.input.keydown` / `implicit.input.keydown`
   - `graph.input.beforeinput` / `implicit.input.beforeinput`
   - `graph.input.change` / `implicit.input.change`
   - `graph.flush.commit` / `implicit.flush.commit`
   - `graph.flush.frame` / `implicit.flush.frame` (`dtMs` is UI lag after commit)
5. Copy the last 30 `FormulaEditorDebug` lines when input freezes.

Disable tracing (optional):

1. Run: `localStorage.setItem("math3d:formula-editor-debug", "0")`
2. Reload app/view.

## Report Template (for bug tickets)

Include all of:

1. Viewer kind (`graph`, `implicit`, `param`, `weierstrass`)
2. Selected object id before and after switch
3. Exact expression(s) entered
4. Validation detail text
5. Whether issue reproduces with a known-good input
6. Whether issue reproduces after editor close/reopen
