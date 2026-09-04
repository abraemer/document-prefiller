# Development

## Prerequisites
- Node.js (v24 LTS or higher)
- pnpm (≥ 10.26 required; the repo pins 11.24.0 via the `packageManager` field and pnpm auto-switches to it). Install: `curl -fsSL https://get.pnpm.io/install.sh | sh -` (macOS/Linux) or `npm i -g pnpm` (Windows/any)
- Requires Windows 10+, macOS 13+, or a modern 64-bit Linux

## Setup

1. Clone the repository:
```bash
git clone https://github.com/abraemer/document-prefiller.git
cd document-prefiller
```

2. Install dependencies:
```bash
pnpm install
```

3. Start the development server:
```bash
pnpm dev
```

## Building

Build the application for your current platform:

```bash
pnpm build
```

Build for specific platforms:

```bash
# Windows
pnpm build:win

# macOS
pnpm build:mac

# Linux
pnpm build:linux
```

Built artifacts will be placed in the `release/` directory.

## Project Structure

```
document-prefiller/
├── src/
│   ├── main/              # Electron main process
│   │   ├── ipc/          # IPC handlers
│   │   ├── services/     # Business logic (scanner, replacer, storage)
│   │   └── utils/        # Utility functions
│   ├── renderer/         # Vue.js renderer process
│   │   ├── components/   # Vue components
│   │   ├── composables/  # Vue composables
│   │   ├── stores/       # State management
│   │   └── types/        # TypeScript types
│   ├── shared/           # Shared code between processes
│   │   ├── types/        # Shared TypeScript types
│   │   └── constants/    # Shared constants
│   └── preload/          # Preload script
├── tests/                # Test files
│   ├── unit/            # Unit tests
│   └── e2e/             # End-to-end tests
└── public/              # Public assets (icons)
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server |
| `pnpm build` | Build for current platform |
| `pnpm build:win` | Build for Windows |
| `pnpm build:mac` | Build for macOS |
| `pnpm build:linux` | Build for Linux |
| `pnpm lint` | Run ESLint with auto-fix |
| `pnpm typecheck` | Run TypeScript type checking (vue-tsc) |
| `pnpm lint:check` | Run ESLint in check mode (no auto-fix, CI mode) |
| `pnpm test` | Run tests in watch mode |
| `pnpm test:run` | Run tests once |
| `pnpm test:ui` | Run tests with UI |
| `pnpm test:coverage` | Run tests with coverage report |
| `pnpm generate:visuals` | Regenerate tutorial screenshots, demo GIF and example outputs (requires ffmpeg) see [Regenerating everything](#regenerating-everything) |
| `pnpm build:web` | Build the web variant (outputs to dist-web/) |
| `pnpm dev:web` | Run development server for web variant |
| `pnpm preview:web` | Preview the built web variant |

## Testing

Run the test suite:

```bash
# Watch mode
pnpm test

# Single run
pnpm test:run

# With coverage
pnpm test:coverage

# With UI
pnpm test:ui
```

## Technology Stack

- **[Electron](https://www.electronjs.org/)**: Cross-platform desktop application framework
- **[Vue.js 3](https://vuejs.org/)**: Progressive JavaScript framework
- **[Vuetify 3](https://vuetifyjs.com/)**: Material Design component library
- **TypeScript**: Type-safe JavaScript
- **[Vite](https://vitejs.dev/)**: Fast build tool and dev server
- **Vitest**: Unit testing framework
- **JSZip**: .docx file manipulation

## Regenerating everything

The example templates, screenshots and the demo GIF (see the [tutorial](tutorial/README.md)) are generated programmatically. From the repository root run:

```bash
source ~/.nvm/nvm.sh && nvm use 24 --silent && sleep 1
pnpm generate:visuals
```

This script requires `ffmpeg` and a graphical session on Linux. To regenerate only the templates (no screenshots or GIF), run:

```bash
node .opencode/skills/tutorial-visuals/scripts/generate-templates.mjs
```

Full details are in the skill file `.opencode/skills/tutorial-visuals/SKILL.md`. A successful run also refreshes the `outputs/` folder and produces `docs/tutorial/assets/demo.gif` (the demo animation shown in the root README), although the GIF is not embedded in the tutorial README.
