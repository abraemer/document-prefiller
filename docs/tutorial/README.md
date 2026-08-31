## Overview

Document Prefiller is a desktop application that lets you fill Microsoft Word (.docx) templates with custom values by using replacement markers. See the [root README](../README.md) for installation instructions; this tutorial walks you through the example templates that ship with the repository.

The guide is aimed at anyone who wants to see the marker workflow in action using the ready‑made files in `docs/tutorial/templates`.

## The example files

| File | Purpose | Markers (prefixed with `REPLACEME-`) |
|------|---------|--------------------------------------|
| `letter.docx` | Simple business letter | `RECIPIENT_NAME`, `COMPANY_NAME`, `DATE`, `ADDRESS` |
| `invoice.docx` | Invoice example | `INVOICE_NUMBER`, `COMPANY_NAME`, `AMOUNT`, `DUE_DATE` |
| `certificate.docx` | Certificate of completion | `RECIPIENT_NAME`, `COURSE_NAME`, `DATE` |

> **Note**: `RECIPIENT_NAME`, `COMPANY_NAME` and `DATE` appear in more than one template. When you enter a value for one of these shared markers, the same value is used in every document that contains it.

When you open the `templates` folder with the app it creates a hidden file `.replacement-values.json` inside that folder to remember the values you typed. This file is not committed to the repository.

## How markers work

Markers follow the pattern `{PREFIX}{IDENTIFIER}` where:

- **PREFIX** – configurable string (default is `REPLACEME-`). You can change it in the *Marker Prefix* field of the UI; the documents are rescanned automatically.
- **IDENTIFIER** – a word consisting of letters, digits or underscores (`[A-Za-z0-9_]+`).
- The detection regex enforces a word boundary before the prefix and a negative look‑ahead after the identifier, so a marker glued into a larger word such as `xREPLACEME-NAME` is **not** detected. Markers also need to be inside a single paragraph of the document.

Marker status in the UI:

- **Active** – the marker is found in the loaded documents.
- **New** – the marker is detected but not yet saved in the values file (highlighted in the list).
- **Removed** – the marker exists in the saved values file but no longer appears in any document (shown greyed out).

See the root README’s short marker summary for a quick recap.

## Step-by-step walkthrough

1. **Launch the app** – see screenshot `assets/01-initial.png`.
2. **Click *Change* and pick the folder** `docs/tutorial/templates`. The app scans the three templates and lists all eight unique markers and the three documents (see `assets/02-markers-detected.png`).
3. **Enter values** for each marker. Use the table below; the UI only shows the first five rows at a time, so scroll to see the rest (visible in `assets/03-values-entered.png`).

| Marker | Value |
|--------|-------|
| `RECIPIENT_NAME` | Jane Smith |
| `COMPANY_NAME` | Acme Corp |
| `DATE` | September 1, 2026 |
| `ADDRESS` | 42 Example Street, 12345 Springfield |
| `INVOICE_NUMBER` | INV-2026-042 |
| `AMOUNT` | $1,250.00 |
| `DUE_DATE` | 2026-09-30 |
| `COURSE_NAME` | Advanced Document Automation |

4. **Click *Replace…***, choose an output folder (e.g., `outputs/`). The app writes filled copies of each template and shows a success toast (see `assets/04-replace-success.png`).

## Inspect the outputs

| Template | Filled file (in `outputs/`) |
|----------|-----------------------------|
| `letter.docx` | `outputs/letter.docx` |
| `invoice.docx` | `outputs/invoice.docx` |
| `certificate.docx` | `outputs/certificate.docx` |

Open the generated files in Word, LibreOffice, or any compatible editor. The original formatting, tables and images are preserved; only the marker text is replaced with the values you entered.

## Troubleshooting

- **Marker not detected?**
  - Verify the prefix in the UI matches the one used in the documents (`REPLACEME-` by default).
  - Ensure the marker is not glued to surrounding characters (e.g., `xREPLACEME-NAME`).
  - Markers must be inside a single paragraph; split them if they span line breaks.
  - After editing a template click *Refresh*.
- **Empty value** – the marker is removed from the output document.
- **Values are remembered** – the hidden `.replacement-values.json` file stores them per folder. Delete this file to start with a clean slate.

## Regenerating everything

The example templates, screenshots and the demo GIF are generated programmatically. From the repository root run:

```bash
source ~/.nvm/nvm.sh && nvm use 24 --silent && sleep 1
pnpm generate:visuals
```

This script requires `ffmpeg` and a graphical session on Linux. To regenerate only the templates (no screenshots or GIF), run:

```bash
node .opencode/skills/tutorial-visuals/scripts/generate-templates.mjs
```

Full details are in the skill file `.opencode/skills/tutorial-visuals/SKILL.md`. A successful run also refreshes the `outputs/` folder and produces `docs/tutorial/assets/demo.gif` (the animation shown on the website), although the GIF is not embedded in this README.
