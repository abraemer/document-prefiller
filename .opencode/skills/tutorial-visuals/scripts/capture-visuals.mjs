#!/usr/bin/env node
/**
 * Tutorial visual capture.
 *
 * Drives the REAL Electron app (vite-built renderer served by an in-process
 * static file server, real main/preload bundles) via Playwright's _electron
 * API and writes tutorial screenshots to docs/tutorial/assets/.
 *
 * All app mocking is runtime-only (no src/ changes):
 *   - dialog.showOpenDialog pops a queue seeded with the temp input and
 *     output folders (folder:select calls the promise form with a window arg,
 *     src/main/ipc/folder.ts:118)
 *   - shell.openPath is a no-op (document:replace opens the OS file manager
 *     on success, src/main/ipc/document.ts:93-96, which would corrupt
 *     captures)
 *
 * Captured flow (docs/tutorial/assets/):
 *   - 01-initial.png           app open, no folder selected
 *   - 02-markers-detected.png  markers listed after folder scan
 *   - 03-values-entered.png    all 8 marker inputs filled with VALUES
 *   - 04-replace-success.png   'Replacement Complete' snackbar
 *   - demo.gif                 assembled from keystroke frames (ffmpeg)
 *
 * The filled documents are copied to docs/tutorial/outputs/ and verified with
 * JSZip (expected VALUES present in word/document.xml, zero REPLACEME-
 * occurrences).
 *
 * Temp layout:
 *   - input dir: STABLE path <tmpdir>/document-prefiller-examples, recreated
 *     fresh each run (working copy of docs/tutorial/templates/*.docx - the
 *     app writes .replacement-values.json into the folder it opens, so the
 *     committed folder must stay clean; the fixed name keeps random temp
 *     suffixes out of the tutorial screenshots)
 *   - output dir: fresh EMPTY fs.mkdtemp (prevents the in-app
 *     overwrite-confirm dialog)
 *   - userData dir: fresh fs.mkdtemp (the app auto-reopens lastFolder from
 *     settings.json under userData, src/main/ipc/settings.ts:34)
 *   - frames dir / wrapper dir: fresh fs.mkdtemp each
 *
 * The userData redirect happens in a generated wrapper entry BEFORE the real
 * main entry is imported: window.ts creates its electron-store at module
 * load (src/main/window.ts:11), settings.ts reads userData lazily.
 *
 * Preflight:
 *   - ffmpeg: hard requirement for the GIF step. Without it the script must
 *     be run with --skip-gif (PNG-only); the full path fails loudly.
 *   - Linux: exits with a clear message when neither DISPLAY nor
 *     WAYLAND_DISPLAY is set (nothing to screenshot).
 *
 * Usage:
 *   pnpm generate:visuals [-- --skip-gif] [-- --keep]
 *   node .opencode/skills/tutorial-visuals/scripts/capture-visuals.mjs [--skip-gif] [--keep]
 */

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// URL resolution counts the script filename as a segment, so 4 ../ hops
// (scripts -> tutorial-visuals -> skills -> .opencode) reach the worktree root.
const WORKTREE_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const ASSETS_DIR = path.join(WORKTREE_ROOT, 'docs/tutorial/assets');
const OUTPUTS_DIR = path.join(WORKTREE_ROOT, 'docs/tutorial/outputs');
const TEMPLATES_DIR = path.join(WORKTREE_ROOT, 'docs/tutorial/templates');
const DIST_DIR = path.join(WORKTREE_ROOT, 'dist');
const MAIN_ENTRY = path.join(WORKTREE_ROOT, 'dist-electron/main/index.js');
const PRELOAD_ENTRY = path.join(WORKTREE_ROOT, 'dist-electron/preload/index.mjs');

const KEEP_TEMP = process.argv.includes('--keep');
// PNG-only mode for machines where the ffmpeg install decision is still
// pending. NEVER the default: the full path hard-requires ffmpeg.
const SKIP_GIF = process.argv.includes('--skip-gif');

// Single source of truth for the tutorial demo values. Later todos reuse
// these exact strings in tests and docs - keep them in sync verbatim.
const VALUES = {
  RECIPIENT_NAME: 'Jane Smith',
  COMPANY_NAME: 'Acme Corp',
  DATE: 'September 1, 2026',
  ADDRESS: '42 Example Street, 12345 Springfield',
  INVOICE_NUMBER: 'INV-2026-042',
  AMOUNT: '$1,250.00',
  DUE_DATE: '2026-09-30',
  COURSE_NAME: 'Advanced Document Automation',
};

