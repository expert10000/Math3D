import { chromium } from "playwright";
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const electronPath = require("electron");
const repoRoot = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const outputDir = path.join(repoRoot, "output");
const dwellMs = Number(process.env.MATH3D_NAV_DWELL_MS ?? 4000);
const sampleMs = Number(process.env.MATH3D_NAV_SAMPLE_MS ?? 2000);
const modeTimeoutMs = Number(process.env.MATH3D_NAV_MODE_TIMEOUT_MS ?? 240000);
const modes = (process.env.MATH3D_NAV_GPU_MODES ?? "hardware,disabled,swiftshader")
  .split(",")
  .map((mode) => mode.trim())
  .filter(Boolean);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");

const navActions = [
  { label: "Surfaces", buttonText: "Surfaces" },
  {
    label: "Cycle explicit presets",
    familyTestId: "surface-family-explicit",
    cycleButtons: ["Saddle graph", "Rotated saddle", "Monkey saddle", "Wave", "Paraboloid graph", "Gaussian bump", "Ripple", "Mexican hat", "Sin+Cos", "Sinc", "Sinc (decay)"],
  },
  {
    label: "Cycle implicit presets",
    familyTestId: "surface-family-implicit",
    cycleButtons: ["Sphere", "Hyperboloid", "Paraboloid", "Cone", "Cylinder", "Two-sheet hyperboloid", "Ellipsoid", "Torus (implicit)", "Gyroid", "Superquadric"],
  },
  {
    label: "Cycle parametric presets",
    familyTestId: "surface-family-parametric",
    cycleButtons: ["Catenoid", "Sphere", "Ellipsoid", "Paraboloid (param)", "Pseudosphere", "Dini surface", "Twisted strip", "Torus", "Möbius strip", "Klein bottle", "Enneper surface"],
  },
  { label: "Topology workspace", buttonText: "Topology", cycleButtons: ["Euler", "Constructing polygon", "Polyhedra", "Klein", "Mobius", "Torus", "Dunce map"] },
  { label: "Geometry workspace", buttonText: "Geometry", cycleButtons: ["Create", "Scene", "Object", "Construct", "Edit", "View", "History", "Analyze", "Compare", "Demonstrations", "Measure"] },
  {
    label: "Complex Analysis workspace",
    buttonText: "Complex Analysis",
    cycleButtons: ["Function Explorer", "Möbius Lab", "Riemann Sphere", "Residue Lab", "Branch Lab", "Covering Lab", "Complex map"],
  },
  { label: "Surfaces return", buttonText: "Surfaces" },
  { label: "Implicit return", testId: "surface-family-implicit" },
  { label: "Parametric return", testId: "surface-family-parametric" },
];

function processTreeSample(rootPid) {
  const ps = `
$root=${rootPid}
$all=Get-CimInstance Win32_Process -Filter "Name = 'electron.exe'"
$ids=New-Object System.Collections.Generic.HashSet[int]
[void]$ids.Add($root)
$changed=$true
while ($changed) {
  $changed=$false
  foreach ($p in $all) {
    if ($ids.Contains([int]$p.ParentProcessId) -and -not $ids.Contains([int]$p.ProcessId)) {
      [void]$ids.Add([int]$p.ProcessId)
      $changed=$true
    }
  }
}
$rows=@()
foreach ($id in $ids) {
  $gp=Get-Process -Id $id -ErrorAction SilentlyContinue
  if ($gp) {
    $rows += [pscustomobject]@{ pid=$id; name=$gp.ProcessName; rssBytes=[int64]$gp.WorkingSet64 }
  }
}
$sum=($rows | Measure-Object -Property rssBytes -Sum).Sum
[pscustomobject]@{ totalBytes=[int64]$sum; count=$rows.Count; processes=$rows } | ConvertTo-Json -Compress -Depth 4
`;
  try {
    const raw = execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps], {
      encoding: "utf8",
      timeout: 5000,
    });
    return JSON.parse(raw);
  } catch (error) {
    return { error: String(error?.message ?? error), totalBytes: 0, count: 0, processes: [] };
  }
}

