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
 * Temp layout (each dir its own fs.mkdtemp under os.tmpdir()):
 *   - input dir: working copy of docs/tutorial/templates/*.docx (the app
 *     writes .replacement-values.json into the folder it opens, so the
 *     committed folder must stay clean)
 *   - output dir: fresh EMPTY dir (prevents the in-app overwrite-confirm
 *     dialog)
 *   - userData dir: fresh dir (the app auto-reopens lastFolder from
 *     settings.json under userData, src/main/ipc/settings.ts:34)
 *   - frames dir: reserved for GIF assembly (todo 4)
 *
 * The userData redirect happens in a generated wrapper entry BEFORE the real
 * main entry is imported: window.ts creates its electron-store at module
 * load (src/main/window.ts:11), settings.ts reads userData lazily.
 *
 * Preflight:
 *   - ffmpeg: needed for GIF assembly (todo 4). PNG capture only warns when
 *     it is missing; the GIF step must hard-fail on it.
 *   - Linux: exits with a clear message when neither DISPLAY nor
 *     WAYLAND_DISPLAY is set (nothing to screenshot).
 *
 * Usage:
 *   pnpm generate:visuals [--keep]
 *   node .opencode/skills/tutorial-visuals/scripts/capture-visuals.mjs [--keep]
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
const TEMPLATES_DIR = path.join(WORKTREE_ROOT, 'docs/tutorial/templates');
const DIST_DIR = path.join(WORKTREE_ROOT, 'dist');
const MAIN_ENTRY = path.join(WORKTREE_ROOT, 'dist-electron/main/index.js');
const PRELOAD_ENTRY = path.join(WORKTREE_ROOT, 'dist-electron/preload/index.mjs');

const KEEP_TEMP = process.argv.includes('--keep');

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

function preflight() {
  if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    throw new Error(
      'No graphical session: neither DISPLAY nor WAYLAND_DISPLAY is set - there is no window to screenshot.'
    );
  }

  const ffmpeg = spawnSync('ffmpeg', ['-version'], { encoding: 'utf-8' });
  if (ffmpeg.error || ffmpeg.status !== 0) {
    console.warn(
      '[preflight] WARNING: ffmpeg not found on PATH - PNG capture proceeds, ' +
        'but GIF assembly (todo 4) requires it and must fail loudly.'
    );
  } else {
    console.log(`[preflight] ffmpeg ok: ${ffmpeg.stdout.split('\n')[0]}`);
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
  const dirs = {
    inputDir: await mkdtemp('tutorial-visuals-input-'),
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

async function main() {
  preflight();
  await buildApp();
  const dirs = await makeTempDirs();
  await seedInputFolder(dirs.inputDir);
  const wrapperPath = await writeWrapperEntry(dirs.wrapperDir);
  const { server, url: serverUrl } = await startStaticServer(DIST_DIR);
  console.log(`[server] serving ${DIST_DIR} at ${serverUrl}`);

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

    // 01: app open, no folder selected yet.
    await page.getByText('No folder selected').waitFor({ timeout: 10000 });
    const initialShot = path.join(ASSETS_DIR, '01-initial.png');
    await captureScreenshot(page, initialShot);
    await assertPngMatchesContentBounds(electronApp, initialShot);

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

    const markersShot = path.join(ASSETS_DIR, '02-markers-detected.png');
    await captureScreenshot(page, markersShot);
    await assertPngMatchesContentBounds(electronApp, markersShot);

    const counts = await readMockCounts(electronApp);
    console.log(`[mock] showOpenDialog calls: ${counts.showOpenDialog}, openPath calls: ${counts.openPath}`);
    if (counts.showOpenDialog !== 1) {
      throw new Error(`expected exactly 1 dialog.showOpenDialog call, saw ${counts.showOpenDialog}`);
    }
    if (counts.openPath !== 0) {
      throw new Error(`unexpected shell.openPath call(s): ${counts.openPath}`);
    }
  } finally {
    server.close();
    if (electronApp) {
      await electronApp.close().catch((error) => console.error('[cleanup] electronApp.close failed:', error));
    }
  }

  await assertTemplatesFolderClean();

  if (KEEP_TEMP) {
    console.log('[temp] --keep set, temp dirs left in place');
  } else {
    for (const dir of Object.values(dirs)) {
      await fs.rm(dir, { recursive: true, force: true });
    }
    console.log('[temp] cleaned up');
  }
  console.log('[done] smoke captures written to docs/tutorial/assets/');
}

main().catch((error) => {
  console.error('[error]', error);
  process.exitCode = 1;
});