const MARKER_PREFIX = 'REPLACEME-';

// Fixed input working-copy path (see header): recreated fresh at each run.
const STABLE_INPUT_DIR = path.join(os.tmpdir(), 'document-prefiller-examples');

// Tutorial capture framing. The height must fit the POST-scan layout (8
// marker rows + Documents card + Replace button ~1116px tall - measured),
// which is substantially taller than the pre-scan empty state. Must stay
// below the display work area or the WM silently refuses the resize.
// assertFramingHolds() fails loudly if the layout ever outgrows this, so
// silent clipping is impossible.
const CAPTURE_WIDTH = 1280;
const CAPTURE_HEIGHT = 1200;

// dist/assets ships @mdi/font woff2/woff/ttf/eot next to the hashed js/css.
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.map': 'application/json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function preflight(skipGif) {
  if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    throw new Error(
      'No graphical session: neither DISPLAY nor WAYLAND_DISPLAY is set - there is no window to screenshot.'
    );
  }

  const ffmpeg = spawnSync('ffmpeg', ['-version'], { encoding: 'utf-8' });
  const hasFfmpeg = !ffmpeg.error && ffmpeg.status === 0;
  if (hasFfmpeg) {
    console.log(`[preflight] ffmpeg ok: ${ffmpeg.stdout.split('\n')[0]}`);
    return;
  }
  if (skipGif) {
    console.warn('[preflight] WARNING: ffmpeg not found on PATH - proceeding PNG-only (--skip-gif)');
  } else {
    throw new Error(
      'ffmpeg is required for GIF assembly but was not found on PATH (run with --skip-gif for a PNG-only capture)'
    );
  }
}

function run(command, args) {
  console.log(`[build] ${command} ${args.join(' ')}`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: WORKTREE_ROOT, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
      }
    });
  });
}

async function buildApp() {
  // vite ONLY - `pnpm build` would also run electron-builder.
  await run('pnpm', ['--config.verify-deps-before-run=false', 'exec', 'vite', 'build']);

  const required = [path.join(DIST_DIR, 'index.html'), MAIN_ENTRY, PRELOAD_ENTRY];
  const missing = [];
  for (const file of required) {
    await fs.access(file).catch(() => missing.push(file));
  }
  if (missing.length > 0) {
    throw new Error(`vite build output incomplete - missing: ${missing.join(', ')}`);
  }
}

async function makeTempDirs() {
  const mkdtemp = (prefix) => fs.mkdtemp(path.join(os.tmpdir(), prefix));
  await fs.rm(STABLE_INPUT_DIR, { recursive: true, force: true });
  await fs.mkdir(STABLE_INPUT_DIR, { recursive: true });
  const dirs = {
    inputDir: STABLE_INPUT_DIR,
    outputDir: await mkdtemp('tutorial-visuals-output-'),
    userDataDir: await mkdtemp('tutorial-visuals-userdata-'),
    framesDir: await mkdtemp('tutorial-visuals-frames-'),
    wrapperDir: await mkdtemp('tutorial-visuals-wrapper-'),
  };
  for (const [name, dir] of Object.entries(dirs)) {
    console.log(`[temp] ${name}=${dir}`);
  }
  return dirs;
}

async function seedInputFolder(inputDir) {
  const entries = await fs.readdir(TEMPLATES_DIR);
  const templates = entries.filter((name) => name.endsWith('.docx'));
  if (templates.length === 0) {
    throw new Error(`no .docx templates found in ${TEMPLATES_DIR}`);
  }
  for (const name of templates) {
    await fs.copyFile(path.join(TEMPLATES_DIR, name), path.join(inputDir, name));
  }
  console.log(`[temp] input working copy: ${templates.join(', ')}`);
  return templates;
}

async function writeWrapperEntry(wrapperDir) {
  const wrapperPath = path.join(wrapperDir, 'capture-entry.mjs');
  // userData MUST be redirected before the main entry import: window.ts
  // creates electron-store at module load, settings.ts reads userData lazily.
  const source = `import { app } from 'electron';

app.setPath('userData', process.env.CAPTURE_USER_DATA);
await import(process.env.CAPTURE_MAIN_ENTRY);
`;
  await fs.writeFile(wrapperPath, source);
  return wrapperPath;
}

