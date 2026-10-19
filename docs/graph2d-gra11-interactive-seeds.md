# GRA-11.6: interactive phase portrait initial points

Select a phase portrait, then drag any marked initial point on the plot to preview its forward and backward trajectory. Release commits the new point as one undoable edit; Escape on desktop or gesture cancellation on mobile discards the preview. A drag remains inside the authored x/y domain, including its boundary. The phase equations, style and other initial points stay unchanged.

Use **Place initial point** in the desktop Inspector or mobile Analyze sheet to arm the next canvas click/tap. Placement outside the authored domain is rejected, and the existing eight-point document limit is enforced. Ordinary canvas taps continue to probe when placement is not armed. The interaction is available on linear axes while graph sampling is ready and a parameter preview is inactive.

The preview uses the shared bounded phase portrait sampler at interaction quality. A new source revision and undo step are created only on release or placement, not on pointer movement. Sampling can lag the pointer on a slow device; the mobile marker follows the touch immediately while the orbit catches up. Physical-device gesture and accessibility signoff remains in the Graphs release gate.
