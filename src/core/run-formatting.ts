/**
 * Run Formatting Utility
 *
 * Merges the verbatim <w:rPr> inner XML of a marker's fragment runs (document
 * order) into a single rPr inner string. Managed character-formatting elements
 * (bold, italic, strike, dstrike, size, underline) are overridden with values
 * derived from ALL fragments and re-inserted at CT_RPr schema-correct
 * positions. The merged result never contains duplicate managed element names
 * (schema-invalid; triggers Word's "unreadable content" repair).
 */

/** Element names whose values are overridden by the merge. */
const MANAGED_ELEMENT_NAMES = ['b', 'bCs', 'i', 'iCs', 'strike', 'dstrike', 'u', 'sz', 'szCs'];

/**
 * CT_RPr child element order (subset needed to position managed elements).
 * Managed relative order derived from it: b < bCs < i < iCs < strike < dstrike
 * < sz < szCs < u.
 */
const CT_RPR_ORDER = [
  'rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps', 'strike', 'dstrike',
  'outline', 'shadow', 'emboss', 'imprint', 'noProof', 'snapToGrid', 'vanish', 'webHidden',
  'color', 'spacing', 'w', 'kern', 'position', 'sz', 'szCs', 'highlight', 'u', 'effect',
  'bdr', 'shd', 'fitText', 'vertAlign', 'rtl', 'cs', 'em', 'lang', 'eastAsianLayout',
  'specVanish', 'oMath',
];

/** Attribute-safe content pattern (quoted values may contain '>'). */
const ATTRS = `(?:"[^"]*"|'[^']*'|[^>"'])`;

interface ManagedElement {
  /** CT_RPr element name, used to find the schema-correct insertion position. */
  name: string;
  /** Verbatim XML of the element to insert. */
  xml: string;
}

/**
 * Regex matching the OPEN TAG of <w:name ...> (self-closed or paired form).
 */
function openTag(name: string): RegExp {
  return new RegExp(`<w:${name}(?=[\\s/>])${ATTRS}*>`, 'g');
}

/**
 * Regex matching the FULL element <w:name .../> or <w:name ...>...</w:name>,
 * including attributes.
 */
function fullElement(name: string): RegExp {
  return new RegExp(
    `<w:${name}(?=[\\s/>])${ATTRS}*/>|<w:${name}(?=[\\s/>])${ATTRS}*>[\\s\\S]*?</w:${name}\\s*>`,
    'g'
  );
}

/**
 * Strip every managed element (both self-closed and paired forms) from an
 * rPr inner XML string.
 */
function stripManagedElements(xml: string): string {
  let out = xml;
  for (const name of MANAGED_ELEMENT_NAMES) {
    out = out.replace(fullElement(name), '');
  }
  return out;
}

/**
 * Extract the w:val attribute value from a tag, or null if absent.
 */
function extractVal(tag: string): string | null {
  const match = /w:val\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(tag);
  if (match === null) {
    return null;
  }
  return match[1] !== undefined ? match[1] : (match[2] ?? '');
}

/**
 * ST_OnOff truthiness: w:val absent, true/1/on (case-insensitive) = ON;
 * everything else (0/false/off, case-insensitive) = OFF.
 */
function isOn(tag: string): boolean {
  const val = extractVal(tag);
  if (val === null) {
    return true;
  }
  const normalized = val.toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'on';
}

/**
 * Whether the fragment XML contains a truthy <w:name> element.
 */
function hasTruthyElement(xml: string, name: string): boolean {
  const re = openTag(name);
  let match = re.exec(xml);
  while (match !== null) {
    if (isOn(match[0])) {
      return true;
    }
    match = re.exec(xml);
  }
  return false;
}

/**
 * Largest explicit <w:sz w:val> across fragments (half-point numeric compare).
 * w:val="0" and non-numeric values are ignored. Inherited/style sizes are NOT
 * considered. Returns null when no fragment has an explicit size.
 */
function maxExplicitSz(fragments: string[]): number | null {
  let max: number | null = null;
  for (const fragment of fragments) {
    const re = openTag('sz');
    let match = re.exec(fragment);
    while (match !== null) {
      const val = extractVal(match[0]);
      if (val !== null) {
        const size = Number(val);
        if (Number.isFinite(size) && size > 0 && (max === null || size > max)) {
          max = size;
        }
      }
      match = re.exec(fragment);
    }
  }
  return max;
}

