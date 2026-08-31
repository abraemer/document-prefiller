---
name: cut-release
description: Cut and verify a release of Document Prefiller (Electron app with electron-updater auto-update, distributed via GitHub Releases). MUST USE whenever the user wants to release, cut, publish, or ship a version — "cut a patch release", "release 1.0.2", "ship it now that the PR is merged", "bump and tag" — or asks about the release process, release assets, or update metadata. Covers the version-bump PR, the vX.Y.Z tag, GitHub release creation, and the verification checklist that catches broken update downloads.
---

# Cut a release

Releases are built by `.github/workflows/release.yml` (triggers on `release: created`): a 3-OS build matrix runs `yarn run build:<platform> --publish never` and softprops attaches the installers plus the auto-update metadata (`latest*.yml` + `*.blockmap`). electron-updater clients always fetch the NEWEST release's metadata, so each release must be complete and self-consistent before users reach it.

Every command block starts with the Node preamble (yarn is not on PATH):

```bash
source ~/.nvm/nvm.sh && nvm use 24 --silent && sleep 1
```

## 1. Preconditions

- All intended PRs are rebase-merged into main and main's CI is green. Rebase-merge is the only approved merge method (AGENTS.md) — never squash, never merge commits.
- Pick the version: it must be HIGHER than the latest published release (`gh release list`), and semver-consistent with what changed (patch = fixes, minor = new behavior, major = breaking).
- Never commit directly to main — even the version bump goes through a tiny PR.

## 2. Version-bump PR

```bash
git fetch origin
git worktree add /tmp/bump-<VER> -b chore/bump-<VER> origin/main
# edit ONLY the "version" field in /tmp/bump-<VER>/package.json -> <VER>
git -C /tmp/bump-<VER> add package.json
git -C /tmp/bump-<VER> commit -m "chore(release): bump version to <VER>"
git -C /tmp/bump-<VER> push -u origin chore/bump-<VER>
gh pr create --base main --head chore/bump-<VER> --title "chore(release): bump version to <VER>" --body "What: version bump. Why: release <VER>. Verification: CI."
# wait for the test check (~1-2 min), then:
gh pr merge --rebase --delete-branch
git worktree remove /tmp/bump-<VER> && git branch -D chore/bump-<VER>
```

Pitfalls: `gh pr create` defaults `--head` to the current branch — always pass `--head` when running from a main checkout. `gh pr merge --delete-branch` can fail to delete a local branch that another worktree has checked out; the merge itself still succeeds — delete the branch manually.

## 3. Tag + release

```bash
git fetch origin
git tag v<VER> $(git rev-parse origin/main)   # tag exactly the merged main HEAD
git push origin v<VER>
gh release create v<VER> --target main --title "v<VER>" --notes "<summary of merged PRs since last release; mention the in-app updater delivers this to users on older versions (background download + confirm-to-restart on Windows NSIS / Linux AppImage; macOS opens the releases page because the app is unsigned)>"
```

The release MUST be published, not a draft — electron-updater cannot see drafts. Creating it triggers the build workflow; wait for all 4 jobs (build win/linux/mac + attach-to-release) to go green (~5 min): `gh run list --limit 3`, then `gh run watch <id> --exit-status`.

## 4. Verify the release — do NOT skip

This checklist exists because v1.0.0 shipped with every gate green while every updater download 404'd: GitHub replaces spaces in uploaded asset names with dots, but the update metadata pointed at hyphenated names; on top of that, name collisions between the nsis/portable targets and between the two macOS arches silently dropped assets. Space-free, arch-aware artifact names (in package.json) now prevent this — the checks below confirm it held.

1. **Assets** (`gh release view v<VER> --json assets`):
   - No asset name contains a space.
   - The setup exe (`document-prefiller-setup-...-x64.exe`) AND the portable exe are BOTH present.
   - BOTH macOS arch zips and dmgs (x64 + arm64) are present.
   - All three ymls (`latest.yml`, `latest-mac.yml`, `latest-linux.yml`) and the `*.blockmap` files are attached.
2. **Metadata** (fetch with `curl -sS -L ...` — without `-L` you get empty bodies off the 302 redirect):
   - Every yml reports `version: <VER>`.
   - Every `files[].url` in every yml byte-matches an actual asset name.
   - `latest.yml`'s exe `size` equals the attached setup exe's size (a mismatch means a name collision replaced the wrong file).
3. **Download URLs** — ranged-GET each platform's primary URL exactly as a client constructs it (the yml's own url value); expect 206:
   ```bash
   curl -sS -r 0-1023 -o /dev/null -w '%{http_code}\n' -L \
     https://github.com/abraemer/document-prefiller/releases/download/v<VER>/<url-from-yml>
   ```
4. **Optional capstone** — prove a real old client updates: download the PREVIOUS release's AppImage, `chmod +x`, launch `timeout 600s ./<old>.AppImage --headless --disable-gpu --no-sandbox > run.log 2>&1 &` (note: `--ozone-platform=headless` segfaults on some machines; xvfb-run may be absent), then confirm the log shows `Found version <VER>` and a downloaded update, with NO `Update check failed` line. Cleanup: kill with a bracket pattern (`pkill -f 'name[.]AppImage'` — a plain pattern matches your own shell's command line and kills it), remove the AppImage, and delete only `~/.cache/document-prefiller-updater` — never the user's `~/.config/document-prefiller` app settings.

Beware false alarms when grepping run logs: HTTP byte-range headers contain arbitrary numbers (e.g. `bytes=111575124-111708404`) — a "404" substring there is not an error.

## 5. Guardrails

- Never tag anything but the final merged main HEAD; never smuggle a version bump into an unrelated PR.
- Never introduce spaces into the `artifactName` patterns (global `${name}-${version}-${arch}.${ext}`, nsis `-setup-`, portable `-portable-`) — space-free names are what keep yml urls, GitHub asset names, and updater download requests identical.
- Do not edit or re-cut published releases unless explicitly asked; a re-cut replaces assets users may already have.
