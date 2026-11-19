#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const commit = 'a'.repeat(40);
const otherCommit = 'b'.repeat(40);
const temporary = mkdtempSync(join(tmpdir(), 'math3d-sage-oracle-'));
let servedCommit = otherCommit;
let runCount = 0;
const server = createServer(async (request, reply) => {
  reply.setHeader('Content-Type', 'application/json');
  if (request.url === '/health') {
    reply.end(JSON.stringify({ engine: 'sagemath', engineVersion: '10.10', available: true,
      operations: ['sage.symbolic.singularities'], math3dSourceCommit: servedCommit }));
    return;
  }
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  runCount++;
  const polynomial = Boolean(body.params.expression);
  const smooth = polynomial ? body.params.expression === 'x^2+y^2-1' :
    body.params.equations[0] === 'y-x';
  reply.end(JSON.stringify({ success: true, engine: 'sagemath', engineVersion: '10.10',
    result: { points: smooth ? [] : [polynomial ? { x: '0', y: '0' } :
      { x: '0', y: '0', z: '0' }], dimension: 1, codimension: 2,
      jacobianMinors: ['x'], criterion: 'F=0 and gradient F=0' } }));
});
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const run = label => new Promise(resolve => execFile(process.execPath,
    ['scripts/release20-sage-oracle.mjs', join(temporary, `${label}.json`)],
    { env: { ...process.env, MATH3D_RELEASE20_SAGE_SERVICE_URL: url,
      MATH3D_RELEASE20_SAGE_EXPECTED_SOURCE_COMMIT: commit } },
    error => resolve(error?.code ?? 0)));
  assert.notEqual(await run('wrong'), 0);
  assert.equal(runCount, 0, 'a mismatched source must fail before any Sage job');
  servedCommit = commit;
  assert.equal(await run('match'), 0);
  assert.equal(runCount, 4);
  console.log('Live Sage oracle requires matching worker source before cusp/smooth jobs.');
} finally {
  server.close();
  rmSync(temporary, { recursive: true, force: true });
}
