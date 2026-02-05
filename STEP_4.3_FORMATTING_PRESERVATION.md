# Step 4.3: Text Replacement While Preserving Formatting

## Overview

This document describes how the Document Prefiller preserves document formatting during text replacement operations. The implementation ensures that only text content is modified while all styling, structure, and formatting remain intact.

## Implementation Approach

### JSZip-Based XML Manipulation

The replacement engine uses JSZip to manipulate .docx files as ZIP archives containing XML files. This approach provides precise control over text replacement while preserving all formatting:

1. **Read the .docx file** as a ZIP archive
2. **Extract `word/document.xml`** which contains the main document content
3. **Replace markers** in the XML content using regex-based replacement
4. **Update the ZIP archive** with the modified XML
5. **Write the file** back to disk

### Word XML Structure

Understanding Word's XML structure is key to understanding how formatting is preserved:

```xml
<w:p>
  <w:pPr>
    <w:jc w:val="center"/>  <!-- Paragraph alignment -->
  </w:pPr>
  <w:r>
    <w:rPr>
      <w:b/>                  <!-- Bold -->
      <w:i/>                  <!-- Italic -->
      <w:u w:val="single"/>   <!-- Underline -->
      <w:sz w:val="28"/>      <!-- Font size -->
      <w:color w:val="FF0000"/> <!-- Font color -->
    </w:rPr>
    <w:t>REPLACEME-NAME</w:t>  <!-- Text content -->
  </w:r>
</w:p>
```

**Key Elements:**
- `<w:p>` - Paragraph element
- `<w:pPr>` - Paragraph properties (alignment, spacing, etc.)
- `<w:r>` - Run element (text with consistent formatting)
- `<w:rPr>` - Run properties (bold, italic, font, etc.)
- `<w:t>` - Text element (actual text content)

## How Formatting is Preserved

### 1. Targeted Text Replacement

The replacement algorithm specifically targets text within `<w:t>` tags:

```typescript
const regex = new RegExp(
  `(<w:t[^>]*>)([^<]*${escapeRegex(fullMarker)}[^<]*)(</w:t>)`,
  'g'
);
```

This regex:
- Matches only text within `<w:t>` tags
- Preserves the opening `<w:t>` tag and its attributes
- Preserves the closing `</w:t>` tag
- Only modifies the text content between the tags

### 2. Preservation of Run Properties

All `<w:rPr>` (run properties) elements remain completely untouched:

- **Bold** (`<w:b/>`)
- **Italic** (`<w:i/>`)
- **Underline** (`<w:u w:val="single"/>`)
- **Font size** (`<w:sz w:val="28"/>`)
- **Font color** (`<w:color w:val="FF0000"/>`)
- **Font family** (`<w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>`)
- And all other run-level formatting

### 3. Preservation of Paragraph Properties

All `<w:pPr>` (paragraph properties) elements remain completely untouched:

- **Alignment** (`<w:jc w:val="center"/>`)
- **Spacing** (`<w:spacing w:before="120" w:after="120"/>`)
- **Indentation** (`<w:ind w:left="720"/>`)
- And all other paragraph-level formatting

### 4. Preservation of Document Structure

The document structure is preserved:

- **Paragraphs** (`<w:p>`) remain intact
- **Tables** (`<w:tbl>`) remain intact
- **Lists** (`<w:numPr>`) remain intact
- **Headers and footers** remain intact
- **Images and other media** remain intact

### 5. Preservation of XML Attributes

All XML attributes are preserved:

- `xml:space="preserve"` attributes on `<w:t>` tags
- Namespace declarations
- All other XML attributes

## Fragmented Marker Handling

Word often splits text across multiple `<w:t>` tags within a single run, especially when formatting is applied. The implementation handles this by:

1. **Detecting fragmented markers** across multiple `<w:t>` tags within a single `<w:r>` element
2. **Concatenating the text** from all `<w:t>` tags in the run
3. **Replacing markers** in the concatenated text
4. **Rebuilding the run** with the replaced text in a single `<w:t>` tag
5. **Preserving the first `<w:t>` tag's attributes** (including `xml:space="preserve"`)

### Example

