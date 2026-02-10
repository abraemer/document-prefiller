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

## Installation

Download the prebuild binary from the [latest release](https://github.com/abraemer/document-prefiller/releases/latest) for your platform.

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
- Node.js (v18 or higher)
- Yarn (v1.22.0 or higher)

### Setup

1. Clone the repository:
```bash
git clone https://github.com/abraemer/document-prefiller.git
cd document-prefiller
```

2. Install dependencies:
```bash
yarn install
```

3. Start the development server:
```bash
yarn dev
```

### Building

Build the application for your current platform:

```bash
yarn build
```

Build for specific platforms:

```bash
# Windows
yarn build:win

# macOS
yarn build:mac

# Linux
yarn build:linux
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
| `yarn dev` | Start development server |
| `yarn build` | Build for current platform |
| `yarn build:win` | Build for Windows |
| `yarn build:mac` | Build for macOS |
| `yarn build:linux` | Build for Linux |
| `yarn preview` | Preview built application |
| `yarn lint` | Run ESLint with auto-fix |
| `yarn test` | Run tests in watch mode |
| `yarn test:run` | Run tests once |
| `yarn test:ui` | Run tests with UI |
| `yarn test:coverage` | Run tests with coverage report |

### Testing

Run the test suite:

```bash
# Watch mode
yarn test

# Single run
yarn test:run

# With coverage
yarn test:coverage

# With UI
yarn test:ui
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
4. Run tests (`yarn test:run`)
5. Run linter (`yarn lint`)
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