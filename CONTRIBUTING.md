# Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository and clone it.
2. Install dependencies: `pnpm install`
3. (Optional) Run the dev server: `pnpm dev`

Never commit directly to `main`. Use branches named `<type>/<slug>` such as `docs/readme-cleanup` or `feat/export-csv`.

Verify your changes with:
- `pnpm typecheck`
- `pnpm lint:check` (run `pnpm lint:check` for verification — never bare `pnpm lint`, which auto-fixes and mutates files.)
- `pnpm test:run`

Pull Requests must be merged with **Rebase and merge** only — never squash, never merge commits.

## Code Style

- Follow ESLint rules
- Use TypeScript for type safety
- Write meaningful commit messages
- Add tests for new features
- Update documentation as needed