function startStaticServer(rootDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const { pathname } = new URL(req.url ?? '/', 'http://127.0.0.1');
        let filePath = path.normalize(path.join(rootDir, pathname));
        if (filePath !== rootDir && !filePath.startsWith(rootDir + path.sep)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }
        let stat = await fs.stat(filePath).catch(() => null);
        if (stat?.isDirectory()) {
          filePath = path.join(filePath, 'index.html');
          stat = await fs.stat(filePath).catch(() => null);
        }
        if (!stat?.isFile()) {
          res.writeHead(404);
          res.end(`Not found: ${pathname}`);
          return;
        }
        const body = await fs.readFile(filePath);
        const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
        res.writeHead(200, { 'content-type': contentType, 'content-length': body.length });
        res.end(body);
      } catch (error) {
        res.writeHead(500);
        res.end('Internal server error');
        console.error('[server] error:', error);
      }
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      // The URL handed to Electron MUST end with '/' (main loads
      // `${VITE_DEV_SERVER_URL}` directly and vite base is './').
      resolve({ server, url: `http://127.0.0.1:${port}/` });
    });
  });
}

async function launchElectron(wrapperPath, serverUrl, dirs) {
  const require = createRequire(import.meta.url);
  // Outside Electron, require('electron') resolves to the binary path string.
  // NOTE: with pnpm 11 the electron postinstall is skipped (not in
  // allowBuilds), so this first call lazily downloads the binary via
  // electron's own install.js fallback.
  const electronPath = require('electron');
  const { _electron } = await import('playwright');
  console.log(`[launch] electron binary: ${electronPath}`);
  const electronApp = await _electron.launch({
    executablePath: electronPath,
    args: [wrapperPath],
    env: {
      ...process.env, // keep PATH/DISPLAY/... or the spawned app is blind
      VITE_DEV_SERVER_URL: serverUrl,
      CAPTURE_USER_DATA: dirs.userDataDir,
      CAPTURE_MAIN_ENTRY: MAIN_ENTRY,
      CAPTURE_INPUT_FOLDER: dirs.inputDir,
      CAPTURE_OUTPUT_FOLDER: dirs.outputDir,
    },
  });
  // Main-process output is the only signal when the app dies mid-capture.
  electronApp.process().stdout?.on('data', (chunk) => console.log(`[electron:stdout] ${String(chunk).trimEnd()}`));
  electronApp.process().stderr?.on('data', (chunk) => console.error(`[electron:stderr] ${String(chunk).trimEnd()}`));
  return electronApp;
}

async function waitForWindowVisible(electronApp) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const visible = await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().some((win) => win.isVisible())
    );
    if (visible) {
      return;
    }
    await sleep(100);
  }
  throw new Error('main window never became visible (ready-to-show)');
}

async function ensureDevToolsClosed(electronApp) {
  // main opens DevTools on EVERY non-packaged launch (src/main/index.ts:22);
  // the docked panel changes the viewport, so poll until fully closed before
  // the first screenshot.
  const deadline = Date.now() + 15000;
  for (;;) {
    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.closeDevTools();
      });
    });
    const anyOpen = await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().some((win) => win.webContents.isDevToolsOpened())
    );
    if (!anyOpen) {
      return;
    }
    if (Date.now() > deadline) {
      throw new Error('DevTools still open 15s after closeDevTools()');
    }
    await sleep(200);
  }
}

async function waitForAppPage(electronApp) {
  // firstWindow() can return the devtools:// frontend target (openDevTools
  // runs during window creation, so that target registers first) - pick the
  // app page by URL instead, AFTER DevTools is closed.
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    for (const candidate of electronApp.windows()) {
      if (!candidate.url().startsWith('devtools://')) {
        return candidate;
      }
    }
    await sleep(100);
  }
  throw new Error('app page (non-devtools target) never appeared');
}

