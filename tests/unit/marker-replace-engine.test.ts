/**
 * Edge-case test battery for the unified marker replacement engine
 * (plan todo T6). Calls replaceMarkersInDocumentXml directly with
 * hand-written XML fixtures and pins the engine's edge behavior with
 * byte-identity assertions wherever the plan demands them.
 */

import { describe, it, expect } from 'vitest';
import { replaceMarkersInDocumentXml } from '../../src/main/services/marker-replace-engine';
import { DEFAULT_PREFIX } from '../../src/shared/constants';

/** Wraps paragraph/table body XML in a minimal word/document.xml shell. */
function doc(body: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body>${body}</w:body>` +
    '</w:document>'
  );
}

/** Counts <w:r> run open tags (\b keeps <w:rPr> out of the count). */
function countRuns(xml: string): number {
  return (xml.match(/<w:r\b/g) ?? []).length;
}

describe('marker-replace-engine edge-case battery', () => {
  it('1. replaces two markers inside ONE run, spliced in place in left-to-right order', () => {
    const xml = doc('<w:p><w:r><w:t>REPLACEME-A and REPLACEME-B</w:t></w:r></w:p>');

    const out = replaceMarkersInDocumentXml(xml, { A: 'Alpha', B: 'Beta' }, DEFAULT_PREFIX);

    // In-place splice per the rebuild spec: no new runs for single-run matches,
    // the original run and <w:t> keep their exact shape, gap text preserved.
    expect(out).toBe(doc('<w:p><w:r><w:t>Alpha and Beta</w:t></w:r></w:p>'));
    // Correct left-to-right order of the two values.
    expect(out.indexOf('Alpha')).toBeLessThan(out.indexOf('Beta'));
    expect(out).toContain('Alpha and Beta');
    // No new run was inserted for the single-run matches.
    expect(countRuns(out)).toBe(1);
    expect(out).not.toContain('REPLACEM');
  });

  it('2. replaces a marker mid-run, keeping before+after text of the same run', () => {
    const xml = doc('<w:p><w:r><w:t>Hello REPLACEME-NAME, welcome!</w:t></w:r></w:p>');

    const out = replaceMarkersInDocumentXml(xml, { NAME: 'John' }, DEFAULT_PREFIX);

    expect(out).toBe(doc('<w:p><w:r><w:t>Hello John, welcome!</w:t></w:r></w:p>'));
  });

  it('3. keeps surrounding &amp; escaped exactly once (double-escape lock)', () => {
    // The value itself contains '&' so a broken escapeXml (returning its input
    // unchanged) must fail this test alongside test 4.
    const xml = doc('<w:p><w:r><w:t>R&amp;D REPLACEME-NAME end</w:t></w:r></w:p>');

    const out = replaceMarkersInDocumentXml(xml, { NAME: 'Tom & Jerry' }, DEFAULT_PREFIX);

    // Byte-identity of the untouched region: 'R&amp;D ' and ' end' survive
    // verbatim; only the value is escaped (exactly once).
    expect(out).toBe(doc('<w:p><w:r><w:t>R&amp;D Tom &amp; Jerry end</w:t></w:r></w:p>'));
    // The latent double-escape bug class (&amp; -> &amp;amp;) is forbidden.
    expect(out).not.toContain('&amp;amp;');
    expect(out).toContain('R&amp;D');
  });

  it('4. escapes a value containing <, >, &, ", \' exactly once', () => {
    const xml = doc('<w:p><w:r><w:t>Text: REPLACEME-SPECIAL</w:t></w:r></w:p>');

    const out = replaceMarkersInDocumentXml(xml, { SPECIAL: `<>&"'` }, DEFAULT_PREFIX);

    // escapeXml pins all five entities, including &quot;/&apos;
    // (complements the service-level pin in replacer.test.ts).
    expect(out).toBe(doc('<w:p><w:r><w:t>Text: &lt;&gt;&amp;&quot;&apos;</w:t></w:r></w:p>'));
    // Escaped exactly once: no double-escaped sequences anywhere.
    expect(out).not.toContain('&amp;lt;');
    expect(out).not.toContain('&amp;quot;');
    // The raw special characters must not leak into the XML either.
    expect(out).not.toContain('<>&');
  });

  it('5. honors a custom prefix through the engine directly', () => {
    const xml = doc(
      '<w:p><w:r><w:t>PREFIX_NAME here</w:t></w:r></w:p>' +
        '<w:p><w:r><w:t>REPLACEME-OTHER untouched</w:t></w:r></w:p>'
    );

    const out = replaceMarkersInDocumentXml(xml, { NAME: 'Prefixed' }, 'PREFIX_');

    // The custom prefix marker is replaced; the default-prefix marker in the
    // second paragraph is byte-identical (the engine only matches PREFIX_).
    expect(out).toBe(
      doc(
        '<w:p><w:r><w:t>Prefixed here</w:t></w:r></w:p>' +
          '<w:p><w:r><w:t>REPLACEME-OTHER untouched</w:t></w:r></w:p>'
      )
    );
  });

  it('6. replaces markers at the paragraph very start and very end (\\b boundary semantics)', () => {
    // 'REPLACEME-START' sits at index 0 of the concatenated paragraph text
    // (string start is a \b boundary) and 'REPLACEME-END' runs to the very
    // end (the negative lookahead succeeds at end-of-string).
    const xml = doc('<w:p><w:r><w:t>REPLACEME-START middle REPLACEME-END</w:t></w:r></w:p>');

    const out = replaceMarkersInDocumentXml(
      xml,
      { START: 'First', END: 'Last' },
      DEFAULT_PREFIX
    );

    expect(out).toBe(doc('<w:p><w:r><w:t>First middle Last</w:t></w:r></w:p>'));
  });

  it('7. merges bold as any-wins: a w:val="0" fragment plus a bold fragment is bold; OFF-only fragments are not', () => {
    // Cross-run marker 'REPLACEME-BOLD' split across two runs: the first is
    // explicitly non-bold (w:val="0"), the second is bold. Any-wins: the
    // merged new run must be bold.
    const xmlAnyWins = doc(
      '<w:p>' +
        '<w:r><w:rPr><w:b w:val="0"/></w:rPr><w:t>REPLACEME-B</w:t></w:r>' +
        '<w:r><w:rPr><w:b/></w:rPr><w:t>OLD</w:t></w:r>' +
        '</w:p>'
    );

    const outAnyWins = replaceMarkersInDocumentXml(xmlAnyWins, { BOLD: 'Any Wins' }, DEFAULT_PREFIX);

    // The emptied fragment runs keep their original rPr (so w:val="0"
    // survives in the first fragment run); the NEW value run carries the
    // merged any-wins bold without any OFF remnant.
    expect(outAnyWins).toBe(
      doc(
        '<w:p>' +
          '<w:r><w:rPr><w:b w:val="0"/></w:rPr><w:t></w:t></w:r>' +
          '<w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t xml:space="preserve">Any Wins</w:t></w:r>' +
          '<w:r><w:rPr><w:b/></w:rPr><w:t></w:t></w:r>' +
          '</w:p>'
      )
    );
    expect(outAnyWins).toContain('<w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t xml:space="preserve">Any Wins</w:t></w:r>');
    // The OFF attribute must survive only in the retained fragment run.
    expect(outAnyWins.match(/w:val="0"/g)).toHaveLength(1);

    // All-OFF fragments: neither run is bold, so the merged new run must not
    // be bold either (and gets no <w:rPr> at all).
    const xmlAllOff = doc(
      '<w:p>' +
        '<w:r><w:rPr><w:b w:val="0"/></w:rPr><w:t>REPLACEME-N</w:t></w:r>' +
        '<w:r><w:rPr><w:b w:val="false"/></w:rPr><w:t>OTBOLD</w:t></w:r>' +
        '</w:p>'
    );

    const outAllOff = replaceMarkersInDocumentXml(
      xmlAllOff,
      { NOTBOLD: 'Plain Text' },
      DEFAULT_PREFIX
    );

    expect(outAllOff).toBe(
      doc(
        '<w:p>' +
          '<w:r><w:rPr><w:b w:val="0"/></w:rPr><w:t></w:t></w:r>' +
          '<w:r><w:t xml:space="preserve">Plain Text</w:t></w:r>' +
          '<w:r><w:rPr><w:b w:val="false"/></w:rPr><w:t></w:t></w:r>' +
          '</w:p>'
      )
    );
    expect(outAllOff).not.toContain('<w:b/>');
  });

  it('8. removes the marker for an empty value without inserting any new run', () => {
    // Single-run marker (ONE) and a cross-run marker (REPLACEM + E-TWO):
    // both have empty values. The single-run splice leaves the gap text; the
    // cross-run match empties both fragment <w:t> elements and inserts NO
    // new run (empty value -> no inserted run).
    const xml = doc(
      '<w:p>' +
        '<w:r><w:t>REPLACEM</w:t></w:r>' +
        '<w:r><w:t>E-TWO C</w:t></w:r>' +
        '<w:r><w:t>A REPLACEME-ONE B</w:t></w:r>' +
        '</w:p>'
    );

    const out = replaceMarkersInDocumentXml(xml, { ONE: '', TWO: '' }, DEFAULT_PREFIX);

    expect(out).toBe(
      doc(
        '<w:p>' +
          '<w:r><w:t></w:t></w:r>' +
          '<w:r><w:t xml:space="preserve"> C</w:t></w:r>' +
          '<w:r><w:t>A  B</w:t></w:r>' +
          '</w:p>'
      )
    );
    // Marker gone, no value text anywhere, and no new run: the paragraph
    // keeps exactly its original three runs.
    expect(out).not.toContain('REPLACEM');
    expect(countRuns(out)).toBe(3);
  });

  it('9. keeps the leading space of a leading-space marker with xml:space="preserve"', () => {
    const xml = doc(
      '<w:p><w:r><w:t xml:space="preserve"> REPLACEME-DIAGNOSE1</w:t></w:r></w:p>'
    );

    const out = replaceMarkersInDocumentXml(xml, { DIAGNOSE1: 'Diagnosed' }, DEFAULT_PREFIX);

    // The leading space survives, the xml:space="preserve" attribute survives,
    // and only the marker itself is replaced.
    expect(out).toBe(
      doc('<w:p><w:r><w:t xml:space="preserve"> Diagnosed</w:t></w:r></w:p>')
    );
  });

  it('10. leaves a marker NOT in values byte-identical for its paragraph', () => {
    const untouched =
      '<w:p><w:r><w:t>Keep REPLACEME-UNKNOWN intact</w:t></w:r></w:p>';
    const xml = doc(
      '<w:p><w:r><w:t>Hello REPLACEME-NAME</w:t></w:r></w:p>' + untouched
    );

    const out = replaceMarkersInDocumentXml(xml, { NAME: 'Ada' }, DEFAULT_PREFIX);

    // The in-values paragraph is rewritten; the out-of-values paragraph is
    // byte-identical down to every attribute and character (the full-document
    // equality proves the untouched paragraph's exact bytes).
    expect(out).toBe(
      doc('<w:p><w:r><w:t>Hello Ada</w:t></w:r></w:p>' + untouched)
    );
    expect(out).toContain('REPLACEME-UNKNOWN');
  });

  it('11. does NOT replace a marker embedded in a larger word (deliberate \\b behavior change)', () => {
    // XREPLACEME-NAME: no \b between 'X' and 'REPLACEME' -> detection never
    // reports this marker, so the unified engine must not replace it either.
    const xml = doc('<w:p><w:r><w:t>XREPLACEME-NAME stays</w:t></w:r></w:p>');

    const out = replaceMarkersInDocumentXml(xml, { NAME: 'Nobody' }, DEFAULT_PREFIX);

    // The marker text survives byte-identical: the whole document is
    // returned unchanged.
    expect(out).toBe(xml);
    expect(out).toContain('XREPLACEME-NAME');
  });

  it('12. replaces the same marker in paragraph 2 AND paragraph 4 (fresh regex per paragraph)', () => {
    // All four paragraphs carry the marker: no paragraph scan gets to "clean"
    // state between in-values markers, so any cross-paragraph regex-state
    // leakage (a shared stateful g-regex) makes the even paragraphs miss.
    // Paragraphs 2 and 4 are the pinned targets.
    const xml = doc(
      '<w:p><w:r><w:t>REPLACEME-DUP in one</w:t></w:r></w:p>' +
        '<w:p><w:r><w:t>REPLACEME-DUP in two</w:t></w:r></w:p>' +
        '<w:p><w:r><w:t>REPLACEME-DUP in three</w:t></w:r></w:p>' +
        '<w:p><w:r><w:t>REPLACEME-DUP in four</w:t></w:r></w:p>'
    );

    const out = replaceMarkersInDocumentXml(xml, { DUP: 'Replaced Twice' }, DEFAULT_PREFIX);

    expect(out).toBe(
      doc(
        '<w:p><w:r><w:t>Replaced Twice in one</w:t></w:r></w:p>' +
          '<w:p><w:r><w:t>Replaced Twice in two</w:t></w:r></w:p>' +
          '<w:p><w:r><w:t>Replaced Twice in three</w:t></w:r></w:p>' +
          '<w:p><w:r><w:t>Replaced Twice in four</w:t></w:r></w:p>'
      )
    );
    // Every occurrence — including both pinned paragraphs — is replaced.
    expect((out.match(/Replaced Twice/g) ?? []).length).toBe(4);
    expect(out).not.toContain('REPLACEME-DUP');
  });

  it('13. replaces a marker inside a table cell (w:tbl>tr>tc>p)', () => {
    const xml = doc(
      '<w:tbl><w:tr><w:tc>' +
        '<w:p><w:r><w:t>Cell: REPLACEME-CELL</w:t></w:r></w:p>' +
        '</w:tc></w:tr></w:tbl>'
    );

    const out = replaceMarkersInDocumentXml(xml, { CELL: 'In Table' }, DEFAULT_PREFIX);

    expect(out).toBe(
      doc(
        '<w:tbl><w:tr><w:tc>' +
          '<w:p><w:r><w:t>Cell: In Table</w:t></w:r></w:p>' +
          '</w:tc></w:tr></w:tbl>'
      )
    );
    expect(out).not.toContain('REPLACEME-CELL');
  });

  it('14. replaces a tab-interrupted marker, keeping the tab after the value in document order', () => {
    // 'REPLACEME-DIAG' in run 1, '<w:tab/>' + 'NOSE3' in run 2: the tab
    // contributes NO character to the concatenated text, so the runs
    // concatenate to 'REPLACEME-DIAGNOSE3'. The cross-run value run is
    // inserted after the FIRST affected run, i.e. BEFORE the <w:tab/>.
    const xml = doc(
      '<w:p>' +
        '<w:r><w:t>REPLACEME-DIAG</w:t></w:r>' +
        '<w:r><w:tab/><w:t>NOSE3</w:t></w:r>' +
        '</w:p>'
    );

    const out = replaceMarkersInDocumentXml(xml, { DIAGNOSE3: 'Tab Value' }, DEFAULT_PREFIX);

    expect(out).toBe(
      doc(
        '<w:p>' +
          '<w:r><w:t></w:t></w:r>' +
          '<w:r><w:t xml:space="preserve">Tab Value</w:t></w:r>' +
          '<w:r><w:tab/><w:t></w:t></w:r>' +
          '</w:p>'
      )
    );
    // Document order pinned: the tab element is kept and the value sits
    // before it.
    expect(out).toContain('<w:tab/>');
    expect(out.indexOf('Tab Value')).toBeLessThan(out.indexOf('<w:tab/>'));
    expect(out).not.toContain('REPLACEME-DIAG');
    expect(out).not.toContain('NOSE3');
  });

  it('15. replaces a values-map identifier named constructor without prototype pollution', () => {
    // 'constructor' is a valid marker identifier but collides with the Object
    // prototype key; the engine's Map-based lookup (built from
    // Object.entries) must treat it as a normal own key.
    const xml = doc(
      '<w:p><w:r><w:t>Ctor: REPLACEME-constructor and REPLACEME-NAME</w:t></w:r></w:p>'
    );

    const out = replaceMarkersInDocumentXml(
      xml,
      { constructor: 'Instance', NAME: 'Normal' },
      DEFAULT_PREFIX
    );

    expect(out).toBe(
      doc('<w:p><w:r><w:t>Ctor: Instance and Normal</w:t></w:r></w:p>')
    );
  });

  it('16. skips an in-values marker inside <w:txbxContent>, leaving it byte-identical', () => {
    // Engine-level complement of the service-level skip pin: the marker IS in
    // values, but it lives inside a nested textbox structure (drawing), so the
    // engine must leave the whole document byte-untouched.
    const xml = doc(
      '<w:p><w:r>' +
        '<w:drawing><w:txbxContent>' +
        '<w:p><w:r><w:t>REPLACEME-BOX</w:t></w:r></w:p>' +
        '</w:txbxContent></w:drawing>' +
        '</w:r></w:p>'
    );

    const out = replaceMarkersInDocumentXml(xml, { BOX: 'Should Not Appear' }, DEFAULT_PREFIX);

    expect(out).toBe(xml);
    expect(out).toContain('REPLACEME-BOX');
    expect(out).not.toContain('Should Not Appear');
  });
});
