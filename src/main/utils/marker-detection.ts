/**
 * Marker Detection Utility
 * Provides robust marker detection with configurable prefixes and comprehensive error handling
 */

import {
  MARKER_PATTERN,
  MAX_MARKER_NAME_LENGTH,
  MIN_PREFIX_LENGTH,
  MAX_PREFIX_LENGTH,
} from '../../shared/constants/index.js';

/**
 * Error class for marker detection errors
 */
export class MarkerDetectionError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'MarkerDetectionError';
  }
}

/**
 * Validate marker prefix
 *
 * @param prefix - Prefix to validate
 * @throws MarkerDetectionError if prefix is invalid
 */
export function validatePrefix(prefix: string): void {
  if (typeof prefix !== 'string') {
    throw new MarkerDetectionError('Prefix must be a string');
  }

  if (prefix.length === 0) {
    throw new MarkerDetectionError('Prefix cannot be empty');
  }

  if (prefix.length < MIN_PREFIX_LENGTH) {
    throw new MarkerDetectionError(
      `Prefix must be at least ${MIN_PREFIX_LENGTH} character(s) long`
    );
  }

  if (prefix.length > MAX_PREFIX_LENGTH) {
    throw new MarkerDetectionError(
      `Prefix cannot exceed ${MAX_PREFIX_LENGTH} characters`
    );
  }
}

/**
 * Validate marker identifier
 *
 * @param identifier - Identifier to validate
 * @returns true if valid, false otherwise
 */
export function isValidIdentifier(identifier: string): boolean {
  if (typeof identifier !== 'string') {
    return false;
  }

  if (identifier.length === 0) {
    return false;
  }

  if (identifier.length > MAX_MARKER_NAME_LENGTH) {
    return false;
  }

  // Check if identifier matches the pattern (alphanumeric and underscores only)
  return MARKER_PATTERN.test(identifier);
}

/**
 * Escape special regex characters in a string
 *
 * @param str - String to escape
 * @returns Escaped string safe for use in regex
 */
export function escapeRegexSpecialChars(str: string): string {
  // Escape all special regex characters: . * + ? ^ $ { } ( ) | [ ] \ -
  return str.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
}

/**
 * Create a regex pattern for marker detection
 *
 * The pattern uses a word boundary at the start and a negative lookahead at the end
 * to ensure markers are detected correctly and not as part of larger words.
 *
 * @param prefix - Marker prefix to use
 * @returns RegExp object for marker detection
 * @throws MarkerDetectionError if prefix is invalid
 */
export function createMarkerRegex(prefix: string): RegExp {
  validatePrefix(prefix);

  const escapedPrefix = escapeRegexSpecialChars(prefix);

  // Pattern explanation:
  // \b - Word boundary (matches at start of string or after non-word character)
  // ${escapedPrefix} - The escaped prefix
  // ([A-Za-z0-9_]+) - Capture group for identifier (alphanumeric + underscore)
  // (?![A-Za-z0-9_]) - Negative lookahead: ensures identifier doesn't continue with more word characters
  const pattern = `\\b${escapedPrefix}([A-Za-z0-9_]+)(?![A-Za-z0-9_])`;

  return new RegExp(pattern, 'g');
}

/**
 * Detect markers in text content using the specified prefix
 *
 * This function:
 * - Validates the prefix
 * - Creates a regex pattern with word boundaries
 * - Finds all unique markers in the text
 * - Validates each identifier
 * - Handles edge cases (empty text, no markers, etc.)
 *
 * @param text - Text content to search for markers
 * @param prefix - Marker prefix to use for detection
 * @param maxMarkers - Maximum number of markers to detect (default: 1000)
 * @returns Array of detected marker identifiers (without prefix)
 * @throws MarkerDetectionError if prefix is invalid or text is not a string
 */
export function detectMarkers(
  text: string,
  prefix: string,
  maxMarkers: number = 1000
): string[] {
  // Validate input types
  if (typeof text !== 'string') {
    throw new MarkerDetectionError('Text must be a string');
  }

  // Validate prefix
  validatePrefix(prefix);

  // Handle empty text
  if (text.length === 0) {
    return [];
  }

  // Validate maxMarkers
  if (typeof maxMarkers !== 'number' || maxMarkers <= 0 || !Number.isFinite(maxMarkers)) {
    throw new MarkerDetectionError('maxMarkers must be a positive number');
  }

  const markers: Set<string> = new Set();
  const markerRegex = createMarkerRegex(prefix);

  let match: RegExpExecArray | null;
  let matchCount = 0;

  // Find all matches
  while ((match = markerRegex.exec(text)) !== null) {
    // Check if we've reached the maximum
    if (matchCount >= maxMarkers) {
      console.warn(
        `Maximum marker limit (${maxMarkers}) reached. Some markers may not be detected.`
      );
      break;
    }

    const identifier = match[1];

    // Validate identifier
    if (isValidIdentifier(identifier)) {
      markers.add(identifier);
    } else {
      console.warn(
        `Invalid marker identifier detected: "${identifier}". Skipping.`
      );
    }

    matchCount++;
  }

  return Array.from(markers);
}