async function installMainProcessMocks(electronApp) {
  await electronApp.evaluate(({ dialog, shell }) => {
    const queue = [process.env.CAPTURE_INPUT_FOLDER, process.env.CAPTURE_OUTPUT_FOLDER];
    const counts = { showOpenDialog: 0, openPath: 0 };
    dialog.showOpenDialog = async () => {
      counts.showOpenDialog += 1;
      return { canceled: false, filePaths: [queue.shift()] };
    };
    shell.openPath = async () => {
      counts.openPath += 1;
      return '';
    };
    globalThis.__captureMockCounts = counts;
  });
}

function readMockCounts(electronApp) {
  return electronApp.evaluate(() => globalThis.__captureMockCounts);
}

async function captureScreenshot(page, targetPath) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  // scale: 'css' on EVERY capture - Playwright defaults to device pixels, so
  // on HiDPI displays the PNG would be contentBounds x devicePixelRatio; with
  // 'css' the PNG dims equal the DIP content bounds (asserted after).
  await page.screenshot({ path: targetPath, scale: 'css' });
  console.log(`[capture] ${targetPath}`);
}

async function assertPngMatchesContentBounds(electronApp, filePath) {
  const bounds = await electronApp.evaluate(({ BrowserWindow }) => {
    const [win] = BrowserWindow.getAllWindows();
    const contentBounds = win.getContentBounds();
    return { width: contentBounds.width, height: contentBounds.height };
  });
  const png = await fs.readFile(filePath);
  const size = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
  if (size.width !== bounds.width || size.height !== bounds.height) {
    throw new Error(
      `${path.basename(filePath)} is ${size.width}x${size.height}px, but the window content ` +
        `bounds are ${bounds.width}x${bounds.height} DIPs - did the screenshot use scale:'css'?`
    );
  }
  console.log(`[capture] ${path.basename(filePath)} matches content bounds ${bounds.width}x${bounds.height}`);
}

async function assertTemplatesFolderClean() {
  const leakedSaveFile = path.join(TEMPLATES_DIR, '.replacement-values.json');
  const leaked = await fs.access(leakedSaveFile).then(
    () => true,
    () => false
  );
  if (leaked) {
    throw new Error(`the app wrote ${leakedSaveFile} into the committed templates folder`);
  }
}

async function applyCaptureFraming(electronApp) {
  // The default 1200x734 content area clips the marker list and hides the
  // Documents card. One fixed size for ALL captures (the pre-scan empty
  // state leaves breathing room in the fill-height markers card). The
  // PNG-vs-bounds assertion reads runtime bounds, so it adapts automatically.
  const initial = await electronApp.evaluate(({ BrowserWindow, screen }, size) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setContentSize(size.width, size.height);
    return {
      workArea: screen.getPrimaryDisplay().workArea,
      boundsAfterSet: win.getContentBounds(),
    };
  }, { width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT });
  console.log(`[capture] display work area: ${initial.workArea.width}x${initial.workArea.height}`);
  await sleep(300); // let the layout settle after the resize
  // Read back from a separate evaluate: the WM can refuse a resize silently
  // (e.g. request taller than the work area) - fail loudly instead of
  // capturing at the wrong size.
  const settled = await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].getContentBounds()
  );
  console.log(
    `[capture] setContentSize(${CAPTURE_WIDTH}, ${CAPTURE_HEIGHT}) -> content bounds ` +
      `${settled.width}x${settled.height} (immediately after set: ${initial.boundsAfterSet.width}x${initial.boundsAfterSet.height})`
  );
  if (settled.width !== CAPTURE_WIDTH || settled.height !== CAPTURE_HEIGHT) {
    throw new Error(
      `window resize to ${CAPTURE_WIDTH}x${CAPTURE_HEIGHT} was refused (content bounds are ` +
        `${settled.width}x${settled.height}, work area ${initial.workArea.width}x${initial.workArea.height})`
    );
  }
}

