# Web Variant Documentation

## Overview

The web variant runs the same core engine in a browser. It lets users work with folders and files without installing the desktop app. The README feature matrix links to this page for a quick comparison.

## Access Tiers

Two tiers are supported. The first is the **FSS live‑folder** tier, which only works in Chromium‑based browsers (Chrome or Edge version 86 or newer). Firefox lacks the required flag and Safari never shipped it. The second is the **upload tier**, which works in all browsers. It uses a `<input type="file" webkitdirectory>` element and drag‑drop support to let users upload a folder.

## Support Matrix

| Feature | Historical BCD floor | Minimum supported version |
|---------|----------------------|---------------------------|
| `webkitdirectory` input | Chrome 7+, Firefox 50+, Safari 11.1+, iOS 18.4+ | Firefox 95+, macOS Safari 16.4+, iOS 18.4+ |
| Drag‑drop folder upload | All engines | All engines |
| `download` attribute | Safari 10.1+, iOS 13+ | All engines |
| `cancel` event on input | Firefox 91+, Safari 16.4+ | Firefox 95+, macOS Safari 16.4+, iOS 18.4+ |
| `crypto.randomUUID` | Firefox 95+, Safari 15.4+ | Same as above |

The **historical BCD floor** numbers show when browsers first implemented the feature. The **minimum supported version** column reflects the actual claim for the web variant because the variant also relies on the `cancel` event and `crypto.randomUUID`. Only the latter set is advertised as supported.

## Architecture

* Shared `src/core` engine runs unchanged.
* A browser adapter implements the desktop `window.api` bridge.
* Workspaces are stored in IndexedDB.
* When the user finishes, a ZIP file is generated.
* Capability flags tell the UI which tier is active.

## Build & Serve

* `pnpm build:web` creates a production bundle in `dist-web/`.
* Serve the files with any static webserver.
* `pnpm dev:web` runs the development server for the web entry.
* `pnpm preview:web` launches a preview of the built output.
* The web app is continuously deployed to GitHub Pages on every push to `main`; after each deploy, returning visitors may be served a cached version for up to 10 minutes.

## Limitations

* In the FSS tier the folder handle is read‑only. All outputs are downloads; the app never writes to the local file system.
* Values from a `.replacement-values.json` file are imported only once. Changing the file on disk later does not update the workspace.
* Safari strips dotfiles from `webkitdirectory` uploads, so the values file may be missing on the first upload. Users can re‑enter values; they persist thereafter. The generated ZIP always contains the current values file.
* Very large batches may hit the browser’s download‑gesture window. Chromium typically allows about five seconds of transient activation before the download must be triggered.

## Cross‑References

* See the README feature matrix for a side‑by‑side comparison.
* The web variant has no auto‑update; refer to `docs/auto-update.md` for the desktop behavior.
* The step‑by‑step tutorial walks through using the web variant – see `docs/tutorial/README.md`.

## PR previews

The preview system publishes a static snapshot of the web app for a given pull‑request.

* URL scheme: `https://abraemer.github.io/document-prefiller/pr-<n>/` where `<n>` is the PR number.
* For pull‑requests opened in the same repository the preview folder is created automatically when the workflow runs and is removed as soon as the PR is closed.
* For forked pull‑requests a preview is generated only after a maintainer with write access approves the PR. Approval is gated by the `author_association` and `reviewDecision` fields; only reviewers with write permission can trigger the publish step.
* GitHub Pages serves the preview from the `gh-pages` branch; the HTML is cached for up to ten minutes. A hard‑refresh (Shift + Reload) can be used to bypass the cache. The first publish of a PR typically takes about a minute while the workflow builds the static site.
* When a same‑repo PR is closed its folder – and any orphaned assets that were left behind – are deleted immediately. Fork‑repo folders are kept until the weekly prune job runs; they are removed only after the PR has been closed for more than 14 days (worst‑case about three weeks). The prune job deletes the whole folder, so no individual orphaned assets are kept.
* Previews expose only the static web app; no secrets or back-end code are published.

### Maintenance

* GitHub Pages is configured in the repository Settings → Pages to deploy from the `gh-pages` branch, root directory. A `.nojekyll` file is present to disable Jekyll processing.
* Rollback: flip Settings → Pages back to “GitHub Actions” source and revert the workflow merge. The existing production artifact remains live until the flip, so service continuity is maintained.
* Concurrency drop‑window: a run that is superseded while pending in the shared `gh-pages-mutate` group is cancelled rather than retried; the preview self‑heals on the next push, while production can be redeployed manually via `workflow_dispatch`.
* Accepted risks:
  1. Same‑repo PRs execute their own merge‑ref version of `preview.yml` with a write token – tolerable because only a maintainer can merge.
  2. Approval gates rely on `author_association` + `reviewDecision`; a compromised collaborator account is the residual risk.
  3. Approval reviews the PR source, not the built output – the fork’s own build produces the published bytes, so the preview URL should be treated as untrusted same‑origin content.

