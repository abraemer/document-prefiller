/**
 * Scan Support Helpers
 * Shared marker deduplication and markers-to-values conversion, usable from
 * both the Electron main process and the web renderer (no Node imports).
 */

import type { Marker } from '../shared/types/data-models.js';
import type { DocumentMarker } from '../shared/types/ipc.js';
import { DEFAULT_PREFIX, MAX_UNIQUE_MARKERS } from '../shared/constants/index.js';

/**
 * Deduplicate markers across all documents and create Marker objects
 *
 * @param documentMarkers - Map of file names to their detected markers
 * @param prefix - Marker prefix used
 * @returns Array of deduplicated Marker objects
 */
export function dedupeMarkers(
  documentMarkers: Map<string, string[]>,
  prefix: string
): Marker[] {
  const markerMap: Map<string, Marker> = new Map();

  for (const [fileName, markers] of documentMarkers.entries()) {
    for (const identifier of markers) {
      const fullMarker = `${prefix}${identifier}`;

      if (markerMap.has(identifier)) {
        // Add this document to existing marker
        const existingMarker = markerMap.get(identifier);
        if (existingMarker && !existingMarker.documents.includes(fileName)) {
          existingMarker.documents.push(fileName);
        }
      } else {
        // Create new marker
        const marker: Marker = {
          identifier,
          fullMarker,
          value: '',
          status: 'new',
          documents: [fileName],
        };
        markerMap.set(identifier, marker);
      }
    }
  }

  // Convert map to array
  const markers = Array.from(markerMap.values());

  // Validate marker count
  if (markers.length > MAX_UNIQUE_MARKERS) {
    console.warn(
      `Too many unique markers found (${markers.length}). Maximum allowed is ${MAX_UNIQUE_MARKERS}.`
    );
    // Return only the first MAX_UNIQUE_MARKERS markers
    return markers.slice(0, MAX_UNIQUE_MARKERS);
  }

  return markers;
}

/**
 * Convert document markers to replacement values and the effective prefix
 *
 * Disabled markers are skipped; the first enabled marker's prefix wins.
 *
 * @param markers - Markers to convert
 * @returns Replacement values keyed by marker id, plus the effective prefix
 */
export function markersToValues(markers: DocumentMarker[]): {
  values: Record<string, string>;
  prefix: string;
} {
  const values: Record<string, string> = {};
  let prefix = DEFAULT_PREFIX;

  for (const marker of markers) {
    if (!marker.enabled) {
      continue; // Skip disabled markers
    }

    // Use the first marker's prefix
    if (prefix === DEFAULT_PREFIX && marker.prefix) {
      prefix = marker.prefix;
    }

    values[marker.id] = marker.value;
  }

  return { values, prefix };
}
