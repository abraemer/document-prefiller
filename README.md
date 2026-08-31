# **Warning: 100% AI generated**

# Document Prefiller

A desktop application for prefilling Microsoft Word (.docx) documents with replacement markers. Streamline your document generation workflow by defining markers in your templates and replacing them with custom values through an intuitive interface.

## Features

- **Simple Document Scanning**: Automatically detects replacement markers in .docx files
- **Configurable Markers**: Support for custom marker prefixes (default: `REPLACEME-`)
- **Batch Processing**: Process multiple documents with shared replacement values
- **Value Persistence**: Save and load replacement values between sessions
- **Window State Memory**: Remembers window size, position, and last used folder
- **Cross-Platform**: Works on Windows, macOS, and Linux
- **Clean UI**: Built with Vue.js 3 and Vuetify 3 for a modern, responsive interface
- **Automatic Updates**: the app checks GitHub for new versions at launch.

## Installation

Download the prebuild binary from the [latest release](https://github.com/abraemer/document-prefiller/releases/latest) for your platform.

## Auto-Update

The app checks for updates automatically when it starts (no button, no periodic re‑checks).

- **Windows (NSIS installer) & Linux (AppImage)**: the update downloads in the background and the app offers a “restart to update” prompt. Installation proceeds only after the user confirms.
- **macOS**: the app is not code‑signed, so it cannot install updates itself; it instead offers to open the GitHub releases page for a manual download.
- **Windows portable build**: the app detects the portable environment and skips update checks. Portable users must download new versions manually.
- **Development builds**: never check for updates.

**Release process**: the first release shipped with this feature must be versioned above 1.0.0 and tagged `vX.Y.Z`; releases must be published (not draft) for the updater to detect them.

## Usage

### Getting Started

1. **Launch the Application**
2. **Select a Folder**: Choose a folder containing your .docx template files
3. **View Detected Markers**: The app scans documents and displays all replacement markers found in all documents
4. **Enter Replacement Values**: Fill in values for each marker
5. **Replace**: Click the "Replace" button and chose a destination to generate new documents with your values
6. **Values Are Saved**: When you reopen a folder, the app remembers the previous replacement values.

### Marker Format

Markers in your documents should follow this format:

```
{PREFIX}{IDENTIFIER}
```

- **PREFIX**: Configurable string (default: `REPLACEME-`)
- **IDENTIFIER**: Alphanumeric string (e.g., `NAME`, `DATE`, `COMPANY`)

Example markers:
- `REPLACEME-NAME`
- `REPLACEME-DATE`
- `REPLACEME-COMPANY_ADDRESS`

### Marker Status

- **Active**: Marker detected in current documents
- **New**: Marker detected but not in save file (highlighted)
- **Removed**: Marker in save file but not detected (greyed out)

## Development

### Prerequisites
- Node.js (v24 LTS or higher)
- pnpm (≥ 10.26 required; the repo pins 11.24.0 via the `packageManager` field and pnpm auto-switches to it). Install: `curl -fsSL https://get.pnpm.io/install.sh | sh -` (macOS/Linux) or `npm i -g pnpm` (Windows/any)
- Requires Windows 10+, macOS 13+, or a modern 64-bit Linux

### Setup

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

### Building

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


### Project Structure

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

### Available Scripts

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

### Testing

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

### Technology Stack

- **Electron**: Cross-platform desktop application framework
- **Vue.js 3**: Progressive JavaScript framework
- **Vuetify 3**: Material Design component library
- **TypeScript**: Type-safe JavaScript
- **Vite**: Fast build tool and dev server
- **Vitest**: Unit testing framework
- **JSZip**: .docx file manipulation

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`pnpm test:run`)
5. Run linter (`pnpm lint`)
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

### Code Style

- Follow ESLint rules
- Use TypeScript for type safety
- Write meaningful commit messages
- Add tests for new features
- Update documentation as needed

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For issues, questions, or suggestions, open an issue on [GitHub](https://github.com/abraemer/document-prefiller/issues).

## Acknowledgments

Built with:
- [Electron](https://www.electronjs.org/)
- [Vue.js](https://vuejs.org/)
- [Vuetify](https://vuetifyjs.com/)
- [Vite](https://vitejs.dev/)