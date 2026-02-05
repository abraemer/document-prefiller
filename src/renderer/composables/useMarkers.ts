/**
 * useMarkers Composable
 * Manages marker state and operations
 */

import { ref, computed, watch, onUnmounted } from 'vue';
import type { Marker, ScanResult, ReplacementValuesFile } from '../../shared/types';
import { DEFAULT_PREFIX, AUTO_SAVE_DEBOUNCE_DELAY } from '../../shared/constants';

/**
 * Marker save status
 */
export type MarkerSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Marker statistics
 */
export interface MarkerStatistics {
  /** Total number of markers */
  total: number;
  /** Number of active markers */
  active: number;
  /** Number of new markers */
  new: number;
  /** Number of removed markers */
  removed: number;
  /** Number of markers with values */
  withValues: number;
  /** Number of markers without values */
  withoutValues: number;
}

/**
 * useMarkers Composable
 * 
 * Provides reactive state and operations for managing markers
 * 
 * @example
 * ```typescript
 * const {
 *   markers,
 *   saveStatus,
 *   statistics,
 *   loadFromScanResult,
 *   updateMarkerValue,
 *   addMarker,
 *   removeMarker,
 *   saveMarkers,
 *   clearMarkers
 * } = useMarkers();
 * ```
 */
export function useMarkers() {
  // ============================================================================
  // STATE
  // ============================================================================

  /** Current list of markers */
  const markers = ref<Marker[]>([]);

  /** Current folder path */
  const currentFolder = ref<string>('');

  /** Current prefix */
  const currentPrefix = ref<string>(DEFAULT_PREFIX);

  /** Save status */
  const saveStatus = ref<MarkerSaveStatus>('idle');

  /** Save error message */
  const saveError = ref<string>('');

  /** Debounce timer for auto-save */
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // ============================================================================
  // COMPUTED PROPERTIES
  // ============================================================================

  /**
   * Marker statistics
   */
  const statistics = computed<MarkerStatistics>(() => {
    const total = markers.value.length;
    const active = markers.value.filter((m) => m.status === 'active').length;
    const newMarkers = markers.value.filter((m) => m.status === 'new').length;
    const removed = markers.value.filter((m) => m.status === 'removed').length;
    const withValues = markers.value.filter((m) => m.value.length > 0).length;
    const withoutValues = markers.value.filter((m) => m.value.length === 0).length;

    return {
      total,
      active,
      new: newMarkers,
      removed,
      withValues,
      withoutValues,
    };
  });

  /**
   * Active markers (not removed)
   */
  const activeMarkers = computed<Marker[]>(() => {
    return markers.value.filter((m) => m.status !== 'removed');
  });

  /**
   * Markers with values
   */
  const markersWithValues = computed<Marker[]>(() => {
    return markers.value.filter((m) => m.value.length > 0);
  });

  /**
   * Markers without values
   */
  const markersWithoutValues = computed<Marker[]>(() => {
    return markers.value.filter((m) => m.value.length === 0);
  });

  /**
   * New markers (detected but not in save file)
   */
  const newMarkers = computed<Marker[]>(() => {
    return markers.value.filter((m) => m.status === 'new');
  });

  /**
   * Removed markers (in save file but not detected)
   */
  const removedMarkers = computed<Marker[]>(() => {
    return markers.value.filter((m) => m.status === 'removed');
  });

  // ============================================================================
  // MARKER OPERATIONS
  // ============================================================================

  /**
   * Load markers from scan result
   * 
   * @param scanResult - The scan result containing detected markers
   * @param savedValues - Optional saved values from save file
   */
  function loadFromScanResult(
    scanResult: ScanResult,
    savedValues?: ReplacementValuesFile
  ): void {
    currentFolder.value = scanResult.folder;
    currentPrefix.value = scanResult.prefix;

    // Get saved values if provided
    const savedValuesMap = savedValues?.values || {};

    // Create marker map from scan result
    const scannedMarkers = new Map<string, Marker>();
    for (const marker of scanResult.markers) {
      scannedMarkers.set(marker.identifier, marker);
    }

    // Build new markers list with status tracking
    const newMarkersList: Marker[] = [];

    // Add scanned markers
    for (const [identifier, marker] of scannedMarkers) {
      const savedValue = savedValuesMap[identifier];
      newMarkersList.push({
        identifier: marker.identifier,
        fullMarker: marker.fullMarker,
        value: savedValue || marker.value,
        status: savedValue ? 'active' : 'new',
        documents: marker.documents,
      });
    }

    // Add removed markers (in save file but not scanned)
    if (savedValues) {
      for (const [identifier, value] of Object.entries(savedValues.values)) {
        if (!scannedMarkers.has(identifier)) {
          newMarkersList.push({
            identifier,
            fullMarker: `${savedValues.prefix}${identifier}`,
            value,
            status: 'removed',
            documents: [],
          });
        }
      }
    }

    markers.value = newMarkersList;
  }

  /**
   * Update marker value
   * 
   * @param identifier - The marker identifier
   * @param value - The new value
   */
  function updateMarkerValue(identifier: string, value: string): void {
    const marker = markers.value.find((m) => m.identifier === identifier);
    if (marker) {
      marker.value = value;
      
      // Update status if marker was new or removed
      if (marker.status === 'new' || marker.status === 'removed') {
        marker.status = 'active';
      }
    }
  }

  /**
   * Add a new marker
   * 
   * @param identifier - The marker identifier
   * @param value - The marker value (default: empty string)
   * @param documents - List of documents containing this marker (default: empty array)
   */
  function addMarker(
    identifier: string,
    value: string = '',
    documents: string[] = []
  ): void {
    const existingMarker = markers.value.find((m) => m.identifier === identifier);
    if (existingMarker) {
      // Update existing marker
      existingMarker.value = value;
      existingMarker.documents = documents;
      if (existingMarker.status === 'removed') {
        existingMarker.status = 'active';
      }
    } else {
      // Add new marker
      markers.value.push({
        identifier,
        fullMarker: `${currentPrefix.value}${identifier}`,
        value,
        status: 'new',
        documents,
      });
    }
  }

  /**
   * Remove a marker
   * 
   * @param identifier - The marker identifier
   */
  function removeMarker(identifier: string): void {
    const marker = markers.value.find((m) => m.identifier === identifier);
    if (marker) {
      marker.status = 'removed';
    }
  }

  /**
   * Permanently delete a marker from the list
   * 
   * @param identifier - The marker identifier
   */
  function deleteMarker(identifier: string): void {
    const index = markers.value.findIndex((m) => m.identifier === identifier);
    if (index !== -1) {
      markers.value.splice(index, 1);
    }
  }

  /**
   * Clear all markers
   */
  function clearMarkers(): void {
    markers.value = [];
    currentFolder.value = '';
    currentPrefix.value = DEFAULT_PREFIX;
  }

  /**
   * Get marker by identifier
   * 
   * @param identifier - The marker identifier
   * @returns The marker or undefined if not found
   */
  function getMarker(identifier: string): Marker | undefined {
    return markers.value.find((m) => m.identifier === identifier);
  }

  /**
   * Check if marker exists
   * 
   * @param identifier - The marker identifier
   * @returns True if marker exists
   */
  function hasMarker(identifier: string): boolean {
    return markers.value.some((m) => m.identifier === identifier);
  }

  // ============================================================================
  // SAVE OPERATIONS
  // ============================================================================

  /**
   * Save markers to save file
   * 
   * @returns Promise that resolves to true if save was successful
   */
  async function saveMarkers(): Promise<boolean> {
    if (!currentFolder.value) {
      saveError.value = 'No folder selected';
      saveStatus.value = 'error';
      return false;
    }

    saveStatus.value = 'saving';
    saveError.value = '';

    try {
      // Build replacement values file
      const replacementValues: ReplacementValuesFile = {
        prefix: currentPrefix.value,
        values: {},
        version: '1.0',
        lastModified: new Date().toISOString(),
      };

      // Add active markers and new markers (not removed)
      for (const marker of markers.value) {
        if (marker.status !== 'removed') {
          replacementValues.values[marker.identifier] = marker.value;
        }
      }

      // Save via IPC
      const response = await window.api.settings.saveSettings({
        settings: {
          lastFolder: currentFolder.value,
          preferences: {
            defaultPrefix: currentPrefix.value,
          },
        },
      });

      if (response.success) {
        saveStatus.value = 'saved';
        return true;
      } else {
        saveError.value = response.error || 'Failed to save markers';
        saveStatus.value = 'error';
        return false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      saveError.value = errorMessage;
      saveStatus.value = 'error';
      return false;
    }
  }

  /**
   * Auto-save markers with debounce
   * 
   * @param delay - Debounce delay in milliseconds (default: AUTO_SAVE_DEBOUNCE_DELAY)
   */
  function autoSave(delay: number = AUTO_SAVE_DEBOUNCE_DELAY): void {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      saveMarkers();
    }, delay);
  }

  /**
   * Cancel pending auto-save
   */
  function cancelAutoSave(): void {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  // ============================================================================
  // WATCHERS
  // ============================================================================

  // Auto-save on marker value changes
  watch(
    () => markers.value.map((m) => ({ id: m.identifier, value: m.value })),
    () => {
      autoSave();
    },
    { deep: true }
  );

  // ============================================================================
  // CLEANUP
  // ============================================================================

  onUnmounted(() => {
    cancelAutoSave();
  });

  // ============================================================================
  // RETURN
  // ============================================================================

  return {
    // State
    markers,
    currentFolder,
    currentPrefix,
    saveStatus,
    saveError,

    // Computed
    statistics,
    activeMarkers,
    markersWithValues,
    markersWithoutValues,
    newMarkers,
    removedMarkers,

    // Operations
    loadFromScanResult,
    updateMarkerValue,
    addMarker,
    removeMarker,
    deleteMarker,
    clearMarkers,
    getMarker,
    hasMarker,

    // Save operations
    saveMarkers,
    autoSave,
    cancelAutoSave,
  };
}