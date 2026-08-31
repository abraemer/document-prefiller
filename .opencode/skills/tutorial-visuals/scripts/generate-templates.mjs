/**
 * Generate the tutorial example .docx templates.
 *
 * Produces Word-valid minimal OPC packages (not just app-parser-valid)
 * in docs/tutorial/templates/. Every zip entry gets a fixed date so
 * regeneration is byte-reproducible (see sha256 check in the workflow).
 *
 * Usage:
 *   node .opencode/skills/tutorial-visuals/scripts/generate-templates.mjs [--out <dir>]
 */

import JSZip from 'jszip';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Fixed zip entry timestamp -> byte-reproducible output.
const ZIP_DATE = new Date('2026-01-01T00:00:00Z');

// Default output: <worktree-root>/docs/tutorial/templates, regardless of cwd.
// NOTE: URL resolution counts the script filename as a segment, so 4 ../ hops
// (scripts -> tutorial-visuals -> skills -> .opencode) land on the worktree root.
const DEFAULT_OUT_DIR = fileURLToPath(
  new URL('../../../../docs/tutorial/templates/', import.meta.url)
);

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

const RELATIONSHIPS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';

const DOCUMENT_REL_TYPE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument';

const DOCUMENT_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';

const RELS_CONTENT_TYPE = 'application/vnd.openxmlformats-package.relationships+xml';

const CONTENT_TYPES_XML = `${XML_DECLARATION}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="${RELS_CONTENT_TYPE}"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="${DOCUMENT_CONTENT_TYPE}"/>
</Types>`;

const ROOT_RELS_XML = `${XML_DECLARATION}
<Relationships xmlns="${RELATIONSHIPS_NS}">
  <Relationship Id="rId1" Type="${DOCUMENT_REL_TYPE}" Target="word/document.xml"/>
</Relationships>`;

// No images/styles/numbering parts referenced by document.xml -> empty rels.
const DOCUMENT_RELS_XML = `${XML_DECLARATION}
<Relationships xmlns="${RELATIONSHIPS_NS}"/>`;

/**
 * Escape XML special characters in run text.
 */
function escapeXml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/**
 * Build the word/document.xml part: one w:p per paragraph, each paragraph's
 * text in a single w:t run (markers are never split across runs/paragraphs).
 */
function buildDocumentXml(paragraphs) {
  const body = paragraphs
    .map((text) => `    <w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`)
    .join('\n');

  return `${XML_DECLARATION}
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
${body}
  </w:body>
</w:document>`;
}

const templates = [
  {
    name: 'letter.docx',
    paragraphs: [
      'REPLACEME-DATE',
      'Dear REPLACEME-RECIPIENT_NAME,',
      'Thank you for your interest in REPLACEME-COMPANY_NAME. Our office is located at REPLACEME-ADDRESS.',
      'We look forward to hearing from you.',
    ],
  },
  {
    name: 'invoice.docx',
    paragraphs: [
      'Invoice REPLACEME-INVOICE_NUMBER',
      'Billed to: REPLACEME-COMPANY_NAME',
      'Total amount due: REPLACEME-AMOUNT',
      'Payment due by REPLACEME-DUE_DATE.',
    ],
  },
  {
    name: 'certificate.docx',
    paragraphs: [
      'Certificate of Completion',
      'This certifies that REPLACEME-RECIPIENT_NAME has successfully completed the course REPLACEME-COURSE_NAME.',
      'Issued on REPLACEME-DATE.',
    ],
  },
];

function parseOutDir(argv) {
  const outIndex = argv.indexOf('--out');
  if (outIndex === -1) {
    return DEFAULT_OUT_DIR;
  }

  const outValue = argv[outIndex + 1];
  if (!outValue) {
    throw new Error('Missing value for --out');
  }

  return path.resolve(outValue);
}

async function generateTemplate(template) {
  const zip = new JSZip();
  // createFolders: false -> no implicit directory entries (those would carry
  // current-time dates and break byte-reproducibility; OPC does not need them).
  const zipOptions = { date: ZIP_DATE, createFolders: false };

  zip.file('[Content_Types].xml', CONTENT_TYPES_XML, zipOptions);
  zip.file('_rels/.rels', ROOT_RELS_XML, zipOptions);
  zip.file('word/document.xml', buildDocumentXml(template.paragraphs), zipOptions);
  zip.file('word/_rels/document.xml.rels', DOCUMENT_RELS_XML, zipOptions);

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function main() {
  const outDir = parseOutDir(process.argv.slice(2));

  await mkdir(outDir, { recursive: true });

  for (const template of templates) {
    const buffer = await generateTemplate(template);
    await writeFile(path.join(outDir, template.name), buffer);
    console.log(`Generated ${path.join(outDir, template.name)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