async function assertFramingHolds(page, label) {
  // Post-scan invariant: the Documents card (with the .docx files) and the
  // Replace button must be fully inside the capture. NB: plain
  // getByText('Documents', { exact: true }) never matches - the
  // v-card-title's full text also contains the '.docx files' chip, so no
  // element's text is exactly 'Documents'. Filter card titles by substring.
  const docsBox = await page.locator('.v-card-title').filter({ hasText: 'Documents' }).boundingBox();
  const buttonBox = await page.getByRole('button', { name: 'Replace...' }).boundingBox();
  console.log(
    `[capture] framing check (${label}): documents title bottom=${docsBox ? docsBox.y + docsBox.height : 'n/a'}, ` +
      `replace button bottom=${buttonBox ? buttonBox.y + buttonBox.height : 'n/a'} (window ${CAPTURE_WIDTH}x${CAPTURE_HEIGHT})`
  );
  const docsFits = docsBox !== null && docsBox.y + docsBox.height + 8 <= CAPTURE_HEIGHT;
  const buttonFits = buttonBox !== null && buttonBox.y + buttonBox.height <= CAPTURE_HEIGHT;
  if (!docsFits || !buttonFits) {
    throw new Error(
      `framing check failed at ${label}: the layout outgrew ${CAPTURE_WIDTH}x${CAPTURE_HEIGHT} ` +
        '(re-measure CAPTURE_HEIGHT; do not weaken this assert)'
    );
  }
}

const frameFileName = (index) => `frame_${String(index).padStart(4, '0')}.png`;

async function snapFrame(page, frames) {
  frames.count += 1;
  const target = path.join(frames.dir, frameFileName(frames.count));
  await page.screenshot({ path: target, scale: 'css' });
  return target;
}

// GIF pacing: duplicate the most recent frame n times so each flow step holds
// for ~1s at the 10fps assembly framerate.
async function holdFrames(frames, count = 10) {
  if (frames.count === 0) {
    return;
  }
  const last = path.join(frames.dir, frameFileName(frames.count));
  for (let i = 0; i < count; i += 1) {
    frames.count += 1;
    await fs.copyFile(last, path.join(frames.dir, frameFileName(frames.count)));
  }
}

async function fillMarkerInputs(page, frames) {
  const rows = page.locator('.marker-item');
  const expected = Object.keys(VALUES).length;
  const rowCount = await rows.count();
  if (rowCount !== expected) {
    throw new Error(`expected ${expected} marker rows in the UI, found ${rowCount}`);
  }
  // Rendered order is scan order; "first two rows" means first two rendered,
  // whatever markers they are.
  for (let i = 0; i < rowCount; i += 1) {
    const row = rows.nth(i);
    const name = (await row.locator('.marker-name .font-weight-medium').innerText()).trim();
    if (!name.startsWith(MARKER_PREFIX)) {
      throw new Error(`unexpected marker name '${name}' - expected the default ${MARKER_PREFIX} prefix`);
    }
    const identifier = name.slice(MARKER_PREFIX.length);
    const value = VALUES[identifier];
    if (value === undefined) {
      throw new Error(`marker '${identifier}' has no demo value in VALUES`);
    }
    const input = row.locator('input');
    if (i < 2) {
      // First two rendered rows: type character-by-character, one GIF frame
      // per keystroke.
      await input.click();
      for (const ch of value) {
        await page.keyboard.type(ch);
        await snapFrame(page, frames);
      }
    } else {
      await input.fill(value);
      await snapFrame(page, frames);
    }
    console.log(`[values] ${name} = ${value}`);
  }
}

async function waitForReplaceSuccess(page) {
  // The success snackbar auto-dismisses after 4000ms - poll fast and shoot
  // immediately when it shows. The overwrite-confirm dialog is the todo-4
  // failure invariant: a fresh empty output dir means it must NEVER appear;
  // fail loudly instead of dismissing it.
  const success = page.getByText('Replacement Complete');
  const overwrite = page.getByText('Confirm Overwrite');
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    if (await overwrite.isVisible().catch(() => false)) {
      throw new Error(
        "CONFIRM OVERWRITE dialog appeared - the output folder was not fresh/empty. This is the todo-4 failure invariant; refusing to dismiss-and-continue."
      );
    }
    if (await success.isVisible().catch(() => false)) {
      // Best-effort: let the 'Replacing markers...' loading overlay finish
      // its leave animation so the capture is clean (the snackbar stays up
      // for 4000ms, so this does not lose the race).
      await page.getByText('Replacing markers...').waitFor({ state: 'hidden', timeout: 500 }).catch(() => {});
      return;
    }
    await sleep(50);
  }
  throw new Error("success snackbar 'Replacement Complete' never appeared within 4000ms");
}