async function waitForCdp(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return;
    } catch {
      // keep polling
    }
    await sleep(250);
  }
  throw new Error(`CDP did not open on port ${port}`);
}

function activePage(browser) {
  for (const context of browser.contexts()) {
    const pages = context.pages().filter((page) => !page.isClosed());
    const filePage = pages.find((page) => page.url().startsWith("file:"));
    if (filePage) return filePage;
    if (pages[0]) return pages[0];
  }
  return null;
}

async function pageState(browser) {
  const page = activePage(browser);
  if (!page) return { alive: false, url: "", shellVisible: false, textLength: 0 };
  try {
    const shellVisible = await page.locator("[data-testid='app-shell']").first().isVisible({ timeout: 750 }).catch(() => false);
    const textLength = await page.evaluate(() => (document.body?.innerText ?? "").trim().length).catch(() => 0);
    return { alive: true, url: page.url(), shellVisible, textLength, title: await page.title().catch(() => "") };
  } catch (error) {
    return { alive: false, url: page.url(), shellVisible: false, textLength: 0, error: String(error?.message ?? error) };
  }
}

async function waitForAppShell(browser, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const page = activePage(browser);
    if (page && (await page.locator("[data-testid='app-shell']").first().isVisible({ timeout: 1000 }).catch(() => false))) {
      return page;
    }
    await sleep(250);
  }
  throw new Error("app shell did not become visible");
}

function fatalStateReason(state) {
  if (!state?.alive) return "page/browser is closed";
  if (!state.shellVisible && state.textLength === 0) return "blank renderer: app shell hidden and body text empty";
  return "";
}

async function dismissDialogs(page) {
  for (const name of [/^Cancel$/i, /^Anuluj$/i, /^No$/i]) {
    const button = page.getByRole("button", { name }).first();
    if (await button.isVisible({ timeout: 500 }).catch(() => false)) {
      await button.click({ timeout: 2000 }).catch(() => {});
      await sleep(250);
    }
  }
}

async function domClickVisibleButton(page, text) {
  return page.evaluate((targetText) => {
    const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    const isVisible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    };
    const buttons = Array.from(document.querySelectorAll("button, [role='button']"));
    const match = buttons.find((element) => normalize(element.textContent) === targetText && isVisible(element));
    if (!match) return false;
    match.scrollIntoView({ block: "center", inline: "center" });
    match.click();
    return true;
  }, text);
}

async function clickButtonText(page, text, optional = false) {
  const locator = page.getByRole("button", { name: text, exact: true }).first();
  try {
    await locator.waitFor({ state: "visible", timeout: optional ? 2500 : 6000 });
    await locator.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {});
    await locator.click({ timeout: 3000 });
    return { text, clicked: true, method: "playwright" };
  } catch (error) {
    const clicked = await domClickVisibleButton(page, text).catch(() => false);
    if (clicked) return { text, clicked: true, method: "dom-fallback" };
    if (optional) return { text, clicked: false, method: "missing" };
    throw error;
  }
}

async function clickAction(browser, action) {
  const page = await waitForAppShell(browser, 6000);
  await dismissDialogs(page);
  const details = [];
  if (action.buttonText) {
    details.push(await clickButtonText(page, action.buttonText));
    await sleep(1200);
  }
  if (action.testId) {
    const locator = page.locator(`[data-testid="${action.testId}"]`).first();
    await locator.waitFor({ state: "visible", timeout: 6000 });
    await locator.click({ timeout: 3000 });
    details.push({ testId: action.testId, clicked: true, method: "playwright" });
    await sleep(1200);
  }
  if (action.familyTestId) {
    const locator = page.locator(`[data-testid="${action.familyTestId}"]`).first();
    await locator.waitFor({ state: "visible", timeout: 6000 });
    await locator.click({ timeout: 3000 });
    details.push({ testId: action.familyTestId, clicked: true, method: "playwright" });
    await sleep(1200);
  }
  if (Array.isArray(action.cycleButtons)) {
    for (const text of action.cycleButtons) {
      details.push(await clickButtonText(page, text, true));
      await sleep(Number(process.env.MATH3D_NAV_INNER_DWELL_MS ?? 1200));
    }
  }
  return details;
}

