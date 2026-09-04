/**
 * Unified Marker Replacement Engine
 *
 * Paragraph-level marker replacement built on the shared segmentation module
 * (docx-structure.ts) and the shared marker regex (marker-detection.ts) — the
 * exact same logic detection uses, so detection and replacement can never
 * diverge again.
 *
 * Rebuild semantics (single-pass, per paragraph):
 * - ALL accepted match spans are computed against the paragraph's ORIGINAL
 *   concatenated text before any rewriting; the XML is then rebuilt ONCE from
 *   a sorted list of edits against the original offsets (no sequential
 *   per-match mutation, no offset re-anchoring).
 * - Every affected <w:t> is partitioned into ordered plain/covered regions;
 *   plain regions are always retained verbatim and are NEVER re-escaped.
 * - SINGLE-RUN matches (all affected <w:t> elements in one run) splice the
 *   escaped value IN PLACE into the first affected <w:t>; the original run and
 *   its rPr are untouched.
 * - CROSS-RUN matches keep plain-before in the first affected <w:t>, empty
 *   the fully-covered middle ones, keep plain-after in the last, and insert
 *   ONE new run (merged rPr via mergeRunFormatting) immediately after the
 *   first affected run's </w:r>, in ascending match order.
 * - Matches whose affected segments touch a containsNested run, or which lie
 *   in an unsafe paragraph, are skipped with a warning and left byte-untouched
 *   (the engine never splices into drawings/textboxes).
 * - Only the user-provided value is XML-escaped (exactly once); segment text
 *   is copied verbatim, so entity references like &amp; never double-escape.
 */

import { createMarkerRegex, isValidIdentifier } from './marker-detection';
import {
  parseParagraphs,
  paragraphText,
  segmentsForSpan,
  type Paragraph,
  type TextSegment,
} from './docx-structure';
import { mergeRunFormatting } from './run-formatting';

/** An accepted (in-values, non-skipped) marker match within one paragraph. */
interface AcceptedMatch {
  /** Half-open span [start, end) in the paragraph's concatenated text. */
  start: number;
  end: number;
  /** Raw (unescaped) replacement value. */
  value: string;
  /** Affected text segments, in document order. */
  segments: TextSegment[];
  /** True when the affected segments span more than one run. */
  crossRun: boolean;
}

/** A single rebuild instruction against ORIGINAL xml offsets. */
interface Edit {
  start: number;
  end: number;
  replacement: string;
}

/**
 * Replace markers in Word document XML using the shared paragraph-level
 * segmentation and marker regex (the same logic detection uses).
 *
 * @param xml - XML content from word/document.xml
 * @param values - Replacement values (key: identifier, value: replacement text)
 * @param prefix - Marker prefix
 * @returns Modified XML content
 */
export function replaceMarkersInDocumentXml(
  xml: string,
  values: Record<string, string>,
  prefix: string
): string {
  // Map lookup, never the `in` operator: identifiers like `constructor` are
  // valid marker names but would collide with Object prototype keys.
  const valuesMap = new Map<string, string>(Object.entries(values));
  if (valuesMap.size === 0) {
    return xml;
  }

  const edits: Edit[] = [];
  for (const paragraph of parseParagraphs(xml)) {
    collectParagraphEdits(paragraph, valuesMap, prefix, edits);
  }

  if (edits.length === 0) {
    return xml;
  }

  // Single-pass rebuild: all edits were computed against original offsets and
  // are applied in one ordered sweep. Array#sort is stable, so zero-length
  // insertions pushed in ascending match order keep that order at equal
  // offsets (multiple cross-run values after the same first affected run).
  edits.sort((a, b) => a.start - b.start);

  let result = '';
  let cursor = 0;
  for (const edit of edits) {
    result += xml.slice(cursor, edit.start) + edit.replacement;
    cursor = edit.end;
  }
  return result + xml.slice(cursor);
}

/**
 * Find all accepted matches in one paragraph and emit its edits.
 *
 * Matches touching a containsNested run or lying in an unsafe paragraph are
 * skipped with a warning (left byte-untouched).
 */
