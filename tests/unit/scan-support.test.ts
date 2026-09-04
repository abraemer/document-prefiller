/**
 * Unit Tests for Scan Support Helpers (dedupeMarkers + markersToValues)
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { dedupeMarkers, markersToValues } from '../../src/core/scan-support.js';
import { DEFAULT_PREFIX, MAX_UNIQUE_MARKERS } from '../../src/shared/constants';
import type { DocumentMarker } from '../../src/shared/types';

function makeDocumentMarker(overrides: Partial<DocumentMarker> & { id: string }): DocumentMarker {
  return {
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    value: overrides.value ?? '',
    prefix: overrides.prefix ?? DEFAULT_PREFIX,
    enabled: overrides.enabled ?? true,
  };
}

describe('Scan Support Helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // DEDUPE MARKERS
  // ============================================================================

  describe('dedupeMarkers', () => {
    it('should merge the same identifier across files into one marker', () => {
      const documentMarkers = new Map<string, string[]>([
        ['first.docx', ['NAME']],
        ['second.docx', ['NAME', 'TITLE']],
      ]);

      const markers = dedupeMarkers(documentMarkers, 'REPLACEME-');

      expect(markers).toHaveLength(2);
      expect(markers[0]).toEqual({
        identifier: 'NAME',
        fullMarker: 'REPLACEME-NAME',
        value: '',
        status: 'new',
        documents: ['first.docx', 'second.docx'],
      });
      expect(markers[1]?.documents).toEqual(['second.docx']);
    });

    it('should not list a document twice for one marker', () => {
      const documentMarkers = new Map<string, string[]>([
        ['only.docx', ['NAME', 'NAME']],
      ]);

      const markers = dedupeMarkers(documentMarkers, 'REPLACEME-');

      expect(markers).toHaveLength(1);
      expect(markers[0]?.documents).toEqual(['only.docx']);
    });

    it('should cap at MAX_UNIQUE_MARKERS and warn', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const total = MAX_UNIQUE_MARKERS + 1;
      const identifiers = Array.from({ length: total }, (_, i) => `M${i}`);
      const documentMarkers = new Map<string, string[]>([['big.docx', identifiers]]);

      const markers = dedupeMarkers(documentMarkers, 'REPLACEME-');

      expect(markers).toHaveLength(MAX_UNIQUE_MARKERS);
      expect(markers[0]?.identifier).toBe('M0');
      expect(markers[MAX_UNIQUE_MARKERS - 1]?.identifier).toBe(
        `M${MAX_UNIQUE_MARKERS - 1}`
      );
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        `Too many unique markers found (${total}). Maximum allowed is ${MAX_UNIQUE_MARKERS}.`
      );
    });

    it('should not warn when at or below the cap', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const identifiers = Array.from({ length: MAX_UNIQUE_MARKERS }, (_, i) => `M${i}`);
      const documentMarkers = new Map<string, string[]>([['edge.docx', identifiers]]);

      const markers = dedupeMarkers(documentMarkers, 'REPLACEME-');

      expect(markers).toHaveLength(MAX_UNIQUE_MARKERS);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // MARKERS TO VALUES
  // ============================================================================

  describe('markersToValues', () => {
    it('should skip disabled markers', () => {
      const markers: DocumentMarker[] = [
        makeDocumentMarker({ id: 'ON', value: 'yes' }),
        makeDocumentMarker({ id: 'OFF', value: 'no', enabled: false }),
      ];

      const { values } = markersToValues(markers);

      expect(values).toEqual({ ON: 'yes' });
    });

    it('should use the first enabled marker prefix and ignore later ones', () => {
      const markers: DocumentMarker[] = [
        makeDocumentMarker({ id: 'A', prefix: 'FIRST-' }),
        makeDocumentMarker({ id: 'B', prefix: 'SECOND-' }),
      ];

      const { prefix } = markersToValues(markers);

      expect(prefix).toBe('FIRST-');
    });

    it('should fall back to DEFAULT_PREFIX when no enabled marker has a prefix', () => {
      const markers: DocumentMarker[] = [
        makeDocumentMarker({ id: 'A', prefix: '' }),
        makeDocumentMarker({ id: 'B', prefix: '' }),
      ];

      const { prefix } = markersToValues(markers);

      expect(prefix).toBe(DEFAULT_PREFIX);
    });

    it('should let a later marker set the prefix when the first enabled one has none', () => {
      const markers: DocumentMarker[] = [
        makeDocumentMarker({ id: 'A', prefix: '' }),
        makeDocumentMarker({ id: 'B', prefix: 'LATER-' }),
      ];

      const { prefix } = markersToValues(markers);

      expect(prefix).toBe('LATER-');
    });

    it('should yield empty values when all markers are disabled', () => {
      const markers: DocumentMarker[] = [
        makeDocumentMarker({ id: 'A', enabled: false }),
        makeDocumentMarker({ id: 'B', enabled: false, value: 'x' }),
      ];

      const result = markersToValues(markers);

      expect(result.values).toEqual({});
      expect(result.prefix).toBe(DEFAULT_PREFIX);
    });

    it('should key values by marker id and read marker value', () => {
      const markers: DocumentMarker[] = [
        makeDocumentMarker({ id: 'ID1', name: 'Display name', value: 'typed text' }),
      ];

      const { values } = markersToValues(markers);

      expect(values).toEqual({ ID1: 'typed text' });
    });
  });
});