async function visiblePageSummary(browser) {
  const page = activePage(browser);
  if (!page) return "no active page";
  return page.evaluate(() => {
    const text = (document.body?.innerText ?? "").replace(/\s+/g, " ").trim();
    return text.slice(0, 700);
  }).catch((error) => `summary failed: ${String(error?.message ?? error)}`);
}

async function runMode(mode, index) {
  const port = 9330 + index;
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), `math3d-nav-${mode}-`));
  const env = {
    ...process.env,
    APPDATA: profileDir,
    LOCALAPPDATA: profileDir,
    ELECTRON_ENABLE_LOGGING: "1",
    MATH3D_E2E: "1",
    MATH3D_GPU_MODE: mode,
    MATH3D_WORKER_FAILURE_INJECTION: "worker-success",
    MATH3D_RENDERER_MEMORY_AUTO_RELOAD: "1",
    MATH3D_START_MAXIMIZED: "1",
    MATH3D_SKIP_AUTOSAVE_RECOVERY: "1",
  };
  delete env.ELECTRON_RUN_AS_NODE;

  const child = spawn(electronPath, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "--start-maximized",
    ".",
  ], {
    cwd: repoRoot,
    env,
    windowsHide: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const startedAt = Date.now();
  const samples = [];
  const events = [];
  const logs = [];
  let fatalReason = "";
  let stopping = false;
  let browser = null;
  let sampler = null;

  const logChunk = (source, chunk) => {
    const lines = String(chunk).split(/\r?\n/).filter(Boolean);
    for (const line of lines) logs.push({ t: Math.round((Date.now() - startedAt) / 1000), source, line });
  };
  child.stdout.on("data", (chunk) => logChunk("stdout", chunk));
  child.stderr.on("data", (chunk) => logChunk("stderr", chunk));
  child.on("exit", (code, signal) => {
    logs.push({ t: Math.round((Date.now() - startedAt) / 1000), source: "process", line: `electron exit code=${code ?? ""} signal=${signal ?? ""}` });
  });

  const sample = async (phase) => {
    if (stopping) return null;
    const memory = processTreeSample(child.pid);
    const state = browser ? await pageState(browser) : { alive: false, url: "", shellVisible: false, textLength: 0 };
    if (stopping) return null;
    const entry = {
      t: Math.round((Date.now() - startedAt) / 1000),
      phase,
      rssGb: Number(((memory.totalBytes ?? 0) / 1024 / 1024 / 1024).toFixed(2)),
      processCount: memory.count ?? 0,
      pids: (memory.processes ?? []).map((p) => p.pid).sort((a, b) => a - b),
      state,
    };
    samples.push(entry);
    const reason = fatalStateReason(state);
    if (reason && !fatalReason) {
      fatalReason = `${phase}: ${reason}`;
    }
    return entry;
  };

  try {
    await waitForCdp(port);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    await waitForAppShell(browser);
    sampler = setInterval(() => {
      void sample("interval");
    }, sampleMs);
    await sample("start");

    for (const action of navActions) {
      if (Date.now() - startedAt > modeTimeoutMs) {
        events.push({
          t: Math.round((Date.now() - startedAt) / 1000),
          action: "mode-timeout",
          ok: false,
          error: `mode exceeded ${(modeTimeoutMs / 1000).toFixed(0)}s internal timeout`,
        });
        break;
      }
      const before = Date.now();
      try {
        const details = await clickAction(browser, action);
        events.push({ t: Math.round((Date.now() - startedAt) / 1000), action: action.label, ok: true, details });
      } catch (error) {
        events.push({
          t: Math.round((Date.now() - startedAt) / 1000),
          action: action.label,
          ok: false,
          error: String(error?.message ?? error).split("\n")[0],
          visibleText: await visiblePageSummary(browser),
        });
      }
      const after = await sample(`after:${action.label}`);
      const reason = after ? fatalStateReason(after.state) : "";
      if (reason) {
        events.push({
          t: Math.round((Date.now() - startedAt) / 1000),
          action: "fatal-stop",
          ok: false,
          error: reason,
        });
        break;
      }
      const elapsed = Date.now() - before;
      await sleep(Math.max(0, dwellMs - elapsed));
    }

    await sample("end");
  } catch (error) {
    events.push({ t: Math.round((Date.now() - startedAt) / 1000), action: "mode", ok: false, error: String(error?.message ?? error) });
    await sample("failed").catch(() => {});
  } finally {
    stopping = true;
    if (sampler) clearInterval(sampler);
    if (browser) await browser.close().catch(() => {});
    if (!child.killed) child.kill();
    await sleep(750);
    fs.rmSync(profileDir, { recursive: true, force: true });
  }

  const peakGb = samples.reduce((max, s) => Math.max(max, s.rssGb), 0);
  const finalGb = samples[samples.length - 1]?.rssGb ?? 0;
  const failedActions = events.filter((event) => event.ok === false);
  const shellFailures = samples.filter((sample) => sample.state && sample.state.alive && !sample.state.shellVisible).length;
  const pidSets = new Set(samples.map((sample) => sample.pids.join(",")));

  return {
    mode,
    dwellMs,
    sampleMs,
    modeTimeoutMs,
    ok: failedActions.length === 0 && shellFailures === 0,
    peakGb,
    finalGb,
    failedActions,
    fatalReason,
    shellFailures,
    processSetChanges: Math.max(0, pidSets.size - 1),
    events,
    samples,
    logs,
  };
}

