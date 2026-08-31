/**
 * Unit Tests for Run Formatting Merge Utility
 */

import { describe, it, expect } from 'vitest';
import { mergeRunFormatting } from '../../src/main/utils/run-formatting.js';

/** Count matches of a global regex (must include the g flag). */
function countMatches(haystack: string, pattern: RegExp): number {
  return (haystack.match(pattern) ?? []).length;
}

/** Matches a <w:sz> open tag but NOT <w:szCs>. */
const SZ_OPEN = /<w:sz(?=[\s/>])/g;
const SZCS_OPEN = /<w:szCs(?=[\s/>])/g;
const B_OPEN = /<w:b(?=[\s/>])/g;
const STRIKE_OPEN = /<w:strike(?=[\s/>])/g;
const U_OPEN = /<w:u(?=[\s/>])/g;

describe('mergeRunFormatting', () => {
  // ==========================================================================
  // BOLD
  // ==========================================================================

  describe('bold', () => {
    it('keeps all-unbolded fragments unbolded', () => {
      const out = mergeRunFormatting([
        '<w:rFonts w:ascii="Calibri"/><w:sz w:val="24"/>',
        '<w:rFonts w:ascii="Calibri"/><w:sz w:val="24"/>',
      ]);
      expect(out).not.toMatch(/<w:b(?=[\s/>])/);
      expect(out).toBe('<w:rFonts w:ascii="Calibri"/><w:sz w:val="24"/><w:szCs w:val="24"/>');
    });

    it.each([
      '<w:b w:val="0"/>',
      '<w:b w:val="off"/>',
      '<w:b w:val="false"/>',
      '<w:b w:val="OFF"/>',
      '<w:b w:val="False"/>',
      '<w:bCs w:val="0"/>',
    ])('ignores OFF bold element %s', (bold) => {
      const out = mergeRunFormatting([bold, '<w:i/>']);
      expect(out).not.toMatch(/<w:b(?=[\s/>])/);
      expect(out).toContain('<w:i/>');
    });

    it('returns an empty merge when the only bold is OFF', () => {
      expect(mergeRunFormatting(['<w:b w:val="0"/>'])).toBe('');
    });

    it.each([
      '<w:b/>',
      '<w:b w:val="1"/>',
      '<w:b w:val="true"/>',
      '<w:b w:val="on"/>',
      '<w:bCs/>',
      '<w:bCs w:val="1"/>',
    ])('treats bold element %s as ON', (bold) => {
      const out = mergeRunFormatting(['<w:color w:val="FF0000"/>', bold]);
      expect(out).toContain('<w:b/>');
      expect(out).toContain('<w:bCs/>');
      expect(out).toBe('<w:b/><w:bCs/><w:color w:val="FF0000"/>');
    });
  });

  // ==========================================================================
  // ITALIC
  // ==========================================================================

  describe('italic', () => {
    it.each(['<w:i/>', '<w:i w:val="1"/>', '<w:i w:val="true"/>', '<w:iCs/>'])(
      'treats italic element %s as ON',
      (italic) => {
        const out = mergeRunFormatting(['<w:color w:val="FF0000"/>', italic]);
        expect(out).toContain('<w:i/>');
        expect(out).toContain('<w:iCs/>');
      }
    );

    it('ignores OFF italic', () => {
      const out = mergeRunFormatting(['<w:i w:val="0"/>', '<w:iCs w:val="off"/>', '<w:b/>']);
      expect(out).not.toMatch(/<w:i(?=[\s/>])/);
      expect(out).toContain('<w:b/>');
    });
  });

  // ==========================================================================
  // FONT SIZE
  // ==========================================================================

  describe('font size', () => {
    it('merges mixed bold fragments and takes the max font size (24 vs 28)', () => {
      const out = mergeRunFormatting(['<w:sz w:val="24"/>', '<w:b/><w:bCs/><w:sz w:val="28"/>']);
      expect(out).toBe('<w:b/><w:bCs/><w:sz w:val="28"/><w:szCs w:val="28"/>');
    });

    it('emits EXACTLY ONE <w:sz> (28) when base has sz 20 and a fragment has sz 28', () => {
      const out = mergeRunFormatting([
        '<w:rFonts w:ascii="Arial"/><w:sz w:val="20"/>',
        '<w:sz w:val="28"/>',
      ]);
      expect(countMatches(out, SZ_OPEN)).toBe(1);
      expect(countMatches(out, SZCS_OPEN)).toBe(1);
      expect(out).toContain('<w:sz w:val="28"/>');
      expect(out).not.toContain('w:val="20"');
      expect(out).toBe('<w:rFonts w:ascii="Arial"/><w:sz w:val="28"/><w:szCs w:val="28"/>');
    });

    it('ignores w:val="0" when computing the max size', () => {
      const out = mergeRunFormatting(['<w:sz w:val="0"/>', '<w:sz w:val="24"/>']);
      expect(out).toBe('<w:sz w:val="24"/><w:szCs w:val="24"/>');
    });

    it('emits NO sz/szCs when no fragment has an explicit size', () => {
      const out = mergeRunFormatting(['<w:b/>', '<w:i/>']);
      expect(out).not.toMatch(/<w:sz(?=[\s/>])/);
      expect(out).not.toMatch(/<w:szCs(?=[\s/>])/);
      expect(out).toBe('<w:b/><w:bCs/><w:i/><w:iCs/>');
    });

    it('inserts sz before a later-ordered base element (highlight)', () => {
      const out = mergeRunFormatting([
        '<w:sz w:val="20"/><w:highlight w:val="yellow"/>',
        '<w:sz w:val="28"/>',
      ]);
      expect(out).toBe('<w:sz w:val="28"/><w:szCs w:val="28"/><w:highlight w:val="yellow"/>');
    });
  });

  // ==========================================================================
  // UNDERLINE
  // ==========================================================================

  describe('underline', () => {
    it('preserves <w:u w:val="double"/> verbatim', () => {
      expect(mergeRunFormatting(['<w:u w:val="double"/>'])).toBe('<w:u w:val="double"/>');
    });

    it('accepts <w:u> without w:val (defaults to single)', () => {
      expect(mergeRunFormatting(['<w:u/>'])).toBe('<w:u/>');
    });

    it('does NOT emit w:val="none" underline (case-insensitive)', () => {
      expect(mergeRunFormatting(['<w:u w:val="none"/>'])).toBe('');
      expect(mergeRunFormatting(['<w:u w:val="NONE"/>'])).toBe('');
    });

    it('takes the first non-none underline across fragments, verbatim', () => {
      const out = mergeRunFormatting(['<w:u w:val="none"/>', '<w:u w:val="wave"/>']);
      expect(out).toBe('<w:u w:val="wave"/>');
      expect(countMatches(out, U_OPEN)).toBe(1);
    });
  });

  // ==========================================================================
  // STRIKE / DSTRIKE
  // ==========================================================================

  describe('strike', () => {
    it('maps <w:dstrike/> to a single <w:strike/>', () => {
      expect(mergeRunFormatting(['<w:dstrike/>'])).toBe('<w:strike/>');
    });

    it('strips OFF strike from base and emits ON strike exactly once', () => {
      const out = mergeRunFormatting(['<w:strike w:val="0"/>', '<w:strike/>']);
      expect(countMatches(out, STRIKE_OPEN)).toBe(1);
      expect(out).toBe('<w:strike/>');
    });
  });

  // ==========================================================================
  // EMPTY / NULL INPUT
  // ==========================================================================

  describe('empty and null input', () => {
    it('returns an empty string for an empty rPr array', () => {
      expect(mergeRunFormatting([])).toBe('');
    });

    it('returns an empty string when all entries are null/undefined/empty', () => {
      expect(mergeRunFormatting([null, undefined, ''])).toBe('');
    });

    it('treats null/empty non-first entries as rPr-less runs', () => {
      const out = mergeRunFormatting(['<w:rFonts w:ascii="Arial"/>', null, '', '<w:b/>']);
      expect(out).toBe('<w:rFonts w:ascii="Arial"/><w:b/><w:bCs/>');
    });
  });

  // ==========================================================================
  // ELEMENT ORDER (CT_RPr) AND UNMANAGED PRESERVATION
  // ==========================================================================

  describe('element order and unmanaged elements', () => {
    it('orders managed elements per CT_RPr order (b < bCs < i < iCs < strike < sz < szCs < u)', () => {
      const out = mergeRunFormatting([
        '<w:u w:val="single"/><w:sz w:val="24"/><w:color w:val="FF0000"/>',
        '<w:b/><w:i/><w:strike/><w:sz w:val="28"/>',
      ]);
      const b = out.indexOf('<w:b/>');
      const bCs = out.indexOf('<w:bCs/>');
      const i = out.indexOf('<w:i/>');
      const iCs = out.indexOf('<w:iCs/>');
      const strike = out.indexOf('<w:strike/>');
      const color = out.indexOf('<w:color w:val="FF0000"/>');
      const sz = out.indexOf('<w:sz w:val="28"/>');
      const szCs = out.indexOf('<w:szCs w:val="28"/>');
      const u = out.indexOf('<w:u w:val="single"/>');
      // All elements present exactly once
      expect(countMatches(out, B_OPEN)).toBe(1);
      expect(countMatches(out, SZ_OPEN)).toBe(1);
      expect(countMatches(out, U_OPEN)).toBe(1);
      // Managed order
      expect(b).toBeLessThan(bCs);
      expect(bCs).toBeLessThan(i);
      expect(i).toBeLessThan(iCs);
      expect(iCs).toBeLessThan(strike);
      expect(strike).toBeLessThan(sz);
      expect(sz).toBeLessThan(szCs);
      expect(szCs).toBeLessThan(u);
      // Unmanaged color keeps its schema position: after strike, before sz
      expect(strike).toBeLessThan(color);
      expect(color).toBeLessThan(sz);
      // Exact merged string
      expect(out).toBe(
        '<w:b/><w:bCs/><w:i/><w:iCs/><w:strike/><w:color w:val="FF0000"/>' +
          '<w:sz w:val="28"/><w:szCs w:val="28"/><w:u w:val="single"/>'
      );
    });

    it('preserves unmanaged base elements and lands bold BEFORE color', () => {
      const out = mergeRunFormatting(['<w:color w:val="FF0000"/>', '<w:b/>']);
      expect(out).toContain('<w:color w:val="FF0000"/>');
      expect(out.indexOf('<w:b/>')).toBeLessThan(out.indexOf('<w:color w:val="FF0000"/>'));
      expect(out).toBe('<w:b/><w:bCs/><w:color w:val="FF0000"/>');
    });
  });

  // ==========================================================================
  // PAIRED (NON-SELF-CLOSED) FORMS
  // ==========================================================================

  describe('paired element forms', () => {
    it('strips paired managed forms and re-computes them', () => {
      const out = mergeRunFormatting([
        '<w:b></w:b><w:i w:val="0"></w:i><w:sz w:val="24"></w:sz>',
      ]);
      expect(out).toBe('<w:b/><w:bCs/><w:sz w:val="24"/><w:szCs w:val="24"/>');
    });
  });

  // ==========================================================================
  // REAL-WORLD SHAPES AND PROBES
  // ==========================================================================

  describe('real-world shapes and probes', () => {
    it('merges the real rPr sample from the bug (DIAGNOSE3 shape)', () => {
      const out = mergeRunFormatting([
        '<w:rFonts w:eastAsia="Times New Roman" w:cs="Calibri" w:cstheme="minorHAnsi"/>' +
          '<w:b/><w:bCs/><w:sz w:val="24"/>',
        '<w:sz w:val="28"/>',
      ]);
      expect(out).toBe(
        '<w:rFonts w:eastAsia="Times New Roman" w:cs="Calibri" w:cstheme="minorHAnsi"/>' +
          '<w:b/><w:bCs/><w:sz w:val="28"/><w:szCs w:val="28"/>'
      );
    });

    it('failure probe: [sz 24, strike] keeps strike present AND sz preserved', () => {
      const out = mergeRunFormatting(['<w:sz w:val="24"/>', '<w:strike/>']);
      expect(out).toContain('<w:strike/>');
      expect(out).toContain('<w:sz w:val="24"/>');
      expect(out).toBe('<w:strike/><w:sz w:val="24"/><w:szCs w:val="24"/>');
    });

    it('is pure: identical input yields identical output and input is not mutated', () => {
      const input: Array<string | null> = ['<w:b/><w:sz w:val="24"/>', '<w:u w:val="double"/>'];
      const first = mergeRunFormatting(input);
      const second = mergeRunFormatting(input);
      expect(first).toBe(second);
      expect(input).toEqual(['<w:b/><w:sz w:val="24"/>', '<w:u w:val="double"/>']);
    });
  });
});
