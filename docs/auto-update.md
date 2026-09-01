# Auto-Update

The app checks for updates automatically when it starts (no button, no periodic re‑checks).

- **Windows (NSIS installer) & Linux (AppImage)**: the update downloads in the background and the app offers a “restart to update” prompt. Installation proceeds only after the user confirms.
- **macOS**: the app is not code‑signed, so it cannot install updates itself; it instead offers to open the GitHub releases page for a manual download.
- **Windows portable build**: the app detects the portable environment and skips update checks. Portable users must download new versions manually.
- **Development builds**: never check for updates.

Releases must be tagged `vX.Y.Z` and published (not draft) for the updater to detect them.

See [development guide](development.md) for building release binaries.