fs.mkdirSync(outputDir, { recursive: true });
const started = new Date().toISOString();
const results = [];
const runStamp = stamp();
const jsonPath = path.join(outputDir, `guard-nav-memory-${runStamp}.json`);
const mdPath = jsonPath.replace(/\.json$/, ".md");
const writeReport = () => {
  const report = { started, finished: new Date().toISOString(), repoRoot, modes, results };
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  const md = [
    "# Guard Nav Memory Check",
    "",
    `Started: ${started}`,
    `Dwell between clicks: ${(dwellMs / 1000).toFixed(1)}s`,
    `Sample interval: ${(sampleMs / 1000).toFixed(1)}s`,
    `Mode timeout: ${(modeTimeoutMs / 1000).toFixed(0)}s`,
    "",
    "| Mode | OK | Peak RSS | Final RSS | Failed actions | Shell failures | Process-set changes | Fatal reason |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ...results.map((result) =>
      `| ${result.mode} | ${result.ok ? "yes" : "no"} | ${result.peakGb.toFixed(2)} GB | ${result.finalGb.toFixed(2)} GB | ${result.failedActions.length} | ${result.shellFailures} | ${result.processSetChanges} | ${result.fatalReason || ""} |`
    ),
    "",
    `JSON: ${jsonPath}`,
    "",
  ].join("\n");
  fs.writeFileSync(mdPath, md, "utf8");
};
for (let i = 0; i < modes.length; i += 1) {
  console.log(`[nav-memory] mode ${modes[i]} start`);
  const result = await runMode(modes[i], i);
  results.push(result);
  writeReport();
  console.log(`[nav-memory] mode ${modes[i]} done ok=${result.ok} peak=${result.peakGb}GB final=${result.finalGb}GB`);
}

writeReport();
console.log(fs.readFileSync(mdPath, "utf8"));