**Before:**
```xml
<w:r>
  <w:rPr>
    <w:b/>
  </w:rPr>
  <w:t>REPLACE</w:t>
  <w:t>ME-</w:t>
  <w:t>NAME</w:t>
</w:r>
```

**After replacement:**
```xml
<w:r>
  <w:rPr>
    <w:b/>
  </w:rPr>
  <w:t>John Doe</w:t>
</w:r>
```

**Note:** The bold formatting is preserved, and the text is consolidated into a single `<w:t>` tag.

## Limitations

### Cross-Run Fragmentation

The current implementation handles fragmented markers **within a single run** (multiple `<w:t>` tags within one `<w:r>` element). It does **not** handle markers fragmented across multiple runs (multiple `<w:r>` elements).

**Example of unsupported case:**
```xml
<w:r>
  <w:rPr><w:b/></w:rPr>
  <w:t>REPLACE</w:t>
</w:r>
<w:r>
  <w:rPr><w:i/></w:rPr>
  <w:t>ME-</w:t>
</w:r>
<w:r>
  <w:rPr><w:u w:val="single"/></w:rPr>
  <w:t>NAME</w:t>
</w:r>
```

In this case, each run has different formatting, so the marker cannot be replaced while preserving all formatting. This is a limitation of the current implementation.

### Future Enhancement

To support cross-run fragmentation, the implementation would need to:
1. Detect markers across multiple runs
2. Decide which formatting to preserve (first run's, last run's, or merge)
3. Potentially create multiple runs with different formatting for the replacement text

This is a complex scenario that would require significant additional logic and is not currently supported.

## Testing

Comprehensive tests verify formatting preservation:

### Test Coverage

1. **Bold formatting** - Verifies `<w:b/>` is preserved
2. **Italic formatting** - Verifies `<w:i/>` is preserved
3. **Underline formatting** - Verifies `<w:u w:val="single"/>` is preserved
4. **Font size** - Verifies `<w:sz w:val="28"/>` is preserved
5. **Font color** - Verifies `<w:color w:val="FF0000"/>` is preserved
6. **Multiple formatting properties** - Verifies all formatting is preserved together
7. **Paragraph formatting** - Verifies `<w:jc w:val="center"/>` is preserved
8. **Document structure** - Verifies paragraphs and structure are preserved
9. **Fragmented text runs** - Verifies formatting is preserved when consolidating fragmented text
10. **Mixed content** - Verifies formatting of surrounding text is preserved
11. **Font family** - Verifies `<w:rFonts>` is preserved
12. **Text spacing attributes** - Verifies `xml:space="preserve"` is preserved

### Running Tests

```bash
# Run all replacer tests
yarn test:run tests/unit/replacer.test.ts

# Run only formatting preservation tests
yarn test:run tests/unit/replacer.test.ts -t "Formatting Preservation"
```

## Validation Criteria

Step 4.3 is complete when:

- ✅ Replacement preserves bold, italic, underline styles
- ✅ Replacement preserves font styles and sizes
- ✅ Replacement preserves paragraph formatting
- ✅ Replacement preserves tables and lists
- ✅ Tests verify formatting preservation
- ✅ `yarn lint` passes with zero errors and zero warnings (excluding Yarn deprecation)
- ✅ `yarn test:run` passes with zero errors and zero warnings (excluding Yarn deprecation)
- ✅ All tests pass

## Summary

The JSZip-based replacement engine preserves document formatting by:

1. **Targeting only text content** within `<w:t>` tags
2. **Leaving all XML structure** untouched
3. **Preserving all run properties** (`<w:rPr>`)
4. **Preserving all paragraph properties** (`<w:pPr>`)
5. **Preserving document structure** (paragraphs, tables, lists)
6. **Preserving XML attributes** (namespaces, `xml:space`, etc.)

This approach ensures that documents maintain their original appearance after marker replacement, with only the marker text being replaced by the provided values.

## References

- [JSZip Documentation](https://stuk.github.io/jszip/)
- [Office Open XML Specification](https://www.ecma-international.org/publications-and-standards/standards/ecma-376/)
- [Word XML Structure](https://docs.microsoft.com/en-us/office/open-xml/word-processing)
- [STEP_4.1_RESEARCH.md](./STEP_4.1_RESEARCH.md) - Library research and selection