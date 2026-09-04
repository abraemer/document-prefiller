/**
 * Shared docx segmentation module.
 *
 * Regex/string-based parse of `word/document.xml` into paragraphs -> runs ->
 * `<w:t>` elements, each with absolute string positions (start/end offsets in
 * the ORIGINAL xml string), verbatim `<w:rPr>` inner XML, and text content.
 * No XML parser library, no new dependencies.
 *
 * Regex precision rules (these fix real defects in the old inline regexes):
 * - Paragraph open tags use `/<w:p\b[^>]*>/`: the `\b` prevents matching
 *   `<w:pPr>` (a bare `<w:p` substring false-matches it).
 * - Self-closed `<w:p/>` is a ZERO-TEXT paragraph and never swallows the
 *   next paragraph.
 * - Paragraph close matching is depth-aware: the matching `</w:p>` is located
 *   by counting intervening paragraph open tags, so nested textbox paragraphs
 *   are never exposed as standalone top-level paragraphs.
 */

/** A `<w:t>` text element with absolute offsets into the original xml string. */
export interface TextSegment {
  /** The whole `<w:t>...</w:t>` element, verbatim. */
  raw: string;
  /** The captured text content (never contains `<`). */
  text: string;
  /** Absolute offset of the element start in the original xml string. */
  start: number;
  /** Absolute offset just past the element end in the original xml string. */
  end: number;
  /** Index of the owning run within the paragraph's `runs` array. */
  runIndex: number;
}

/** A `<w:r>...</w:r>` run element. */
export interface Run {
  /** The whole `<w:r>...</w:r>` element, verbatim. */
  raw: string;
  /** Absolute offset of the run start in the original xml string. */
  start: number;
  /** Absolute offset just past the run end in the original xml string. */
  end: number;
  /** Verbatim inner XML of `<w:rPr>`, or null when the run has no rPr. */
  rPrInner: string | null;
  /** `<w:t>` elements inside this run, in document order. */
  texts: TextSegment[];
  /** True when the run contains drawing/textbox/pict content. */
  containsNested: boolean;
}

/** A `<w:p>...</w:p>` paragraph, or a self-closed zero-text `<w:p/>`. */
export interface Paragraph {
  /** The whole paragraph span (open tag through close tag), verbatim. */
  raw: string;
  /** Absolute offset of the paragraph start in the original xml string. */
  start: number;
  /** Absolute offset just past the paragraph end in the original xml string. */
  end: number;
  /** Runs inside this paragraph, in document order. */
  runs: Run[];
  /** True when the paragraph span contains a nested paragraph open tag. */
  unsafe: boolean;
}

// `\b` between `w:p` and the next char fails inside `<w:pPr>` / `<w:proofErr>`
// (word char follows word char), so those tags never match. Self-closed
// `<w:p .../>` DOES match (`[^>]*` covers the `/`) and is recognized by the
// `/>` suffix in the scanner below.
const PARAGRAPH_OPEN = /<w:p\b[^>]*>/;
// Token scanner: paragraph open tags (incl. self-closed) or close tags.
const PARAGRAPH_TOKEN = /<w:p\b[^>]*>|<\/w:p>/g;
// `\b` prevents matching `<w:rPr>`; handles `w:rsidR` attributes.
const RUN_REGEX = /<w:r\b[^>]*>.*?<\/w:r>/gs;
// `<w:t ...>content</w:t>`; content never contains `<`.
const TEXT_REGEX = /<w:t[^>]*>([^<]*)<\/w:t>/g;
const RPR_REGEX = /<w:rPr[^>]*>([\s\S]*?)<\/w:rPr>/;

/**
 * Parse a `word/document.xml` string into top-level paragraphs.
 *
 * Scanning is sequential and depth-aware: after a paragraph open tag, its
 * matching `</w:p>` is located by counting intervening paragraph open tags
 * (counted ONLY via the `/<w:p\b[^>]*>/` regex, never a bare `<w:p`
 * substring). Nested textbox paragraphs therefore stay inside the outer
 * paragraph's span (which is flagged `unsafe`) and are never returned as
 * standalone top-level paragraphs.
 *
 * Malformed input (unclosed runs, stray close tags) never throws; unmatched
 * content is simply not reported.
 */
