# AGENTS.md – Canonical PR → Rebase‑Merge Workflow

## Purpose
Provide a short, imperative guide that anyone (human contributors or AI coding agents) can follow when making changes to the **document‑prefiller** repository.

## The canonical workflow
1. **Create a branch** from `main` using a clear prefix and slug, e.g.
   - `feat/add‑auto‑save`
   - `fix/incorrect‑marker‑regex`
   - `chore/dependency‑updates`
   - `docs/update‑readme`
   - `build/electron‑upgrade`
   - `test/add‑e2e‑scenario`
2. **Commit atomically** with a conventional‑commit message:
   - Format: `type(scope?): summary`
   - Example: `feat(parser): add support for custom delimiters`
   - For breaking changes add `!` after the type and a body line that explains the user‑visible impact.
   - **Never** commit directly to `main`.
3. **Run the full gate** before opening a PR. All commands must be executed in a fresh shell that starts with:
   ```bash
   source ~/.nvm/nvm.sh && nvm use 24 --silent && sleep 1
   ```
   Then run the toolchain (Node 24 LTS, corepack‑provided Yarn):
   - `corepack yarn test:run` – 100 % test pass required.
   - `corepack yarn typecheck` – TypeScript must compile without errors.
   - `npx eslint .` – Lint must exit clean (no `--fix`).
   - `corepack yarn build` – Build must complete for all platforms.
4. **Push the branch** and **open a PR** against `main`:
   ```bash
   corepack yarn push -u origin $(git rev-parse --abbrev-ref HEAD)
   gh pr create --base main \
     --title "${COMMIT_SUBJECT}" \
     --body "$(cat <<'MSG'
   What: brief description of the change.
   Why: motivation / issue addressed.
   Breaking changes: ${BREAKING_IF_ANY}
   Verification: test:run, typecheck, lint, build all green.
   MSG
   )"
   ```
   The description should be 3‑5 lines covering *what*, *why*, *verification* and any *breaking changes*.
5. **CI runs automatically** on PRs (see `.github/workflows/build.yml`). The workflow builds on Linux, macOS and Windows. The `attach-to‑release` job is gated to `release` events only, so it is skipped for PRs – this is expected.
6. **Merge via REBASE‑MERGE** – the only approved merge method:
   - Click **Rebase and merge** in the GitHub UI.
   - This keeps the branch’s atomic commits, preserves a linear `main` history and enables reliable `git bisect`.
   - **Do not** use *Squash and merge* (loses individual commits) or *Create a merge commit* (breaks linearity).
7. **Post‑merge cleanup**:
   - Delete the remote feature branch (`git push origin --delete <branch>` or let GitHub auto‑delete).
   - Remove the local branch: `git branch -D <branch>`.
   - Sync `main` locally: `git checkout main && git pull --ff-only`.

## Gotchas
- **Local `main` divergence** – after a rebase‑merge, any local‑only commits on `main` cause a divergent history. Verify with `git diff origin/main main --stat`; if there is no unique content, reset: `git reset --hard origin/main`.
- **Guardrail‑sensitive edits** – if a PR touches only type‑check annotations or non‑functional code, note that in the description so reviewers see the intent.
- **Never force‑push a shared review branch**; rebase locally first if `main` moved.
- The `.omo/` directory is ignored; never commit plan or evidence files.
- All command blocks must start with the NVM line above; forgetting it leaves the PATH pointing at the previous Node version and causes `corepack` to fail.

---
*This workflow was validated end‑to‑end on PR #1 (12‑commit `chore/dependency‑updates` branch) – CI matrix green, rebase‑merged, branches cleaned up.*