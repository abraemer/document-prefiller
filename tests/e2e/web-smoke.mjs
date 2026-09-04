/**
 * Playwright end-to-end smoke of the BUILT web bundle (dist-web).
 *
 * Exercises the real user flow against `pnpm preview:web` in headless
 * Chromium, upload tier only (the FSS native picker cannot be driven
 * over CDP — covered by the mocked-handle unit tests, see docs/web.md):
 *
 *   happy   : upload fixture folder -> markers render -> fill value ->
 *             Replace -> ZIP download -> node-side unzip asserts the
 *             marker was replaced and `.replacement-values.json` rode along.
 *   negative: upload fixture folder containing a corrupt .docx -> Replace
 *             fails closed (error snackbar naming the file, ZERO downloads).
 *
 * Design notes (quirks are load-bearing):
 *   - The script runs `pnpm build:web` itself (step 0) so the smoke always
 *     targets a fresh bundle; it then fails loudly if dist-web/index.html
 *     is missing.
 *   - The UPLOAD tier is forced with `window.showDirectoryPicker = undefined`
 *     via addInitScript. NEVER `delete window.showDirectoryPicker`: the API
 *     is a WebIDL operation on Window.prototype, `delete` only removes own
 *     properties (silent no-op on inherited members), and the adapter's
 *     typeof-based detect would keep the FSS tier. No product-code hooks.
 *   - The filechooser listener is registered BEFORE the button click —
 *     Playwright auto-dismisses choosers that open with no listener, and a
 *     post-click waitForEvent races that dismissal.
 *   - setFiles receives a TEMP FIXTURE DIRECTORY, never files: Playwright
 *     1.62.1 hard-rejects file payloads on webkitdirectory inputs.
 *   - All waits are bounded; there are no blind sleeps.
 *   - Teardown is guaranteed: every temp dir (fixtures + the downloaded-zip
 *     artifact dir) is removed in a finally sweep on BOTH success and
 *     failure. If WEB_SMOKE_EVIDENCE_ZIP points at a destination file, the
 *     downloaded zip is copied there BEFORE the sweep, so the evidence
 *     artifact survives the cleanup.
 *
 * Usage: `pnpm test:web-smoke` (optionally with WEB_SMOKE_EVIDENCE_ZIP set
 * to persist the downloaded zip, and/or WEB_SMOKE_ARTIFACT_DIR to relocate
 * it). Exit code 0 = every step passed.
 */

