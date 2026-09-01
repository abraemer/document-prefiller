# AGENTS.md

- Never commit to `main`; work on `<type>/<slug>` branches.
- PRs merge with **Rebase and merge** only — never squash, never merge commits.

## Commands
- `pnpm dev` · `pnpm test:run` · `pnpm typecheck` · `pnpm lint:check` · `pnpm build`

## Gotchas
- Shell must start with `source ~/.nvm/nvm.sh && nvm use 24 --silent && sleep 1`; otherwise PATH keeps the previous Node and the toolchain breaks.
- `pnpm lint` auto-fixes and mutates files; verification is `pnpm lint:check`.
- After a rebase-merge, local `main` may diverge: if `git diff origin/main main --stat` is empty, `git reset --hard origin/main`.
- Never force-push a shared review branch; rebase locally if `main` moved.
- `.omo/` is agent scratch — never commit plan or evidence files.
