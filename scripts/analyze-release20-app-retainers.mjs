#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

const [snapshotArg, outputArg, receiptArg] = process.argv.slice(2);
if (!snapshotArg || !outputArg) throw new Error('Usage: analyze-release20-app-retainers.mjs <readable-heap-snapshot> <output-json> [memory-receipt]');
const bytes = readFileSync(resolve(snapshotArg));
const snapshot = JSON.parse(bytes.toString('utf8'));
const { nodes, edges, strings, meta } = {
  nodes: snapshot.nodes, edges: snapshot.edges, strings: snapshot.strings, meta: snapshot.snapshot.meta,
};
const nf = meta.node_fields, ef = meta.edge_fields;
const ns = nf.length, es = ef.length;
const nti = nf.indexOf('type'), nni = nf.indexOf('name'), nec = nf.indexOf('edge_count');
const eti = ef.indexOf('type'), eni = ef.indexOf('name_or_index'), eto = ef.indexOf('to_node');
const nt = meta.node_types[nti], et = meta.edge_types[eti];
const nodeCount = nodes.length / ns;
const starts = new Int32Array(nodeCount);
let edgeOffset = 0;
for (let node = 0; node < nodeCount; node++) {
  starts[node] = edgeOffset;
  edgeOffset += nodes[node * ns + nec];
}
if (edgeOffset * es !== edges.length) throw new Error('Invalid snapshot edge count');
const outgoing = node => {
  const result = [];
  const end = starts[node] + nodes[node * ns + nec];
  for (let edge = starts[node]; edge < end; edge++) {
    const at = edge * es, type = et[edges[at + eti]];
    const name = ['element', 'hidden'].includes(type) ? String(edges[at + eni]) : strings[edges[at + eni]];
    result.push({ type, name, target: edges[at + eto] / ns });
  }
  return result;
};
const appContexts = new Set();
for (let node = 0; node < nodeCount; node++) {
  const at = node * ns;
  if (nt[nodes[at + nti]] !== 'closure' || strings[nodes[at + nni]] !== 'applyWorkbookWorkspace') continue;
  const context = outgoing(node).find(edge => edge.type === 'internal' && edge.name === 'context')?.target;
  if (context !== undefined) appContexts.add(context);
}
if (appContexts.size < 2) throw new Error('App render contexts not identified; use a readable, nonminified build');
const links = new Map();
for (const context of appContexts) {
  for (const edge of outgoing(context)) {
    const target = edge.target, at = target * ns;
    if (nt[nodes[at + nti]] !== 'closure') continue;
    const captured = outgoing(target).find(item => item.type === 'internal' && item.name === 'context')?.target;
    if (captured === undefined || captured === context || !appContexts.has(captured)) continue;
    links.set(edge.name, (links.get(edge.name) ?? 0) + 1);
  }
}
const sorted = [...links].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
const result = {
  schema: 'math3d.release20.app-retainers.v1',
  diagnosticBuild: receiptArg ? JSON.parse(readFileSync(resolve(receiptArg), 'utf8')).build : null,
  method: 'V8 nonminified heap snapshot; identify App contexts through applyWorkbookWorkspace closure; count strong context-to-callback-to-other-App-context links',
  snapshotName: basename(snapshotArg), snapshotSha256: createHash('sha256').update(bytes).digest('hex'),
  nodeCount, appContextCount: appContexts.size, reusedCallbackNames: links.size,
  callbacksLinkingEveryObservedContext: sorted.filter(([, count]) => count >= appContexts.size - 1).length,
  mostFrequentLinks: sorted.slice(0, 20).map(([name, contexts]) => ({ name, contexts })),
};
mkdirSync(dirname(resolve(outputArg)), { recursive: true });
writeFileSync(resolve(outputArg), JSON.stringify(result, null, 2) + '\n');
console.log(`${result.appContextCount} App contexts, ${result.reusedCallbackNames} reused callback names`);
