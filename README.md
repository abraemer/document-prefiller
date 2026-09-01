# Document Prefiller
> **Note:** This project was heavily built with AI assistance.

A desktop application for prefilling Microsoft Word (.docx) documents with replacement markers. Streamline your document generation workflow by defining markers in your templates and replacing them with custom values through an intuitive interface.

<p align="center"><img src="docs/tutorial/assets/demo.gif" alt="Document Prefiller workflow demo" width="480"></p>

## Features

- **Simple Document Scanning**: Automatically detects replacement markers in .docx files.
- **Configurable Markers**: Support for custom marker prefixes (default: `REPLACEME-`).
- **Batch Processing**: Process multiple documents with shared replacement values.
- **Value Persistence**: Save and load replacement values between sessions.
- **Window State Memory**: Remembers window size, position, and last used folder.
- **Cross-Platform**: Works on Windows, macOS, and Linux.
- **Clean UI**: Built with Vue.js 3 and Vuetify 3 for a modern, responsive interface.
- **Automatic Updates**: the app checks GitHub for new versions at launch.

## Installation

Download the prebuild binary from the [latest release](https://github.com/abraemer/document-prefiller/releases/latest) for your platform.

## Quick start

New to Document Prefiller? Walk through the **[step-by-step tutorial](docs/tutorial/README.md)** with ready-made example documents.

1. Launch the application.
2. Select a folder containing your .docx templates.
3. The app scans and lists detected markers.
4. Enter replacement values for each marker.
5. Click **Replace** to generate documents.
6. Values are remembered for the next session.

Example marker: `REPLACEME-NAME` – see the full marker format rules in the [markers reference](docs/markers.md).

## Documentation

- [Step-by-step tutorial](docs/tutorial/README.md)
- [Marker reference](docs/markers.md)
- [Auto‑update behavior](docs/auto-update.md)
- [Development guide](docs/development.md)
- [Contributing guide](CONTRIBUTING.md)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For issues, questions, or suggestions, open an issue on [GitHub](https://github.com/abraemer/document-prefiller/issues).