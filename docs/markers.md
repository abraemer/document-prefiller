# Replacement Markers

## Marker Format

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

## Marker Status

- **Active**: Marker detected in current documents
- **New**: Marker detected but not in save file (highlighted)
- **Removed**: Marker in save file but not detected (greyed out)

## Detection rules

Markers follow the pattern {PREFIX}{IDENTIFIER} where:

- **PREFIX** – configurable string (default is `REPLACEME-`). You can change it in the *Marker Prefix* field of the UI; the documents are rescanned automatically.
- **IDENTIFIER** – a word consisting of letters, digits or underscores (`[A-Za-z0-9_]+`).
- The detection regex enforces a word boundary before the prefix and a negative look‑ahead after the identifier, so a marker glued into a larger word such as `xREPLACEME-NAME` is **not** detected. Markers also need to be inside a single paragraph of the document.

Troubleshooting: see [tutorial](tutorial/README.md#troubleshooting)