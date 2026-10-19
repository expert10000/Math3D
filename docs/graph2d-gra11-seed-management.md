# GRA-11.7: phase portrait seed management

The **Orbit explorer · two starts** preset is in Graphs → Gallery → Differential equations. It opens an ordinary editable phase portrait with two initial points on concentric circular trajectories. The two complete orbits fit the bounded Gallery preview budget. The preset uses the same source, sampler, save, and undo contracts as authored phase portraits.

Select the phase portrait and use the desktop Inspector or mobile Analyze sheet. Each numbered point shows its coordinates and its forward and backward orbit stop reasons, with accepted and rejected integration steps. Selecting a point highlights its marker. Remove deletes one point; Clear all initial points removes every point in one undoable edit. With no points, the direction field, nullclines, and equilibrium scan remain available. Place initial point arms the next canvas click or tap, and marker dragging continues to preview live trajectories.

The shared document now accepts 0–8 seeds. New portraits still start with one point. Removal and clearing retain the equations, domain, time horizon, display style, and other source objects. The Gallery preview and bundled catalog are generated from the curated preset source.

Verification: focused phase portrait, catalog, guided preset, and preview tests; desktop Gallery workflow; mobile typecheck; core build. Physical mobile gesture signoff remains in the Graphs release gate.