export function parseParagraphs(xml: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const scanner = new RegExp(PARAGRAPH_TOKEN.source, PARAGRAPH_TOKEN.flags);
  let depth = 0;
  let paraStart = 0;
  let openTagLength = 0;
  let match: RegExpExecArray | null;

  while ((match = scanner.exec(xml)) !== null) {
    const tag = match[0];

    if (tag.startsWith('</')) {
      // Paragraph close tag.
      if (depth === 0) {
        continue; // Stray close tag with no open tag: ignore.
      }
      depth--;
      if (depth === 0) {
        const start = paraStart;
        const end = match.index + tag.length;
        const raw = xml.slice(start, end);
        // Content between the paragraph's own open tag and its close tag;
        // any paragraph open tag in here is a nested one (e.g. txbxContent).
        const inner = xml.slice(start + openTagLength, match.index);
        paragraphs.push({
          raw,
          start,
          end,
          runs: parseRuns(raw, start),
          unsafe: PARAGRAPH_OPEN.test(inner),
        });
      }
      continue;
    }

    if (tag.endsWith('/>')) {
      // Self-closed paragraph: a zero-text paragraph that must never absorb
      // the content following it.
      if (depth === 0) {
        paragraphs.push({
          raw: tag,
          start: match.index,
          end: match.index + tag.length,
          runs: [],
          unsafe: false,
        });
      }
      // A nested self-closed paragraph changes no depth and adds no
      // top-level paragraph.
      continue;
    }

    // Paragraph open tag.
    if (depth === 0) {
      paraStart = match.index;
      openTagLength = tag.length;
    }
    depth++;
  }

  return paragraphs;
}

/**
 * Concatenation of all run texts of a paragraph in document order, matching
 * the per-paragraph concatenation semantics of text extraction
 * (`textParts.join('')`).
 */
export function paragraphText(p: Paragraph): string {
  let text = '';
  for (const run of p.runs) {
    for (const segment of run.texts) {
      text += segment.text;
    }
  }
  return text;
}

/**
 * Map a half-open `[start, end)` index range of the paragraph's concatenated
 * text to the TextSegments the range touches, in document order.
 */
export function segmentsForSpan(p: Paragraph, start: number, end: number): TextSegment[] {
  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const run of p.runs) {
    for (const segment of run.texts) {
      const segmentEnd = cursor + segment.text.length;
      if (cursor < end && segmentEnd > start) {
        segments.push(segment);
      }
      cursor = segmentEnd;
    }
  }
  return segments;
}

/**
 * Parse the runs of one paragraph. `paragraphRaw` is the verbatim paragraph
 * span, `baseOffset` its absolute start in the original xml string, so all
 * produced offsets are absolute.
 */
function parseRuns(paragraphRaw: string, baseOffset: number): Run[] {
  const runs: Run[] = [];
  for (const runMatch of paragraphRaw.matchAll(RUN_REGEX)) {
    const raw = runMatch[0];
    const start = baseOffset + runMatch.index;
    const rprMatch = RPR_REGEX.exec(raw);
    const runIndex = runs.length;

    const texts: TextSegment[] = [];
    for (const textMatch of raw.matchAll(TEXT_REGEX)) {
      texts.push({
        raw: textMatch[0],
        text: textMatch[1],
        start: start + textMatch.index,
        end: start + textMatch.index + textMatch[0].length,
        runIndex,
      });
    }

    runs.push({
      raw,
      start,
      end: start + raw.length,
      rPrInner: rprMatch === null ? null : rprMatch[1],
      texts,
      containsNested:
        raw.includes('<w:txbxContent') || raw.includes('<w:drawing') || raw.includes('<w:pict'),
    });
  }
  return runs;
}
