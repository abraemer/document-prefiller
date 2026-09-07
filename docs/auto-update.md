# Auto-Update

The app checks for updates automatically when it starts (no button, no periodic re‑checks).
When it finds a new version, it shows a dialog instead of downloading anything on its own.

- **Install update**: starts the download and shows its progress in the dialog. Once the download finishes, the app asks before restarting. The app never restarts on its own.
- **Skip this version**: the offered version is never suggested again; a newer version still is.
- **View changelog**: opens that release's page on GitHub in your browser (the app has no built‑in changelog).
- **Close** (✕, Escape, or clicking outside the dialog): hides it until the next launch.

- **macOS**: the app is not code‑signed, so it cannot install updates itself; the dialog instead offers to open the GitHub releases page for a manual download.
- **Windows portable build**: the app detects the portable environment and skips update checks. Portable users must download new versions manually.
- **Development builds**: never check for updates.

Releases must be tagged `vX.Y.Z` and published (not draft) for the updater to detect them.

See [development guide](development.md) for building release binaries.