/**
 * The FIRST fragment (document order) with a non-`none` <w:u> element
 * contributes that element VERBATIM (absent w:val means single; the `none`
 * comparison is case-insensitive). Returns null when no underline applies.
 */
function firstUnderline(fragments: string[]): string | null {
  for (const fragment of fragments) {
    const re = fullElement('u');
    let match = re.exec(fragment);
    while (match !== null) {
      const val = extractVal(match[0]);
      const normalized = (val ?? 'single').toLowerCase();
      if (normalized !== 'none') {
        return match[0];
      }
      match = re.exec(fragment);
    }
  }
  return null;
}

/**
 * Local part of a tag name ("w:b" -> "b").
 */
function localName(tagName: string): string {
  const colon = tagName.indexOf(':');
  return colon === -1 ? tagName : tagName.slice(colon + 1);
}

/**
 * Insert managed elements (in managed order) into the stripped base at
 * schema-correct positions: each is placed immediately before the first base
 * element that FOLLOWS it in the CT_RPr order; if none follows, it is appended
 * at the end. Elements unknown to CT_RPR_ORDER keep their relative position.
 */
function insertManagedElements(base: string, elements: ManagedElement[]): string {
  let result = base;
  for (const element of elements) {
    const ownIndex = CT_RPR_ORDER.indexOf(element.name);
    const re = new RegExp(`<([A-Za-z][A-Za-z0-9.:-]*)${ATTRS}*>`, 'g');
    let insertAt = -1;
    let match = re.exec(result);
    while (match !== null) {
      if (CT_RPR_ORDER.indexOf(localName(match[1])) > ownIndex) {
        insertAt = match.index;
        break;
      }
      match = re.exec(result);
    }
    result =
      insertAt === -1
        ? result + element.xml
        : result.slice(0, insertAt) + element.xml + result.slice(insertAt);
  }
  return result;
}

/**
 * Merge the rPr inner XML of a marker's fragment runs into one rPr inner string.
 *
 * The first fragment's inner XML (empty string when absent/empty) is cloned as
 * the base; managed elements are stripped from it and re-computed from ALL
 * fragments: font size = MAX explicit <w:sz w:val> (mirrored to <w:szCs>);
 * bold/italic/strike when ANY fragment has a truthy <w:b>/<w:bCs>,
 * <w:i>/<w:iCs>, <w:strike>/<w:dstrike>; underline = first non-`none` <w:u>
 * element, verbatim. Only direct rPr content is considered (no rStyle
 * resolution, no inherited/style formatting).
 *
 * @param rPrInners - Verbatim inner XML of each fragment run's <w:rPr> in
 *   document order (first entry = first fragment; null/empty = no rPr).
 * @returns Merged rPr inner XML with no duplicate managed elements, in CT_RPr
 *   order.
 */
export function mergeRunFormatting(
  rPrInners: Array<string | null | undefined>
): string {
  const fragments = rPrInners.map((inner) => (typeof inner === 'string' ? inner : ''));
  const base = fragments.length > 0 ? fragments[0] : '';
  const strippedBase = stripManagedElements(base);

  const bold = fragments.some((f) => hasTruthyElement(f, 'b') || hasTruthyElement(f, 'bCs'));
  const italic = fragments.some((f) => hasTruthyElement(f, 'i') || hasTruthyElement(f, 'iCs'));
  const strike = fragments.some(
    (f) => hasTruthyElement(f, 'strike') || hasTruthyElement(f, 'dstrike')
  );
  const size = maxExplicitSz(fragments);
  const underline = firstUnderline(fragments);

  const managed: ManagedElement[] = [];
  if (bold) {
    managed.push({ name: 'b', xml: '<w:b/>' }, { name: 'bCs', xml: '<w:bCs/>' });
  }
  if (italic) {
    managed.push({ name: 'i', xml: '<w:i/>' }, { name: 'iCs', xml: '<w:iCs/>' });
  }
  if (strike) {
    managed.push({ name: 'strike', xml: '<w:strike/>' });
  }
  if (size !== null) {
    managed.push(
      { name: 'sz', xml: `<w:sz w:val="${size}"/>` },
      { name: 'szCs', xml: `<w:szCs w:val="${size}"/>` }
    );
  }
  if (underline !== null) {
    managed.push({ name: 'u', xml: underline });
  }

  return insertManagedElements(strippedBase, managed);
}
