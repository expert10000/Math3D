import { createGraph2DPublication, GRAPH2D_PUBLICATION_FORMATS, renderGraph2DPublicationArtifact, type Graph2DPublicationRequest } from "@math3d/core";

self.onmessage = (event: MessageEvent<{ request: Graph2DPublicationRequest }>) => {
  try {
    const publication = createGraph2DPublication(event.data.request);
    // Every file shares one owned snapshot; a raster limit must not hide the vector/table exports.
    const outputs = GRAPH2D_PUBLICATION_FORMATS.map(format => {
      try { return { format, artifact: renderGraph2DPublicationArtifact(publication, format) }; }
      catch (error) { return { format, error: (error as Error).message }; }
    });
    self.postMessage({ metadata: publication.metadata, snapshotId: publication.snapshotId, outputs },
      outputs.flatMap(output => output.artifact ? [output.artifact.bytes.buffer as ArrayBuffer] : []));
  } catch (error) { self.postMessage({ error: (error as Error).message }); }
};