function collectParagraphEdits(
  p: Paragraph,
  valuesMap: Map<string, string>,
  prefix: string,
  edits: Edit[]
): void {
  const text = paragraphText(p);
  if (text.length === 0) {
    return;
  }

  // Concat-text start offset of every segment of this paragraph.
  const segmentStarts = new Map<TextSegment, number>();
  let cursor = 0;
  for (const run of p.runs) {
    for (const segment of run.texts) {
      segmentStarts.set(segment, cursor);
      cursor += segment.text.length;
    }
  }

  // FRESH regex instance per paragraph: the `g`-flagged regex is stateful, and
  // sharing one instance across paragraphs silently skips matches.
  const markerRegex = createMarkerRegex(prefix);
  const accepted: AcceptedMatch[] = [];
  let match: RegExpExecArray | null;

  while ((match = markerRegex.exec(text)) !== null) {
    const identifier = match[1];
    const value = valuesMap.get(identifier);
    // Same identifier rules as detection, so the consumed set can never be
    // wider than the detected set.
    if (value === undefined || !isValidIdentifier(identifier)) {
      continue;
    }

    const start = match.index;
    const end = start + match[0].length;
    const segments = segmentsForSpan(p, start, end);
    if (segments.length === 0) {
      continue;
    }

    if (p.unsafe || segments.some((s) => p.runs[s.runIndex].containsNested)) {
      console.warn(
        `Skipping marker "${match[0]}" inside a nested document structure ` +
          '(drawing/textbox); it is left untouched.'
      );
      continue;
    }

    accepted.push({
      start,
      end,
      value,
      segments,
      crossRun: new Set(segments.map((s) => s.runIndex)).size > 1,
    });
  }

  if (accepted.length === 0) {
    return;
  }

  emitSegmentEdits(accepted, segmentStarts, edits);
  emitNewRunEdits(p, accepted, edits);
}

/**
 * Emit one edit per affected <w:t>, partitioning its text into ordered
 * plain/covered regions: plain regions are kept verbatim (gap text between
 * two matches in one <w:t> survives), covered regions are removed, and each
 * single-run match's escaped value is spliced in at its match start position
 * (composing with plain regions by offset order).
 */
function emitSegmentEdits(
  accepted: AcceptedMatch[],
  segmentStarts: Map<TextSegment, number>,
  edits: Edit[]
): void {
  // Affected segments, deduplicated, in document order.
  const affected: TextSegment[] = [];
  const seen = new Set<TextSegment>();
  for (const m of accepted) {
    for (const segment of m.segments) {
      if (!seen.has(segment)) {
        seen.add(segment);
        affected.push(segment);
      }
    }
  }

  for (const segment of affected) {
    const segStart = segmentStarts.get(segment);
    if (segStart === undefined) {
      continue;
    }
    const segLength = segment.text.length;

    // Covered intervals of this segment in local coordinates, plus the value
    // piece of every single-run match whose first affected segment this is.
    const covered: Array<[number, number]> = [];
    const pieces: Array<{ offset: number; text: string }> = [];

    for (const m of accepted) {
      const from = Math.max(m.start, segStart) - segStart;
      const to = Math.min(m.end, segStart + segLength) - segStart;
      if (from < to) {
        covered.push([from, to]);
      }
      if (!m.crossRun && m.segments[0] === segment) {
        // In-place splice of the escaped value into the first affected <w:t>.
        pieces.push({ offset: m.start - segStart, text: escapeXml(m.value) });
      }
    }

    // Plain regions = complement of the covered intervals within [0, length).
    let pos = 0;
    for (const [from, to] of covered) {
      if (from > pos) {
        pieces.push({ offset: pos, text: segment.text.slice(pos, from) });
      }
      pos = to;
    }
    if (pos < segLength) {
      pieces.push({ offset: pos, text: segment.text.slice(pos, segLength) });
    }

    // Compose by offset order (stable: value pieces sit exactly at their
    // covered-region start, so they never tie with a plain region).
    pieces.sort((a, b) => a.offset - b.offset);
    const newContent = pieces.map((piece) => piece.text).join('');

    const openTagMatch = /^<w:t[^>]*>/.exec(segment.raw);
    if (openTagMatch === null) {
      continue;
    }
    const openTag = openTagMatch[0];
    let newOpenTag = openTag;
    // Keep original attributes; ADD xml:space="preserve" iff the new content
    // has leading/trailing whitespace; never remove an existing one.
    if (!openTag.includes('xml:space') && /^\s|\s$/.test(newContent)) {
      newOpenTag = openTag.slice(0, -1) + ' xml:space="preserve">';
    }

    edits.push({
      start: segment.start,
      end: segment.end,
      replacement: newOpenTag + newContent + '</w:t>',
    });
  }
}

/**
 * Emit the new merged-formatting runs for cross-run matches, one insertion
 * per match in ascending match order, each placed immediately after the
 * first affected run's </w:r>. An empty replacement value emits no new run.
 */
function emitNewRunEdits(p: Paragraph, accepted: AcceptedMatch[], edits: Edit[]): void {
  for (const m of accepted) {
    if (!m.crossRun || m.value === '') {
      continue;
    }

    const runIndices = Array.from(new Set(m.segments.map((s) => s.runIndex))).sort(
      (a, b) => a - b
    );
    const merged = mergeRunFormatting(runIndices.map((i) => p.runs[i].rPrInner));
    const rPr = merged === '' ? '' : `<w:rPr>${merged}</w:rPr>`;
    const firstRun = p.runs[m.segments[0].runIndex];

    edits.push({
      start: firstRun.end,
      end: firstRun.end,
      replacement: `<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(m.value)}</w:t></w:r>`,
    });
  }
}

/**
 * Escape special regex characters in a string
 *
 * @param str - String to escape
 * @returns Escaped string
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Escape special XML characters in a string
 *
 * @param str - String to escape
 * @returns XML-safe string
 */
export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
