#!/usr/bin/env node
import { createServer } from 'node:http';

const token = process.env.MATH3D_RELEASE20_SAGE_BRIDGE_TOKEN;
if (!/^[0-9a-f]{64}$/.test(token ?? ''))
  throw new Error('MATH3D_RELEASE20_SAGE_BRIDGE_TOKEN must be 64 lowercase hex characters.');
const sourceCommit = process.env.MATH3D_RELEASE20_SAGE_SOURCE_COMMIT;
if (sourceCommit && !/^[0-9a-f]{40}$/.test(sourceCommit))
  throw new Error('MATH3D_RELEASE20_SAGE_SOURCE_COMMIT must be a full lowercase commit hash.');
const prefix = `/${token}`;
const routes = new Map([['/health', 'GET'], ['/run', 'POST'], ['/cancel', 'POST']]);
const port = Number(process.env.MATH3D_RELEASE20_SAGE_BRIDGE_PORT || 8768);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid Sage bridge port.');

createServer(async (request, reply) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  const route = pathname.startsWith(`${prefix}/`) ? pathname.slice(prefix.length) : '';
  if (routes.get(route) !== request.method || request.headers.authorization || request.url?.includes('?')) {
    reply.writeHead(404, { 'Cache-Control': 'no-store' }); reply.end(); return;
  }
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 65_536) throw new Error('Request too large.');
      chunks.push(chunk);
    }
    const upstream = await fetch(`http://127.0.0.1:8767${route}`, {
      method: request.method,
      ...(request.method === 'POST' ? { body: Buffer.concat(chunks) } : {}),
      headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(60_000),
    });
    let payload = Buffer.from(await upstream.arrayBuffer());
    if (route === '/health' && upstream.ok && sourceCommit) {
      const health = JSON.parse(payload.toString('utf8'));
      payload = Buffer.from(JSON.stringify({ ...health, math3dSourceCommit: sourceCommit }));
    }
    if (payload.byteLength > 1_048_576) throw new Error('Response too large.');
    reply.writeHead(upstream.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    reply.end(payload);
  } catch {
    reply.writeHead(502, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    reply.end('{"error":"Sage bridge unavailable"}');
  }
}).listen(port, '127.0.0.1', () => console.log(`Release Sage bridge listening on 127.0.0.1:${port}`));