async function assembleGif(frames) {
  const gifPath = path.join(ASSETS_DIR, 'demo.gif');
  await run('ffmpeg', [
    '-y',
    '-framerate', '10',
    '-i', path.join(frames.dir, 'frame_%04d.png'),
    '-vf', 'scale=800:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse',
    '-loop', '0',
    gifPath,
  ]);
  const stat = await fs.stat(gifPath);
  if (stat.size === 0) {
    throw new Error(`GIF assembly produced an empty file: ${gifPath}`);
  }
  if (stat.size >= 3000000) {
    throw new Error(`demo.gif is ${stat.size} bytes (>= 3000000) - reduce frames or scale`);
  }
  console.log(`[gif] ${gifPath} (${stat.size} bytes)`);
}

async function readDocumentXml(docxPath) {
  const require = createRequire(import.meta.url);
  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(await fs.readFile(docxPath));
  const entry = zip.file('word/document.xml');
  if (!entry) {
    throw new Error(`${docxPath} has no word/document.xml`);
  }
  return entry.async('string');
}

async function collectAndVerifyOutputs(outputDir) {
  await fs.mkdir(OUTPUTS_DIR, { recursive: true });
  const templates = (await fs.readdir(TEMPLATES_DIR)).filter((name) => name.endsWith('.docx')).sort();
  const produced = (await fs.readdir(outputDir)).filter((name) => name.endsWith('.docx')).sort();
  if (produced.length !== templates.length || produced.some((name, i) => name !== templates[i])) {
    throw new Error(
      `expected the replaced documents to be exactly [${templates.join(', ')}], found [${produced.join(', ')}] in ${outputDir}`
    );
  }
  for (const name of templates) {
    // Which demo values belong in this document: read the template, not a
    // hardcoded marker-per-file map.
    const templateXml = await readDocumentXml(path.join(TEMPLATES_DIR, name));
    const identifiers = [...new Set([...templateXml.matchAll(/REPLACEME-([A-Z0-9_]+)/g)].map((m) => m[1]))];
    if (identifiers.length === 0) {
      throw new Error(`${name}: no ${MARKER_PREFIX} markers found in the template`);
    }
    const outputPath = path.join(OUTPUTS_DIR, name);
    await fs.copyFile(path.join(outputDir, name), outputPath);
    const xml = await readDocumentXml(outputPath);
    if (xml.includes(MARKER_PREFIX)) {
      throw new Error(`${name}: unreplaced ${MARKER_PREFIX} marker text remains in word/document.xml`);
    }
    for (const identifier of identifiers) {
      const value = VALUES[identifier];
      if (value === undefined) {
        throw new Error(`${name}: template marker '${identifier}' is missing from VALUES`);
      }
      if (!xml.includes(value)) {
        throw new Error(`${name}: expected value "${value}" for ${identifier} not found in word/document.xml`);
      }
    }
    console.log(`[outputs] ${name}: ${identifiers.length} values verified, no markers remain`);
  }
}

