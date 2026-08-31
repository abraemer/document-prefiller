/**
 * Unit Tests for the docx-structure segmentation module
 */

import { describe, it, expect } from 'vitest';
import {
  parseParagraphs,
  paragraphText,
  segmentsForSpan,
  type Paragraph,
} from '../../src/main/utils/docx-structure.js';

// Asserts the position round-trip contract for every node: xml.slice(start, end) === raw.
function expectPositionsRoundTrip(xml: string, paragraphs: Paragraph[]): void {
  for (const p of paragraphs) {
    expect(xml.slice(p.start, p.end)).toBe(p.raw);
    for (const run of p.runs) {
      expect(xml.slice(run.start, run.end)).toBe(run.raw);
      for (const segment of run.texts) {
        expect(xml.slice(segment.start, segment.end)).toBe(segment.raw);
      }
    }
  }
}

describe('docx-structure segmentation', () => {
  // ============================================================================
  // parseParagraphs: multi-paragraph, multi-run, multi-<w:t>, rPr variants
  // ============================================================================

  it('parses multi-paragraph documents with multiple runs and multiple <w:t> per run', () => {
    const xml =
      '<w:document><w:body>' +
      '<w:p><w:pPr><w:spacing w:after="120"/></w:pPr>' +
      '<w:r><w:rPr><w:b/></w:rPr><w:t>Hello </w:t><w:t>big </w:t></w:r>' +
      '<w:r><w:t xml:space="preserve">World</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Second</w:t></w:r></w:p>' +
      '</w:body></w:document>';

    const paragraphs = parseParagraphs(xml);
    expect(paragraphs).toHaveLength(2);

    const [first, second] = paragraphs;

    // First paragraph: run with rPr and two <w:t> elements, then run without
    // rPr using xml:space="preserve".
    expect(first.runs).toHaveLength(2);
    expect(first.runs[0].rPrInner).toBe('<w:b/>');
    expect(first.runs[0].texts.map(t => t.text)).toEqual(['Hello ', 'big ']);
    expect(first.runs[0].texts[0].runIndex).toBe(0);
    expect(first.runs[0].containsNested).toBe(false);
    expect(first.runs[1].rPrInner).toBeNull();
    expect(first.runs[1].texts).toHaveLength(1);
    expect(first.runs[1].texts[0].text).toBe('World');
    expect(first.runs[1].texts[0].raw).toBe('<w:t xml:space="preserve">World</w:t>');
    expect(first.runs[1].texts[0].runIndex).toBe(1);
    expect(first.unsafe).toBe(false);

    expect(paragraphText(first)).toBe('Hello big World');
    expect(second.runs).toHaveLength(1);
    expect(paragraphText(second)).toBe('Second');

    expectPositionsRoundTrip(xml, paragraphs);
  });

  it('paragraphText equals the hand-computed concatenation for a multi-run fixture', () => {
    const xml =
      '<w:p>' +
      '<w:r><w:t>One </w:t><w:t>two </w:t></w:r>' +
      '<w:r><w:t>three </w:t></w:r>' +
      '<w:r><w:t>four</w:t></w:r>' +
      '</w:p>';
    const paragraphs = parseParagraphs(xml);
    expect(paragraphs).toHaveLength(1);
    // Hand-computed: 'One ' + 'two ' + 'three ' + 'four'
    expect(paragraphText(paragraphs[0])).toBe('One two three four');
  });

  it('positions round-trip on a fixture with attributes, pPr, proofErr and self-closed tags', () => {
    const xml =
      '<w:body>' +
      '<w:p w:rsidR="00A1" w:rsidRDefault="00B2"><w:pPr><w:jc w:val="center"/></w:pPr>' +
      '<w:r w:rsidR="00C3"><w:t>Centered</w:t></w:r></w:p>' +
      '<w:p w:rsidR="00D4"/>' +
      '<w:p><w:proofErr w:type="spellStart"/><w:r><w:t>nevr</w:t></w:r>' +
      '<w:proofErr w:type="spellEnd"/></w:p>' +
      '</w:body>';
    const paragraphs = parseParagraphs(xml);
    expect(paragraphs).toHaveLength(3);
    expectPositionsRoundTrip(xml, paragraphs);
  });

  // ============================================================================
  // Metis blocker shapes
  // ============================================================================

  it('a <w:pPr> block does NOT open a phantom paragraph', () => {
    const xml =
      '<w:p><w:pPr><w:spacing w:after="0"/><w:jc w:val="right"/></w:pPr>' +
      '<w:r><w:t>Only paragraph</w:t></w:r></w:p>';
    const paragraphs = parseParagraphs(xml);
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0].raw.startsWith('<w:p>')).toBe(true);
    expect(paragraphText(paragraphs[0])).toBe('Only paragraph');
  });

  it('a self-closed <w:p/> zero-text paragraph does NOT absorb its successor', () => {
    const xml =
      '<w:body>' +
      '<w:p w:rsidR="00A1"/>' +
      '<w:p><w:r><w:t>After the empty one</w:t></w:r></w:p>' +
      '</w:body>';
    const paragraphs = parseParagraphs(xml);
    expect(paragraphs).toHaveLength(2);

    expect(paragraphs[0].raw).toBe('<w:p w:rsidR="00A1"/>');
    expect(paragraphs[0].runs).toEqual([]);
    expect(paragraphText(paragraphs[0])).toBe('');
    expect(paragraphs[0].unsafe).toBe(false);

    expect(paragraphs[1].runs).toHaveLength(1);
    expect(paragraphText(paragraphs[1])).toBe('After the empty one');
    expectPositionsRoundTrip(xml, paragraphs);
  });

  it('a run with a w:rsidR attribute and a <w:proofErr> sibling parses cleanly', () => {
    const xml =
      '<w:p>' +
      '<w:r w:rsidR="00A1" w:rsidRPr="00B2"><w:t>First</w:t></w:r>' +
      '<w:proofErr w:type="spellStart"/>' +
      '<w:r w:rsidR="00C3"><w:t>Second</w:t></w:r>' +
      '<w:proofErr w:type="spellEnd"/>' +
      '</w:p>';
    const paragraphs = parseParagraphs(xml);
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0].runs).toHaveLength(2);
    expect(paragraphs[0].runs[0].raw).toBe('<w:r w:rsidR="00A1" w:rsidRPr="00B2"><w:t>First</w:t></w:r>');
    expect(paragraphs[0].runs[1].raw).toBe('<w:r w:rsidR="00C3"><w:t>Second</w:t></w:r>');
    expect(paragraphText(paragraphs[0])).toBe('FirstSecond');
    expect(paragraphs[0].unsafe).toBe(false);
    expectPositionsRoundTrip(xml, paragraphs);
  });

  // ============================================================================
  // Negative safety test (guards the bare-<w:p-substring implementation trap)
  // ============================================================================

  it('a normal <w:pPr>-bearing paragraph is NOT flagged unsafe', () => {
    const xml =
      '<w:p><w:pPr><w:rPr><w:b/></w:rPr><w:spacing w:after="120"/></w:pPr>' +
      '<w:r><w:rPr><w:b/></w:rPr><w:t>Bold body text</w:t></w:r></w:p>';
    const paragraphs = parseParagraphs(xml);
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0].unsafe).toBe(false);
    expect(paragraphs[0].runs).toHaveLength(1);
    expect(paragraphText(paragraphs[0])).toBe('Bold body text');
  });

  // ============================================================================
  // Nested content: containsNested / unsafe flagging
  // ============================================================================

  it('flags containsNested/unsafe on a textbox-bearing paragraph and never exposes the inner paragraph', () => {
    const xml =
      '<w:body>' +
      '<w:p><w:r><w:t>Before box</w:t></w:r>' +
      '<w:r><w:rPr><w:noProof/></w:rPr><w:drawing><w:inline>' +
      '<w:txbxContent><w:p><w:r><w:t>Inner REPLACEME-X</w:t></w:r></w:p></w:txbxContent>' +
      '</w:inline></w:drawing></w:r></w:p>' +
      '<w:p><w:r><w:t>After textbox</w:t></w:r></w:p>' +
      '</w:body>';

    const paragraphs = parseParagraphs(xml);
    // Depth-aware scanning: the inner textbox <w:p> is inside the outer
    // paragraph's span, never a standalone top-level paragraph.
    expect(paragraphs).toHaveLength(2);

    const [outer, after] = paragraphs;
    expect(outer.unsafe).toBe(true);
    const nestedRun = outer.runs.find(r => r.containsNested);
    expect(nestedRun).toBeDefined();
    expect(nestedRun?.raw).toContain('<w:txbxContent');
    expect(nestedRun?.raw).toContain('<w:drawing');

    // The following paragraph is still scoped correctly after the nested depth.
    expect(after.unsafe).toBe(false);
    expect(paragraphText(after)).toBe('After textbox');
    expectPositionsRoundTrip(xml, paragraphs);
  });

  it('flags containsNested for <w:pict> legacy content', () => {
    const xml =
      '<w:p><w:r><w:pict><v:shape><v:textbox><w:txbxContent>' +
      '<w:p><w:r><w:t>legacy</w:t></w:r></w:p>' +
      '</w:txbxContent></v:textbox></v:shape></w:pict></w:r></w:p>';
    const paragraphs = parseParagraphs(xml);
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0].unsafe).toBe(true);
    expect(paragraphs[0].runs.some(r => r.containsNested)).toBe(true);
  });

  // ============================================================================
  // Graceful handling: runs without rPr and/or without <w:t>, malformed runs
  // ============================================================================

  it('handles a run with no rPr and no <w:t> gracefully', () => {
    const xml = '<w:p><w:r><w:br/></w:r><w:r><w:t>tail</w:t></w:r></w:p>';
    const paragraphs = parseParagraphs(xml);
    expect(paragraphs).toHaveLength(1);
    const [run0, run1] = paragraphs[0].runs;
    expect(run0.rPrInner).toBeNull();
    expect(run0.texts).toEqual([]);
    expect(run0.containsNested).toBe(false);
    expect(run1.texts.map(t => t.text)).toEqual(['tail']);
    expect(paragraphText(paragraphs[0])).toBe('tail');
    expectPositionsRoundTrip(xml, paragraphs);
  });

  it('a malformed (unclosed) run does not throw and yields no texts for it', () => {
    const xml =
      '<w:body>' +
      '<w:p><w:r><w:t>Orphan fragment</w:t></w:p>' +
      '<w:p><w:r><w:t>Next paragraph</w:t></w:r></w:p>' +
      '</w:body>';
    expect(() => parseParagraphs(xml)).not.toThrow();

    const paragraphs = parseParagraphs(xml);
    expect(paragraphs).toHaveLength(2);
    // The unclosed <w:r> produces no run (and therefore no texts); the
    // malformed paragraph itself is still reported as a paragraph.
    expect(paragraphs[0].runs).toEqual([]);
    expect(paragraphText(paragraphs[0])).toBe('');
    // The successor paragraph parses independently.
    expect(paragraphText(paragraphs[1])).toBe('Next paragraph');
    expectPositionsRoundTrip(xml, paragraphs);
  });

  // ============================================================================
  // Template bug fixture: marker split across two runs with different rPr
  // ============================================================================

  it('replicates the template bug paragraph: REPLACEM | E-DIAGNOSE3 with different rPr', () => {
    const xml =
      '<w:p>' +
      '<w:r w:rsidR="00A1"><w:rPr><w:sz w:val="24"/></w:rPr><w:t>REPLACEM</w:t></w:r>' +
      '<w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="28"/></w:rPr><w:t>E-DIAGNOSE3</w:t></w:r>' +
      '</w:p>';

    const paragraphs = parseParagraphs(xml);
    expect(paragraphs).toHaveLength(1);
    const paragraph = paragraphs[0];

    expect(paragraph.runs).toHaveLength(2);
    expect(paragraph.runs[0].rPrInner).toBe('<w:sz w:val="24"/>');
    expect(paragraph.runs[1].rPrInner).toBe('<w:b/><w:bCs/><w:sz w:val="28"/>');
    expect(paragraph.unsafe).toBe(false);

    // The fragmented runs concatenate to the full marker.
    expect(paragraphText(paragraph)).toBe('REPLACEME-DIAGNOSE3');
    expectPositionsRoundTrip(xml, paragraphs);
  });

  // ============================================================================
  // segmentsForSpan
  // ============================================================================

  describe('segmentsForSpan', () => {
    // Concatenated text: 'ABCDEFGHIJ'
    //   run 0: <w:t>ABCD</w:t>  -> concat offsets [0, 4)
    //   run 1: <w:t>EFGH</w:t>  -> concat offsets [4, 8)
    //   run 2: <w:t>IJ</w:t>    -> concat offsets [8, 10)
    const xml =
      '<w:p>' +
      '<w:r><w:t>ABCD</w:t></w:r>' +
      '<w:r><w:t>EFGH</w:t></w:r>' +
      '<w:r><w:t>IJ</w:t></w:r>' +
      '</w:p>';
    const paragraphs = parseParagraphs(xml);
    const paragraph = paragraphs[0];

    it('returns the ordered segment list for a span crossing run boundaries', () => {
      // [2, 6) covers 'CDEF' and straddles the run-0/run-1 boundary.
      const segments = segmentsForSpan(paragraph, 2, 6);
      expect(segments.map(s => s.raw)).toEqual(['<w:t>ABCD</w:t>', '<w:t>EFGH</w:t>']);
      expect(segments.map(s => s.runIndex)).toEqual([0, 1]);
      // The returned segments are the paragraph's own segment objects.
      expect(segments[0]).toBe(paragraph.runs[0].texts[0]);
      expect(segments[1]).toBe(paragraph.runs[1].texts[0]);
    });

    it('returns a single segment for a span fully inside one <w:t>', () => {
      const segments = segmentsForSpan(paragraph, 1, 3);
      expect(segments).toHaveLength(1);
      expect(segments[0].text).toBe('ABCD');
      expect(segments[0].runIndex).toBe(0);
    });

    it('handles spans that align exactly with segment boundaries', () => {
      // [4, 8) is exactly the second <w:t>; the boundary-touching neighbors
      // are not affected.
      const segments = segmentsForSpan(paragraph, 4, 8);
      expect(segments).toHaveLength(1);
      expect(segments[0].text).toBe('EFGH');
      // An empty span touches nothing.
      expect(segmentsForSpan(paragraph, 4, 4)).toEqual([]);
    });

    it('returns all segments for a full-paragraph span', () => {
      const segments = segmentsForSpan(paragraph, 0, 10);
      expect(segments.map(s => s.text)).toEqual(['ABCD', 'EFGH', 'IJ']);
    });
  });
});