import { spawn, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import JSZip from 'jszip';

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..', '..');
const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}/`;
const TEMPLATE_DOCX = path.join(REPO_ROOT, 'docs/tutorial/templates/letter.docx');
const DIST_INDEX = path.join(REPO_ROOT, 'dist-web/index.html');

// letter.docx contains exactly these markers (tests/unit/tutorial-templates.test.ts).
const EXPECTED_MARKERS = ['ADDRESS', 'COMPANY_NAME', 'DATE', 'RECIPIENT_NAME'];
const FILLED_MARKER = 'RECIPIENT_NAME';
const FILLED_VALUE = 'Smoke Test User';
const SAVE_FILE_NAME = '.replacement-values.json';
const CORRUPT_DOCX_NAME = 'corrupt.docx';
const CORRUPT_DOCX_BYTES = Buffer.from(
  'This file is not a real docx or zip archive. '.repeat(8)
);

const STEP_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 20_000;
const NO_DOWNLOAD_WINDOW_MS = 5_000;
const SERVER_START_TIMEOUT_MS = 30_000;
const KILL_RECEIPT_TIMEOUT_MS = 5_000;

const artifactDir =
  process.env.WEB_SMOKE_ARTIFACT_DIR ??
  mkdtempSync(path.join(tmpdir(), 'web-smoke-artifact-'));

// When set, the downloaded zip is copied here before the teardown sweep.
const evidenceZipPath = process.env.WEB_SMOKE_EVIDENCE_ZIP;

let failures = 0;
const savedZips = [];

// Every fixture dir created by makeFixtureDir; swept in main()'s finally
// so a failure between mkdtemp and the per-path cleanup cannot leak one.
const createdFixtureDirs = [];

function pass(step, observable) {
  console.log(`PASS ${step} — ${observable}`);
}

function fail(step, detail) {
  failures += 1;
  console.log(`FAIL ${step} — ${detail}`);
}

async function step(name, run) {
  try {
    const observable = await run();
    pass(name, observable);
  } catch (error) {
    fail(name, error instanceof Error ? error.message : String(error));
    throw error; // the smoke is sequential; later steps depend on earlier ones
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Poll the preview URL until it responds; rejects on deadline. */
async function waitForServer(deadlineMs) {
  const deadline = Date.now() + deadlineMs;
  for (;;) {
    try {
      const response = await fetch(BASE_URL);
      if (response.ok) {
        return;
      }
    } catch {
      // not up yet — keep polling
    }
    if (Date.now() > deadline) {
      throw new Error(`preview server did not respond within ${deadlineMs}ms`);
    }
    await sleep(250);
  }
}

/** Kill the preview process group: SIGTERM, escalate to SIGKILL on grace expiry. */
function killPreviewGroup(pid) {
  try {
    process.kill(-pid, 'SIGTERM');
  } catch (error) {
    console.log(`note: preview process group SIGTERM: ${error.message}`);
    return;
  }
  const deadline = Date.now() + 2_000;
  const escalate = () => {
    if (Date.now() > deadline) {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        // already gone
      }
      return;
    }
    setTimeout(escalate, 250);
  };
  escalate();
}

/** Assert the port is free (kill receipt); resolves with an observable. */
async function assertPortFree(deadlineMs) {
  const deadline = Date.now() + deadlineMs;
  for (;;) {
    try {
      const response = await fetch(BASE_URL);
      await response.body?.cancel();
      if (Date.now() > deadline) {
        throw new Error(`port ${PORT} still serving after ${deadlineMs}ms`);
      }
      await sleep(250);
    } catch (error) {
      if (error instanceof Error && error.message.includes('still serving')) {
        throw error;
      }
      return `port ${PORT} free (connection refused)`;
    }
  }
}

/** Create a fixture folder: letter.docx copy, optional save file, optional corrupt docx. */
function makeFixtureDir(name, { withSaveFile, withCorruptDocx }) {
  const dir = mkdtempSync(path.join(tmpdir(), `web-smoke-${name}-`));
  createdFixtureDirs.push(dir);
  copyFileSync(TEMPLATE_DOCX, path.join(dir, 'letter.docx'));
  if (withSaveFile) {
    writeFileSync(
      path.join(dir, SAVE_FILE_NAME),
      JSON.stringify(
        {
          prefix: 'REPLACEME-',
          values: { COMPANY_NAME: 'Fixture Corp' },
          version: '1.0',
          lastModified: '2026-09-04T00:00:00.000Z',
        },
        null,
        2
      )
    );
  }
  if (withCorruptDocx) {
    writeFileSync(path.join(dir, CORRUPT_DOCX_NAME), CORRUPT_DOCX_BYTES);
  }
  return dir;
}

/**
 * Drive the folder-select -> upload flow. The filechooser listener MUST be
 * registered before the click (Playwright auto-dismisses unobserved choosers).
 */
async function uploadFolder(page, fixtureDir) {
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Change' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(fixtureDir);
}

async function runHappyPath(browser) {
  console.log('\n=== Happy path: upload -> markers -> value -> replace -> zip ===');
  const fixtureDir = makeFixtureDir('happy', { withSaveFile: true, withCorruptDocx: false });
  const context = await browser.newContext({ acceptDownloads: true });
  try {
    const page = await context.newPage();
    await page.addInitScript(() => {
      // Shadow the prototype member with an own property — `delete` would be
      // a silent no-op on WebIDL operations and the FSS tier would stay on.
      window.showDirectoryPicker = undefined;
    });
    await page.goto(BASE_URL, { waitUntil: 'load' });

    await step('cold start: app mounted', async () => {
      await page
        .getByRole('button', { name: 'Change' })
        .waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS });
      return "'Change' button visible";
    });

    await step('cold start: no update-notification UI', async () => {
      const count = await page.locator('[data-testid="update-snackbar"]').count();
      if (count !== 0) {
        throw new Error(`update snackbar present (count=${count})`);
      }
      return 'zero [data-testid="update-snackbar"] nodes';
    });

    await step('upload tier forced', async () => {
      await page
        .locator('input[webkitdirectory]')
        .waitFor({ state: 'attached', timeout: STEP_TIMEOUT_MS });
      return 'hidden input[webkitdirectory] attached by the adapter';
    });

    await step('folder upload delivered', async () => {
      await uploadFolder(page, fixtureDir);
      await page
        .locator('.marker-item')
        .filter({ hasText: `REPLACEME-${FILLED_MARKER}` })
        .first()
        .waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS });
      return `marker REPLACEME-${FILLED_MARKER} rendered`;
    });

    await step('all fixture markers rendered', async () => {
      for (const marker of EXPECTED_MARKERS) {
        const count = await page
          .locator('.marker-item')
          .filter({ hasText: `REPLACEME-${marker}` })
          .count();
        if (count !== 1) {
          throw new Error(`marker REPLACEME-${marker}: expected 1 row, found ${count}`);
        }
      }
      return `all ${EXPECTED_MARKERS.length} letter.docx markers present`;
    });

    await step('value entered', async () => {
      await page
        .locator('.marker-item')
        .filter({ hasText: `REPLACEME-${FILLED_MARKER}` })
        .locator('input')
        .fill(FILLED_VALUE);
      return `REPLACEME-${FILLED_MARKER} = "${FILLED_VALUE}"`;
    });

    let zipPath = '';
    await step('replace triggers zip download', async () => {
      const downloadPromise = page.waitForEvent('download', {
        timeout: DOWNLOAD_TIMEOUT_MS,
      });
      await page.getByRole('button', { name: 'Replace...' }).click();
      const download = await downloadPromise;
      const suggested = download.suggestedFilename();
      if (!suggested.startsWith('prefilled-documents-') || !suggested.endsWith('.zip')) {
        throw new Error(`unexpected download filename: ${suggested}`);
      }
      zipPath = path.join(artifactDir, suggested);
      await download.saveAs(zipPath);
      savedZips.push(zipPath);
      return `downloaded ${suggested}`;
    });

    await step('zip contains replaced docx', async () => {
      const zip = await JSZip.loadAsync(readFileSync(zipPath));
      const docxEntry = zip.file('letter.docx');
      if (docxEntry === null) {
        throw new Error('letter.docx missing from downloaded zip');
      }
      const docxZip = await JSZip.loadAsync(await docxEntry.async('uint8array'));
      const documentXml = docxZip.file('word/document.xml');
      if (documentXml === null) {
        throw new Error('word/document.xml missing from letter.docx inside the zip');
      }
      const xml = await documentXml.async('string');
      if (xml.includes(`REPLACEME-${FILLED_MARKER}`)) {
        throw new Error(`REPLACEME-${FILLED_MARKER} still present in the output docx`);
      }
      if (!xml.includes(FILLED_VALUE)) {
        throw new Error(`"${FILLED_VALUE}" not found in the output docx`);
      }
      return `REPLACEME-${FILLED_MARKER} replaced with "${FILLED_VALUE}"`;
    });

    await step('zip contains .replacement-values.json with the entered value', async () => {
      const zip = await JSZip.loadAsync(readFileSync(zipPath));
      const saveEntry = zip.file(SAVE_FILE_NAME);
      if (saveEntry === null) {
        throw new Error(`${SAVE_FILE_NAME} missing from downloaded zip`);
      }
      const saveData = JSON.parse(await saveEntry.async('string'));
      if (saveData.values?.[FILLED_MARKER] !== FILLED_VALUE) {
        throw new Error(
          `save file values["${FILLED_MARKER}"] = ${JSON.stringify(
            saveData.values?.[FILLED_MARKER]
          )}, expected "${FILLED_VALUE}"`
        );
      }
      return `${SAVE_FILE_NAME} present, values["${FILLED_MARKER}"] = "${FILLED_VALUE}"`;
    });
  } finally {
    await context.close();
    rmSync(fixtureDir, { recursive: true, force: true });
  }
}

async function runNegativePath(browser) {
  console.log('\n=== Negative path: corrupt docx fails closed, no download ===');
  const fixtureDir = makeFixtureDir('negative', { withSaveFile: true, withCorruptDocx: true });
  const context = await browser.newContext({ acceptDownloads: true });
  try {
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.showDirectoryPicker = undefined;
    });
    await page.goto(BASE_URL, { waitUntil: 'load' });

    await step('negative: folder upload delivered', async () => {
      await page
        .getByRole('button', { name: 'Change' })
        .waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS });
      await uploadFolder(page, fixtureDir);
      await page
        .locator('.marker-item')
        .filter({ hasText: `REPLACEME-${FILLED_MARKER}` })
        .first()
        .waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS });
      return `markers rendered (corrupt docx skipped at scan)`;
    });

    await step('negative: replace shows error naming the corrupt file', async () => {
      const downloadPromise = page
        .waitForEvent('download', { timeout: NO_DOWNLOAD_WINDOW_MS })
        .then(
          (download) => download,
          () => null // timeout = no download, which is the expected outcome
        );
      await page.getByRole('button', { name: 'Replace...' }).click();
      await page
        .getByText('Replacement Failed')
        .first()
        .waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS });
      await page
        .getByText(CORRUPT_DOCX_NAME)
        .first()
        .waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS });
      const download = await downloadPromise;
      if (download !== null) {
        throw new Error(
          `a download fired despite the corrupt docx: ${download.suggestedFilename()}`
        );
      }
      return `error snackbar names ${CORRUPT_DOCX_NAME}, zero download events in ${NO_DOWNLOAD_WINDOW_MS}ms`;
    });
  } finally {
    await context.close();
    rmSync(fixtureDir, { recursive: true, force: true });
  }
}

async function main() {
  console.log('=== Task 18 web smoke: build, serve, upload tier, happy + negative ===');

  try {
    await step('build:web (fresh bundle)', async () => {
      const result = spawnSync('pnpm', ['build:web'], {
        cwd: REPO_ROOT,
        stdio: 'inherit',
        env: process.env,
      });
      if (result.status !== 0) {
        throw new Error(`pnpm build:web exited with ${result.status}`);
      }
      if (!existsSync(DIST_INDEX)) {
        throw new Error(`built entry missing: ${DIST_INDEX}`);
      }
      return `dist-web/index.html present after fresh build`;
    });

    // Detached = own process group, so cleanup kills pnpm AND the vite child.
    const preview = spawn('pnpm', ['preview:web'], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
      env: process.env,
    });
    // Drain the preview's output so the pipe never fills and blocks the child.
    preview.stdout.on('data', () => {});

    const browser = await chromium.launch({ headless: true });
    try {
      await step(`preview server up on ${BASE_URL}`, async () => {
        await waitForServer(SERVER_START_TIMEOUT_MS);
        return `GET / responded 200 within ${SERVER_START_TIMEOUT_MS}ms`;
      });

      await runHappyPath(browser);
      await runNegativePath(browser);
    } finally {
      await browser.close();
      if (preview.pid !== undefined) {
        killPreviewGroup(preview.pid);
      }
      await step('cleanup: preview server killed', async () => {
        await assertPortFree(KILL_RECEIPT_TIMEOUT_MS);
        return `preview process group (pid ${preview.pid}) terminated, no listener left`;
      }).catch(() => {
        // step() already logged FAIL; keep going so the exit code reflects it
      });
    }

    for (const zipPath of savedZips) {
      console.log(`ARTIFACT_ZIP: ${zipPath}`);
    }
    if (failures > 0) {
      console.log(`\nSMOKE RESULT: FAIL (${failures} step failure${failures !== 1 ? 's' : ''})`);
      process.exitCode = 1;
    } else {
      // Persist the evidence zip BEFORE the teardown sweep removes its
      // temp home — never remove before copying.
      if (evidenceZipPath !== undefined && savedZips.length > 0) {
        copyFileSync(savedZips[0], evidenceZipPath);
        console.log(`EVIDENCE_ZIP: ${savedZips[0]} -> ${evidenceZipPath}`);
      }
      console.log('\nSMOKE RESULT: PASS (all steps green)');
    }
  } finally {
    // Guaranteed teardown on BOTH success and failure paths: remove every
    // fixture dir and the downloaded-zip artifact dir (idempotent force).
    for (const dir of createdFixtureDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    rmSync(artifactDir, { recursive: true, force: true });
    console.log(
      `CLEANUP: removed ${createdFixtureDirs.length} fixture dir(s) + artifact dir ` +
        `(${artifactDir}); no ${path.join(tmpdir(), 'web-smoke-*')} remains`
    );
  }
}

main().catch((error) => {
  fail('fatal', error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
