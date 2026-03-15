#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--exe" && i + 1 < argv.length) {
      out.exe = argv[i + 1];
      i += 1;
    }
  }
  return out;
}

function withTimeout(promise, timeoutMs, label) {
  let handle;
  const timeout = new Promise((_, reject) => {
    handle = setTimeout(() => reject(new Error(`Timeout: ${label}`)), timeoutMs);
  });
  return Promise.race([
    promise.finally(() => {
      if (handle) clearTimeout(handle);
    }),
    timeout,
  ]);
}

class WorkerClient {
  constructor(exePath) {
    this.proc = spawn(exePath, [], { stdio: ["pipe", "pipe", "pipe"] });
    this.buf = Buffer.alloc(0);
    this.waiters = [];
    this.stderrTail = "";

    this.proc.stdout.on("data", (chunk) => {
      this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : Buffer.from(chunk);
      this._pump();
    });

    this.proc.stderr.on("data", (chunk) => {
      this.stderrTail = (this.stderrTail + chunk.toString("utf8")).slice(-4000);
    });
  }

  _pump() {
    while (this.waiters.length) {
      const waiter = this.waiters[0];
      if (waiter.kind === "line") {
        const nl = this.buf.indexOf(10);
        if (nl < 0) return;
        const line = this.buf.subarray(0, nl).toString("utf8");
        this.buf = this.buf.subarray(nl + 1);
        this.waiters.shift();
        waiter.resolve(line);
        continue;
      }
      if (waiter.kind === "bytes") {
        if (this.buf.length < waiter.count) return;
        const payload = this.buf.subarray(0, waiter.count);
        this.buf = this.buf.subarray(waiter.count);
        this.waiters.shift();
        waiter.resolve(payload);
        continue;
      }
      return;
    }
  }

  readLine(timeoutMs = 30000) {
    const p = new Promise((resolve, reject) => {
      this.waiters.push({ kind: "line", resolve, reject });
      this._pump();
    });
    return withTimeout(p, timeoutMs, "readLine");
  }

  readBytes(count, timeoutMs = 60000) {
    const p = new Promise((resolve, reject) => {
      this.waiters.push({ kind: "bytes", count, resolve, reject });
      this._pump();
    });
    return withTimeout(p, timeoutMs, `readBytes(${count})`);
  }

  async request(msg) {
    this.proc.stdin.write(`${JSON.stringify(msg)}\n`);
    for (;;) {
      const line = await this.readLine(60000);
      let meta;
      try {
        meta = JSON.parse(line);
      } catch (err) {
        throw new Error(`Invalid JSON from worker: ${line}`);
      }

      if (meta?.jobId && msg?.jobId && meta.jobId !== msg.jobId) {
        continue;
      }
      if (meta?.type === "progress") {
        continue;
      }
      if (meta?.type === "error" || meta?.ok === false) {
        const code = String(meta?.code ?? "WORKER_ERROR");
        const message = String(meta?.message ?? "Worker error");
        throw new Error(`${code}: ${message}`);
      }

      const binary = Array.isArray(meta?.binary) ? meta.binary : [];
      let totalBytes = 0;
      for (const part of binary) {
        const n = Number(part?.bytes ?? 0);
        if (Number.isFinite(n) && n > 0) totalBytes += n;
      }
      if (totalBytes > 0) {
        await this.readBytes(totalBytes, 120000);
      }
      return meta;
    }
  }

  close() {
    try {
      this.proc.kill();
    } catch {
      // no-op
    }
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const exePath = args.exe
    ? path.resolve(args.exe)
    : path.resolve(process.cwd(), "build", "python-worker-dist", "worker.exe");

  const client = new WorkerClient(exePath);
  try {
    const ping = await client.request({ type: "ping", jobId: "smoke-ping" });
    if (ping.type !== "pong") {
      throw new Error(`Unexpected ping response: ${JSON.stringify(ping)}`);
    }

    const preview = await client.request({
      type: "mesh.preview",
      jobId: "smoke-preview",
      expr: "x^2 + y^2 + z^2",
      iso: 1.0,
      bbox: { min: [-1.2, -1.2, -1.2], max: [1.2, 1.2, 1.2] },
      resolution: 24,
    });

    if (preview.type !== "vtk_result" || !preview.ok) {
      throw new Error(`Unexpected mesh.preview response: ${JSON.stringify(preview)}`);
    }

    const triCount = Number(preview.triCount ?? 0);
    const vertexCount = Number(preview.vertexCount ?? 0);
    if (!(triCount > 0 && vertexCount > 0)) {
      throw new Error(`mesh.preview returned empty geometry: v=${vertexCount} t=${triCount}`);
    }

    process.stdout.write(
      `[smoke] ok ping + mesh.preview (vertices=${vertexCount}, tris=${triCount})\n`
    );
  } catch (err) {
    const detail = client.stderrTail ? `\n[worker-stderr]\n${client.stderrTail}` : "";
    throw new Error(`${String(err?.message ?? err)}${detail}`);
  } finally {
    client.close();
  }
}

main().catch((err) => {
  process.stderr.write(`[smoke] failed: ${String(err?.message ?? err)}\n`);
  process.exit(1);
});
