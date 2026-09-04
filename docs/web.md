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

## Limitations

* In the FSS tier the folder handle is read‑only. All outputs are downloads; the app never writes to the local file system.
* Values from a `.replacement-values.json` file are imported only once. Changing the file on disk later does not update the workspace.
* Safari strips dotfiles from `webkitdirectory` uploads, so the values file may be missing on the first upload. Users can re‑enter values; they persist thereafter. The generated ZIP always contains the current values file.
* Very large batches may hit the browser’s download‑gesture window. Chromium typically allows about five seconds of transient activation before the download must be triggered.

## Cross‑References

* See the README feature matrix for a side‑by‑side comparison.
* The web variant has no auto‑update; refer to `docs/auto-update.md` for the desktop behavior.
* The step‑by‑step tutorial walks through using the web variant – see `docs/tutorial/README.md`.