async function main() {
  preflight(SKIP_GIF);
  await buildApp();
  const dirs = await makeTempDirs();
  await seedInputFolder(dirs.inputDir);
  const wrapperPath = await writeWrapperEntry(dirs.wrapperDir);
  const { server, url: serverUrl } = await startStaticServer(DIST_DIR);
  console.log(`[server] serving ${DIST_DIR} at ${serverUrl}`);
  const frames = { dir: dirs.framesDir, count: 0 };

  let electronApp = null;
  try {
    electronApp = await launchElectron(wrapperPath, serverUrl, dirs);
    // Barrier: a registered target proves createWindow() ran (and DevTools
    // began opening). Do NOT use its return value as the app page - it can be
    // the devtools:// target.
    await electronApp.firstWindow();
    await waitForWindowVisible(electronApp);
    await ensureDevToolsClosed(electronApp);
    const page = await waitForAppPage(electronApp);
    await installMainProcessMocks(electronApp);
    await applyCaptureFraming(electronApp);

    // 01: app open, no folder selected yet.
    await page.getByText('No folder selected').waitFor({ timeout: 10000 });
    const initialShot = path.join(ASSETS_DIR, '01-initial.png');
    await captureScreenshot(page, initialShot);
    await assertPngMatchesContentBounds(electronApp, initialShot);
    await snapFrame(page, frames);
    await holdFrames(frames);

    // Select the temp input folder through the mocked dialog.
    await page.getByRole('button', { name: 'Change' }).click();
    await page.getByText('REPLACEME-RECIPIENT_NAME').first().waitFor({ timeout: 15000 });

    // The 'Scan Complete' snackbar overlays the marker list - dismiss it so
    // the capture shows the full list (best-effort: not fatal if absent).
    const toastClose = page.getByRole('button', { name: 'Close' }).first();
    if (await toastClose.isVisible().catch(() => false)) {
      await toastClose.click();
      await sleep(300); // leave animation
    }

    // The marker list caps at 500px and scrolls internally; filling the
    // lower rows scrolls it down. Prove the post-scan layout fits the
    // fixed capture size before shooting.
    await assertFramingHolds(page, 'post-scan');

    // 02: markers listed after the scan.
    const markersShot = path.join(ASSETS_DIR, '02-markers-detected.png');
    await captureScreenshot(page, markersShot);
    await assertPngMatchesContentBounds(electronApp, markersShot);
    await snapFrame(page, frames);
    await holdFrames(frames);

    const scanCounts = await readMockCounts(electronApp);
    console.log(`[mock] showOpenDialog calls: ${scanCounts.showOpenDialog}, openPath calls: ${scanCounts.openPath}`);
    if (scanCounts.showOpenDialog !== 1) {
      throw new Error(`expected exactly 1 dialog.showOpenDialog call, saw ${scanCounts.showOpenDialog}`);
    }
    if (scanCounts.openPath !== 0) {
      throw new Error(`unexpected shell.openPath call(s): ${scanCounts.openPath}`);
    }

    // 03: fill all marker inputs with the demo values (first two rendered
    // rows typed keystroke-by-keystroke for the GIF, the rest at once).
    await fillMarkerInputs(page, frames);
    // fill() scrolls the internally-scrolling marker list down to the last
    // row; scroll it back to the top so the capture shows the first rows
    // (the two typed ones) like 02 does.
    await page.locator('.marker-list-content').first().evaluate((el) => {
      el.scrollTop = 0;
    });
    const valuesShot = path.join(ASSETS_DIR, '03-values-entered.png');
    await captureScreenshot(page, valuesShot);
    await assertPngMatchesContentBounds(electronApp, valuesShot);
    await snapFrame(page, frames);
    await holdFrames(frames);

    // Replace: consumes the SECOND mocked dialog (output folder). The output
    // dir is fresh/empty, so the overwrite-confirm dialog must NOT appear.
    await page.getByRole('button', { name: 'Replace...' }).click();
    await snapFrame(page, frames);
    await waitForReplaceSuccess(page);
    // 04: success snackbar - captured immediately when it becomes visible.
    const successShot = path.join(ASSETS_DIR, '04-replace-success.png');
    await captureScreenshot(page, successShot);
    await assertPngMatchesContentBounds(electronApp, successShot);
    await snapFrame(page, frames);
    await holdFrames(frames);

    const counts = await readMockCounts(electronApp);
    console.log(`[mock] showOpenDialog calls: ${counts.showOpenDialog}, openPath calls: ${counts.openPath}`);
    if (counts.showOpenDialog !== 2) {
      throw new Error(`expected exactly 2 dialog.showOpenDialog calls (input + output), saw ${counts.showOpenDialog}`);
    }
    if (counts.openPath !== 1) {
      throw new Error(`expected exactly 1 shell.openPath call (open output folder), saw ${counts.openPath}`);
    }
  } finally {
    server.close();
    if (electronApp) {
      await electronApp.close().catch((error) => console.error('[cleanup] electronApp.close failed:', error));
    }
  }

  if (SKIP_GIF) {
    console.log('[gif] skipped (--skip-gif; ffmpeg decision pending)');
  } else {
    await assembleGif(frames);
  }
  await collectAndVerifyOutputs(dirs.outputDir);

  await assertTemplatesFolderClean();

  if (KEEP_TEMP) {
    console.log('[temp] --keep set, temp dirs left in place');
  } else {
    for (const dir of Object.values(dirs)) {
      await fs.rm(dir, { recursive: true, force: true });
    }
    console.log('[temp] cleaned up');
  }
  console.log(`[done] flow captures in ${ASSETS_DIR}, filled examples in ${OUTPUTS_DIR} (${frames.count} GIF frames shot)`);
}

main().catch((error) => {
  console.error('[error]', error);
  process.exitCode = 1;
});