/**
 * Detect markers with detailed information including positions
 *
 * This function provides more detailed information about detected markers,
 * including their positions in the text. Useful for debugging and advanced
 * use cases.
 *
 * @param text - Text content to search for markers
 * @param prefix - Marker prefix to use for detection
 * @param maxMarkers - Maximum number of markers to detect (default: 1000)
 * @returns Array of marker details with positions
 * @throws MarkerDetectionError if prefix is invalid or text is not a string
 */
export interface MarkerMatch {
  identifier: string;
  fullMarker: string;
  startIndex: number;
  endIndex: number;
}

export function detectMarkersWithPositions(
  text: string,
  prefix: string,
  maxMarkers: number = 1000
): MarkerMatch[] {
  // Validate input types
  if (typeof text !== 'string') {
    throw new MarkerDetectionError('Text must be a string');
  }

  // Validate prefix
  validatePrefix(prefix);

  // Handle empty text
  if (text.length === 0) {
    return [];
  }

  // Validate maxMarkers
  if (typeof maxMarkers !== 'number' || maxMarkers <= 0 || !Number.isFinite(maxMarkers)) {
    throw new MarkerDetectionError('maxMarkers must be a positive number');
  }

  const matches: MarkerMatch[] = [];
  const markerRegex = createMarkerRegex(prefix);

  let match: RegExpExecArray | null;
  let matchCount = 0;

  // Find all matches
  while ((match = markerRegex.exec(text)) !== null) {
    // Check if we've reached the maximum
    if (matchCount >= maxMarkers) {
      console.warn(
        `Maximum marker limit (${maxMarkers}) reached. Some markers may not be detected.`
      );
      break;
    }

    const identifier = match[1];
    const fullMarker = match[0];
    const startIndex = match.index;
    const endIndex = match.index + fullMarker.length;

    // Validate identifier
    if (isValidIdentifier(identifier)) {
      matches.push({
        identifier,
        fullMarker,
        startIndex,
        endIndex,
      });
    } else {
      console.warn(
        `Invalid marker identifier detected: "${identifier}". Skipping.`
      );
    }

    matchCount++;
  }

  return matches;
}

/**
 * Count occurrences of a specific marker in text
 *
 * @param text - Text content to search
 * @param prefix - Marker prefix
 * @param identifier - Marker identifier (without prefix)
 * @returns Number of occurrences
 * @throws MarkerDetectionError if prefix or identifier is invalid
 */
export function countMarkerOccurrences(
  text: string,
  prefix: string,
  identifier: string
): number {
  // Validate inputs
  if (typeof text !== 'string') {
    throw new MarkerDetectionError('Text must be a string');
  }

  validatePrefix(prefix);

  if (!isValidIdentifier(identifier)) {
    throw new MarkerDetectionError(
      `Invalid marker identifier: "${identifier}"`
    );
  }

  const escapedPrefix = escapeRegexSpecialChars(prefix);
  const escapedIdentifier = escapeRegexSpecialChars(identifier);
  const pattern = `\\b${escapedPrefix}${escapedIdentifier}\\b`;
  const regex = new RegExp(pattern, 'g');

  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

/**
 * Replace markers in text with provided values
 *
 * @param text - Text content with markers
 * @param prefix - Marker prefix
 * @param replacements - Map of identifier to replacement value
 * @returns Text with markers replaced
 * @throws MarkerDetectionError if prefix is invalid
 */
export function replaceMarkers(
  text: string,
  prefix: string,
  replacements: Record<string, string>
): string {
  // Validate inputs
  if (typeof text !== 'string') {
    throw new MarkerDetectionError('Text must be a string');
  }

  validatePrefix(prefix);

  if (typeof replacements !== 'object' || replacements === null) {
    throw new MarkerDetectionError('Replacements must be an object');
  }

  let result = text;

  for (const [identifier, value] of Object.entries(replacements)) {
    if (!isValidIdentifier(identifier)) {
      console.warn(
        `Skipping invalid marker identifier: "${identifier}"`
      );
      continue;
    }

    const escapedPrefix = escapeRegexSpecialChars(prefix);
    const escapedIdentifier = escapeRegexSpecialChars(identifier);
    const pattern = `\\b${escapedPrefix}${escapedIdentifier}\\b`;
    const regex = new RegExp(pattern, 'g');

    // Replace all occurrences
    result = result.replace(regex, value);
  }

  return result;
}

/**
 * Extract all unique markers from multiple text sources
 *
 * @param texts - Array of text contents to search
 * @param prefix - Marker prefix to use for detection
 * @param maxMarkers - Maximum number of markers to detect per text (default: 1000)
 * @returns Array of unique marker identifiers
 * @throws MarkerDetectionError if prefix is invalid
 */
export function detectMarkersFromMultipleTexts(
  texts: string[],
  prefix: string,
  maxMarkers: number = 1000
): string[] {
  if (!Array.isArray(texts)) {
    throw new MarkerDetectionError('texts must be an array');
  }

  const allMarkers: Set<string> = new Set();

  for (const text of texts) {
    if (typeof text !== 'string') {
      console.warn('Skipping non-string text in detectMarkersFromMultipleTexts');
      continue;
    }

    const markers = detectMarkers(text, prefix, maxMarkers);
    markers.forEach((marker) => allMarkers.add(marker));
  }

  return Array.from(allMarkers);
}