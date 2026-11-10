import { isGraph2DMultiChannelFourierCurrent, type Graph2DDocument,
  type Graph2DFourierOptions, type Graph2DMultiChannelFourierResult } from "@math3d/core";

/** The result must match both its source generation and the Inspector's selected channels/options. */
export function isGraph2DFourierSelectionCurrent(result: Graph2DMultiChannelFourierResult,
  document: Graph2DDocument, objectIds: readonly string[], options: Graph2DFourierOptions): boolean {
  const source = result.source;
  return source.documentId === document.identity.id && source.revision === document.identity.revision &&
    source.structuralHash === document.identity.structuralHash &&
    result.channels.length > 0 && result.channels.length === objectIds.length &&
    result.channels.every((channel, index) => channel.objectId === objectIds[index]) &&
    result.options.window === options.window && result.options.normalization === options.normalization &&
    result.options.detrend === options.detrend && result.options.xUnit === options.xUnit &&
    isGraph2DMultiChannelFourierCurrent(result, document);
}
