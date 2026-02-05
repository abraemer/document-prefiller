/**
 * useDocuments Composable
 * Manages document state and operations
 */

import { ref, computed, watch, onUnmounted } from 'vue';
import type { ScanResult, DocumentInfo } from '../../shared/types';

/**
 * Document scan status
 */
export type DocumentScanStatus = 'idle' | 'scanning' | 'success' | 'error';

/**
 * Document statistics
 */
export interface DocumentStatistics {
  /** Total number of documents */
  total: number;
  /** Number of documents with markers */
  withMarkers: number;
  /** Number of documents without markers */
  withoutMarkers: number;
  /** Total number of unique markers across all documents */
  totalMarkers: number;
  /** Average markers per document */
  averageMarkers: number;
}

/**
 * useDocuments Composable
 * 
 * Provides reactive state and operations for managing documents
 * 
 * @example
 * ```typescript
 * const {
 *   documents,
 *   scanStatus,
 *   scanError,
 *   statistics,
 *   loadFromScanResult,
 *   getDocuments,
 *   filterByMarkerCount,
 *   clearDocuments,
 *   getDocumentByName
 * } = useDocuments();
 * ```
 */
export function useDocuments() {
  // ============================================================================
  // STATE
  // ============================================================================

  /** Current list of documents */
  const documents = ref<DocumentInfo[]>([]);

  /** Current folder path */
  const currentFolder = ref<string>('');

  /** Current prefix */
  const currentPrefix = ref<string>('');

  /** Scan status */
  const scanStatus = ref<DocumentScanStatus>('idle');

  /** Scan error message */
  const scanError = ref<string>('');

  /** Scan timestamp */
  const scanTimestamp = ref<string>('');

  // ============================================================================
  // COMPUTED PROPERTIES
  // ============================================================================

  /**
   * Document statistics
   */
  const statistics = computed<DocumentStatistics>(() => {
    const total = documents.value.length;
    const withMarkers = documents.value.filter((d) => d.markers.length > 0).length;
    const withoutMarkers = total - withMarkers;
    const totalMarkers = documents.value.reduce((sum, doc) => sum + doc.markers.length, 0);
    const averageMarkers = total > 0 ? totalMarkers / total : 0;

    return {
      total,
      withMarkers,
      withoutMarkers,
      totalMarkers,
      averageMarkers,
    };
  });

  /**
   * Documents with markers
   */
  const documentsWithMarkers = computed<DocumentInfo[]>(() => {
    return documents.value.filter((d) => d.markers.length > 0);
  });

  /**
   * Documents without markers
   */
  const documentsWithoutMarkers = computed<DocumentInfo[]>(() => {
    return documents.value.filter((d) => d.markers.length === 0);
  });

  /**
   * Document count
   */
  const documentCount = computed<number>(() => {
    return documents.value.length;
  });

  /**
   * Is scanning
   */
  const isScanning = computed<boolean>(() => {
    return scanStatus.value === 'scanning';
  });

  /**
   * Has documents
   */
  const hasDocuments = computed<boolean>(() => {
    return documents.value.length > 0;
  });

  /**
   * Has error
   */
  const hasError = computed<boolean>(() => {
    return scanStatus.value === 'error' && scanError.value.length > 0;
  });

  // ============================================================================
  // DOCUMENT OPERATIONS
  // ============================================================================

  /**
   * Load documents from scan result
   * 
   * @param scanResult - The scan result containing detected documents
   */
  function loadFromScanResult(scanResult: ScanResult): void {
    currentFolder.value = scanResult.folder;
    currentPrefix.value = scanResult.prefix;
    scanTimestamp.value = scanResult.timestamp;

    // Convert scan result documents to DocumentInfo format
    const documentList: DocumentInfo[] = scanResult.documents.map((docName) => {
      const docPath = `${scanResult.folder}/${docName}`;
      const markers = scanResult.markers
        .filter((marker) => marker.documents.includes(docName))
        .map((marker) => marker.fullMarker);

      return {
        path: docPath,
        name: docName,
        markers,
      };
    });

    documents.value = documentList;
    scanStatus.value = 'success';
    scanError.value = '';
  }

  /**
   * Get documents from a folder via IPC
   * 
   * @param folderPath - The folder path to scan
   * @param prefix - Optional prefix for marker detection
   * @returns Promise that resolves to true if successful
   */
  async function getDocuments(folderPath: string, prefix?: string): Promise<boolean> {
    if (!folderPath) {
      scanError.value = 'No folder path provided';
      scanStatus.value = 'error';
      return false;
    }

    scanStatus.value = 'scanning';
    scanError.value = '';

    try {
      // Use folder scan API to get documents
      const response = await window.api.folder.scanFolder(folderPath);

      if (response.error) {
        scanError.value = response.error;
        scanStatus.value = 'error';
        return false;
      }

      // Update state with response data
      currentFolder.value = folderPath;
      currentPrefix.value = prefix || '';
      scanTimestamp.value = new Date().toISOString();

      // Convert response documents to DocumentInfo format
      documents.value = response.documents.map((doc) => ({
        path: doc.path,
        name: doc.name,
        markers: doc.markers,
      }));

      scanStatus.value = 'success';
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      scanError.value = errorMessage;
      scanStatus.value = 'error';
      return false;
    }
  }

  /**
   * Filter documents by marker count
   * 
   * @param minMarkers - Minimum number of markers (inclusive)
   * @param maxMarkers - Maximum number of markers (inclusive)
   * @returns Filtered list of documents
   */
  function filterByMarkerCount(minMarkers: number = 0, maxMarkers?: number): DocumentInfo[] {
    return documents.value.filter((doc) => {
      const markerCount = doc.markers.length;
      if (maxMarkers !== undefined) {
        return markerCount >= minMarkers && markerCount <= maxMarkers;
      }
      return markerCount >= minMarkers;
    });
  }

  /**
   * Filter documents by marker presence
   * 
   * @param marker - The marker to filter by
   * @returns Filtered list of documents containing the marker
   */
  function filterByMarker(marker: string): DocumentInfo[] {
    return documents.value.filter((doc) => doc.markers.includes(marker));
  }

  /**
   * Filter documents by name pattern
   * 
   * @param pattern - The pattern to match (supports wildcards)
   * @returns Filtered list of documents matching the pattern
   */
  function filterByName(pattern: string): DocumentInfo[] {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'), 'i');
    return documents.value.filter((doc) => regex.test(doc.name));
  }

  /**
   * Get document by name
   * 
   * @param name - The document name
   * @returns The document or undefined if not found
   */
  function getDocumentByName(name: string): DocumentInfo | undefined {
    return documents.value.find((d) => d.name === name);
  }

  /**
   * Get document by path
   * 
   * @param path - The document path
   * @returns The document or undefined if not found
   */
  function getDocumentByPath(path: string): DocumentInfo | undefined {
    return documents.value.find((d) => d.path === path);
  }

  /**
   * Check if document exists
   * 
   * @param name - The document name
   * @returns True if document exists
   */
  function hasDocument(name: string): boolean {
    return documents.value.some((d) => d.name === name);
  }

  /**
   * Get unique markers across all documents
   * 
   * @returns Array of unique marker strings
   */
  function getUniqueMarkers(): string[] {
    const markerSet = new Set<string>();
    for (const doc of documents.value) {
      for (const marker of doc.markers) {
        markerSet.add(marker);
      }
    }
    return Array.from(markerSet);
  }

  /**
   * Get documents containing a specific marker
   * 
   * @param marker - The marker to search for
   * @returns Array of documents containing the marker
   */
  function getDocumentsWithMarker(marker: string): DocumentInfo[] {
    return documents.value.filter((doc) => doc.markers.includes(marker));
  }

  /**
   * Get marker count for a specific document
   * 
   * @param documentName - The document name
   * @returns Number of markers in the document
   */
  function getMarkerCount(documentName: string): number {
    const doc = getDocumentByName(documentName);
    return doc ? doc.markers.length : 0;
  }

  /**
   * Clear all documents
   */
  function clearDocuments(): void {
    documents.value = [];
    currentFolder.value = '';
    currentPrefix.value = '';
    scanTimestamp.value = '';
    scanStatus.value = 'idle';
    scanError.value = '';
  }

  /**
   * Update document markers
   * 
   * @param documentName - The document name
   * @param markers - New list of markers
   */
  function updateDocumentMarkers(documentName: string, markers: string[]): void {
    const doc = getDocumentByName(documentName);
    if (doc) {
      doc.markers = markers;
    }
  }

  /**
   * Add a document to the list
   * 
   * @param document - The document to add
   */
  function addDocument(document: DocumentInfo): void {
    const existingDoc = getDocumentByName(document.name);
    if (!existingDoc) {
      documents.value.push(document);
    }
  }

  /**
   * Remove a document from the list
   * 
   * @param documentName - The document name to remove
   */
  function removeDocument(documentName: string): void {
    const index = documents.value.findIndex((d) => d.name === documentName);
    if (index !== -1) {
      documents.value.splice(index, 1);
    }
  }

  /**
   * Sort documents by marker count
   * 
   * @param ascending - Sort order (default: descending)
   * @returns Sorted list of documents
   */
  function sortByMarkerCount(ascending: boolean = false): DocumentInfo[] {
    return [...documents.value].sort((a, b) => {
      return ascending 
        ? a.markers.length - b.markers.length
        : b.markers.length - a.markers.length;
    });
  }

  /**
   * Sort documents by name
   * 
   * @param ascending - Sort order (default: ascending)
   * @returns Sorted list of documents
   */
  function sortByName(ascending: boolean = true): DocumentInfo[] {
    return [...documents.value].sort((a, b) => {
      return ascending 
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name);
    });
  }

  // ============================================================================
  // WATCHERS
  // ============================================================================

  // Watch for document changes and update status
  watch(
    () => documents.value.length,
    (newLength, oldLength) => {
      if (oldLength === 0 && newLength > 0) {
        scanStatus.value = 'success';
      } else if (newLength === 0) {
        scanStatus.value = 'idle';
      }
    }
  );

  // ============================================================================
  // CLEANUP
  // ============================================================================

  onUnmounted(() => {
    // Cleanup if needed
  });

  // ============================================================================
  // RETURN
  // ============================================================================

  return {
    // State
    documents,
    currentFolder,
    currentPrefix,
    scanStatus,
    scanError,
    scanTimestamp,

    // Computed
    statistics,
    documentsWithMarkers,
    documentsWithoutMarkers,
    documentCount,
    isScanning,
    hasDocuments,
    hasError,

    // Operations
    loadFromScanResult,
    getDocuments,
    filterByMarkerCount,
    filterByMarker,
    filterByName,
    getDocumentByName,
    getDocumentByPath,
    hasDocument,
    getUniqueMarkers,
    getDocumentsWithMarker,
    getMarkerCount,
    clearDocuments,
    updateDocumentMarkers,
    addDocument,
    removeDocument,
    sortByMarkerCount,
    sortByName,
  };
}