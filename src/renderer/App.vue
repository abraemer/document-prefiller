<template>
  <v-app>
    <v-main>
      <v-container class="fill-height">
        <v-row
          justify="center"
          class="fill-height"
        >
          <v-col
            cols="12"
            md="10"
            lg="8"
            class="fill-height"
          >
            <v-card class="elevation-2 fill-height d-flex flex-column">
              <!-- Header -->
              <v-card-title class="text-h4 text-center py-4 primary white--text">
                <v-icon
                  icon="mdi-file-document-edit"
                  size="large"
                  class="mr-2"
                />
                Document Prefiller
              </v-card-title>

              <v-card-text class="flex-grow-1 d-flex flex-column">
                <!-- Folder Selection Section -->
                <v-row class="mb-4">
                  <v-col cols="12">
                    <v-card
                      variant="outlined"
                      class="mb-3"
                    >
                      <v-card-text>
                        <v-row align="center">
                          <v-col
                            cols="12"
                            sm="8"
                          >
                            <div class="text-subtitle-2 text-grey-darken-1 mb-1">
                              Folder
                            </div>
                            <div class="text-body-1 text-truncate">
                              {{ currentFolder || 'No folder selected' }}
                            </div>
                          </v-col>
                          <v-col
                            cols="12"
                            sm="4"
                            class="text-sm-right"
                          >
                            <v-btn
                              color="primary"
                              variant="elevated"
                              prepend-icon="mdi-folder-open"
                              block
                              @click="handleSelectFolder"
                            >
                              Change
                            </v-btn>
                          </v-col>
                        </v-row>
                      </v-card-text>
                    </v-card>

                    <!-- Prefix Configuration -->
                    <v-card variant="outlined">
                      <v-card-text>
                        <v-row align="center">
                          <v-col
                            cols="12"
                            sm="8"
                          >
                            <div class="text-subtitle-2 text-grey-darken-1 mb-1">
                              Marker Prefix
                            </div>
                            <v-text-field
                              v-model="markerPrefix"
                              variant="outlined"
                              density="compact"
                              placeholder="e.g., REPLACEME-"
                              :rules="prefixRules"
                              :error-messages="prefixValidationErrors"
                              :error="prefixValidationErrors.length > 0"
                              @update:model-value="handlePrefixChange"
                            />
                          </v-col>
                          <v-col
                            cols="12"
                            sm="4"
                            class="text-sm-right"
                          >
                            <v-btn
                              color="secondary"
                              variant="outlined"
                              prepend-icon="mdi-refresh"
                              block
                              @click="handleRefresh"
                            >
                              Refresh
                            </v-btn>
                          </v-col>
                        </v-row>
                      </v-card-text>
                    </v-card>
                  </v-col>
                </v-row>

                <!-- Detected Markers Section -->
                <v-row class="mb-4 flex-grow-1">
                  <v-col
                    cols="12"
                    class="flex-grow-1"
                  >
                    <v-card
                      variant="outlined"
                      class="fill-height"
                    >
                      <v-card-title class="d-flex align-center py-3">
                        <v-icon
                          icon="mdi-tag-multiple"
                          class="mr-2"
                        />
                        Detected Markers
                        <v-spacer />
                        <v-chip
                          size="small"
                          :color="markers.length > 0 ? 'primary' : 'grey'"
                        >
                          {{ markers.length }}
                        </v-chip>
                      </v-card-title>
                      <v-divider />
                      <v-card-text class="pa-0">
                        <v-list
                          v-if="markers.length > 0"
                          class="py-0"
                        >
                          <v-list-item
                            v-for="marker in markers"
                            :key="marker.identifier"
                            class="px-4 py-2"
                          >
                            <div class="d-flex align-center w-100 ga-3">
                              <v-icon
                                :color="getMarkerStatusColor(marker.status)"
                                :icon="getMarkerStatusIcon(marker.status)"
                                class="flex-shrink-0"
                              />
                              
                              <div class="marker-name flex-shrink-0 font-weight-medium">
                                {{ marker.fullMarker }}
                              </div>
                              
                              <v-text-field
                                :ref="(el) => setMarkerInputRef(el, marker.identifier)"
                                v-model="marker.value"
                                variant="outlined"
                                density="compact"
                                placeholder="Enter value..."
                                single-line
                                hide-details
                                class="flex-grow-1"
                                @update:model-value="handleMarkerValueChange(marker)"
                                @keydown.enter.prevent="handleEnterKey(marker.identifier)"
                                @keydown.tab="handleTabKey($event, marker.identifier)"
                              />
                            </div>
                          </v-list-item>
                        </v-list>
                        <v-list
                          v-else
                          class="py-8"
                        >
                          <v-list-item>
                            <v-list-item-title class="text-center text-grey">
                              No markers detected. Select a folder with .docx files.
                            </v-list-item-title>
                          </v-list-item>
                        </v-list>
                      </v-card-text>
                    </v-card>
                  </v-col>
                </v-row>

                <!-- Documents Section -->
                <v-row class="mb-4">
                  <v-col cols="12">
                    <v-card variant="outlined">
                      <v-card-title class="d-flex align-center py-3">
                        <v-icon
                          icon="mdi-file-document-multiple"
                          class="mr-2"
                        />
                        Documents
                        <v-spacer />
                        <v-chip
                          size="small"
                          :color="documents.length > 0 ? 'success' : 'grey'"
                        >
                          {{ documents.length }} .docx files
                        </v-chip>
                      </v-card-title>
                      <v-divider />
                      <v-card-text class="pa-0">
                        <v-list
                          v-if="documents.length > 0"
                          class="py-0"
                        >
                          <v-list-item
                            v-for="doc in documents"
                            :key="doc.name"
                            class="px-4 py-2"
                          >
                            <template #prepend>
                              <v-icon
                                icon="mdi-file-word"
                                class="mr-3"
                                color="primary"
                              />
                            </template>
                            <v-list-item-title class="text-body-1">
                              {{ doc.name }}
                            </v-list-item-title>
                          </v-list-item>
                        </v-list>
                        <v-list
                          v-else
                          class="py-8"
                        >
                          <v-list-item>
                            <v-list-item-title class="text-center text-grey">
                              No documents found. Select a folder with .docx files.
                            </v-list-item-title>
                          </v-list-item>
                        </v-list>
                      </v-card-text>
                    </v-card>
                  </v-col>
                </v-row>

                <!-- Action Buttons -->
                <v-row>
                  <v-col cols="12">
                    <v-btn
                      color="success"
                      variant="elevated"
                      size="large"
                      prepend-icon="mdi-file-replace"
                      block
                      :disabled="!canReplace"
                      @click="handleReplace"
                    >
                      Replace...
                    </v-btn>
                  </v-col>
                </v-row>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </v-container>
    </v-main>

    <!-- Loading Overlay -->
    <v-overlay
      v-model="isLoading"
      class="align-center justify-center"
      persistent
    >
      <v-card
        class="pa-6 text-center"
        min-width="400"
      >
        <v-progress-circular
          :indeterminate="!showProgress"
          :model-value="progressValue"
          :size="64"
          color="primary"
          class="mb-4"
        />
        <div class="text-h6 mb-2">
          {{ loadingMessage }}
        </div>
        <div
          v-if="showProgress"
          class="text-body-2 text-grey-darken-1"
        >
          {{ progressDetails }}
        </div>
        <div
          v-if="showProgress"
          class="text-h5 mt-2 primary--text"
        >
          {{ progressValue }}%
        </div>
      </v-card>
    </v-overlay>

    <!-- Error Snackbar -->
    <v-snackbar
      v-model="showError"
      color="error"
      :timeout="8000"
      location="bottom"
    >
      <div class="d-flex align-center">
        <v-icon
          icon="mdi-alert-circle"
          class="mr-2"
        />
        <div>
          <div class="font-weight-medium">
            {{ errorTitle }}
          </div>
          <div class="text-caption">
            {{ errorMessage }}
          </div>
        </div>
      </div>
      <template #actions>
        <v-btn
          color="white"
          variant="text"
          @click="showError = false"
        >
          Close
        </v-btn>
      </template>
    </v-snackbar>

    <!-- Success Snackbar -->
    <v-snackbar
      v-model="showSuccess"
      color="success"
      :timeout="4000"
      location="bottom"
    >
      <div class="d-flex align-center">
        <v-icon
          icon="mdi-check-circle"
          class="mr-2"
        />
        <div>
          <div class="font-weight-medium">
            {{ successTitle }}
          </div>
          <div class="text-caption">
            {{ successMessage }}
          </div>
        </div>
      </div>
      <template #actions>
        <v-btn
          color="white"
          variant="text"
          @click="showSuccess = false"
        >
          Close
        </v-btn>
      </template>
    </v-snackbar>

    <!-- Warning Snackbar -->
    <v-snackbar
      v-model="showWarning"
      color="warning"
      :timeout="6000"
      location="bottom"
    >
      <div class="d-flex align-center">
        <v-icon
          icon="mdi-alert"
          class="mr-2"
        />
        <div>
          <div class="font-weight-medium">
            {{ warningTitle }}
          </div>
          <div class="text-caption">
            {{ warningMessage }}
          </div>
        </div>
      </div>
      <template #actions>
        <v-btn
          color="white"
          variant="text"
          @click="showWarning = false"
        >
          Close
        </v-btn>
      </template>
    </v-snackbar>
  </v-app>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import type { Marker } from '@/shared/types';
import { DEFAULT_PREFIX } from '@/shared/constants';
import { useValidation } from './composables/useValidation';
import { useMarkers } from './composables/useMarkers';
import { useDocuments } from './composables/useDocuments';
import { useSettings } from './composables/useSettings';

// ============================================================================
// COMPOSABLES
// ============================================================================

const { 
  validatePrefix, 
  isFormValid, 
  getPrefixRules,
} = useValidation();

const {
  markers,
  initializeWithSavedState,
  updateMarkerValue,
  saveMarkers,
} = useMarkers();

const {
  documents,
  loadFromScanResult: loadDocumentsFromScanResult,
} = useDocuments();

const {
  settings,
  loadSettings,
  updateLastFolder,
} = useSettings();

// ============================================================================
// STATE
// ============================================================================

const currentFolder = ref<string>('');
const markerPrefix = ref<string>(DEFAULT_PREFIX);

// Loading state
const isLoading = ref<boolean>(false);
const loadingMessage = ref<string>('Loading...');
const showProgress = ref<boolean>(false);
const progressValue = ref<number>(0);
const progressDetails = ref<string>('');

// Error state
const showError = ref<boolean>(false);
const errorMessage = ref<string>('');
const errorTitle = ref<string>('Error');

// Success state
const showSuccess = ref<boolean>(false);
const successMessage = ref<string>('');
const successTitle = ref<string>('Success');

// Warning state
const showWarning = ref<boolean>(false);
const warningMessage = ref<string>('');
const warningTitle = ref<string>('Warning');

// Validation state
const prefixValidationErrors = ref<string[]>([]);

// Keyboard navigation state
const markerInputRefs = ref<Map<string, HTMLInputElement>>(new Map());

// ============================================================================
// COMPUTED
// ============================================================================

const canReplace = computed(() => {
  // Only allow replacement if:
  // 1. A folder is selected
  // 2. There are markers
  // 3. The form is valid (prefix is valid)
  return currentFolder.value !== '' && 
         markers.value.length > 0 && 
         isFormValid.value;
});

const prefixRules = computed(() => {
  return getPrefixRules();
});

// ============================================================================
// METHODS
// ============================================================================

/**
 * Handle folder selection
 */
async function handleSelectFolder(): Promise<void> {
  try {
    isLoading.value = true;
    loadingMessage.value = 'Selecting folder...';
    showProgress.value = false;

    // Use IPC to select folder
    const result = await window.api.folder.selectFolder();
    
    if (result.folderPath) {
      currentFolder.value = result.folderPath;
      markerPrefix.value = DEFAULT_PREFIX;
      
      // Update settings with last folder
      updateLastFolder(result.folderPath);
      
      // Scan the folder for documents and markers
      await scanFolder();
    }
  } catch (error) {
    showError.value = true;
    errorTitle.value = 'Folder Selection Failed';
    errorMessage.value = error instanceof Error ? error.message : 'Failed to select folder. Please try again.';
  } finally {
    isLoading.value = false;
  }
}

/**
 * Handle prefix change
 */
async function handlePrefixChange(newPrefix: string): Promise<void> {
  try {
    // Validate the prefix
    const result = validatePrefix(newPrefix);
    prefixValidationErrors.value = result.errors;

    if (newPrefix && currentFolder.value) {
      markerPrefix.value = newPrefix;
      isLoading.value = true;
      loadingMessage.value = 'Rescanning documents...';
      showProgress.value = false;

      // Rescan with new prefix
      await scanFolder();
    }
  } catch (error) {
    showError.value = true;
    errorTitle.value = 'Prefix Update Failed';
    errorMessage.value = error instanceof Error ? error.message : 'Failed to update prefix. Please try again.';
  } finally {
    isLoading.value = false;
  }
}

/**
 * Handle refresh
 */
async function handleRefresh(): Promise<void> {
  try {
    if (currentFolder.value) {
      isLoading.value = true;
      loadingMessage.value = 'Scanning documents...';
      showProgress.value = false;

      // Rescan folder
      await scanFolder();
    }
  } catch (error) {
    showError.value = true;
    errorTitle.value = 'Refresh Failed';
    errorMessage.value = error instanceof Error ? error.message : 'Failed to refresh. Please try again.';
  } finally {
    isLoading.value = false;
  }
}

/**
 * Handle marker value change
 */
function handleMarkerValueChange(marker: Marker): void {
  // Update marker value in composable
  updateMarkerValue(marker.identifier, marker.value);
}

/**
 * Handle replace action
 */
async function handleReplace(): Promise<void> {
  try {
    // Validate form before proceeding
    const prefixResult = validatePrefix(markerPrefix.value);
    prefixValidationErrors.value = prefixResult.errors;

    if (!prefixResult.isValid) {
      showError.value = true;
      errorTitle.value = 'Validation Error';
      errorMessage.value = 'Please fix the validation errors before replacing markers.';
      return;
    }

    isLoading.value = true;
    loadingMessage.value = 'Replacing markers...';
    showProgress.value = true;
    progressValue.value = 0;
    progressDetails.value = 'Preparing documents...';

    // Convert markers to DocumentMarker format for IPC
    const documentMarkers = markers.value
      .filter(m => m.status !== 'removed')
      .map(m => ({
        id: m.identifier,
        name: m.value,
        prefix: markerPrefix.value,
        enabled: true,
      }));

    // Use IPC to replace documents
    const result = await window.api.document.replaceDocuments(
      currentFolder.value,
      documentMarkers
    );

    if (result.success) {
      showSuccess.value = true;
      successTitle.value = 'Replacement Complete';
      successMessage.value = `Successfully replaced markers in ${result.processed} document${result.processed !== 1 ? 's' : ''}.`;
    } else {
      showError.value = true;
      errorTitle.value = 'Replacement Failed';
      errorMessage.value = result.error || 'Failed to replace markers. Please check the documents and try again.';
    }
  } catch (error) {
    showError.value = true;
    errorTitle.value = 'Replacement Failed';
    errorMessage.value = error instanceof Error ? error.message : 'Failed to replace markers. Please check the documents and try again.';
  } finally {
    isLoading.value = false;
    showProgress.value = false;
  }
}

/**
 * Get marker status color
 */
function getMarkerStatusColor(status: string): string {
  switch (status) {
    case 'new':
      return 'warning';
    case 'removed':
      return 'grey';
    case 'active':
    default:
      return 'primary';
  }
}

/**
 * Get marker status icon
 */
function getMarkerStatusIcon(status: string): string {
  switch (status) {
    case 'new':
      return 'mdi-star';
    case 'removed':
      return 'mdi-delete';
    case 'active':
    default:
      return 'mdi-tag';
  }
}

/**
 * Set marker input ref
 */
function setMarkerInputRef(el: unknown, identifier: string): void {
  if (el && typeof el === 'object' && 'focus' in el) {
    markerInputRefs.value.set(identifier, el as HTMLInputElement);
  }
}

/**
 * Handle Enter key press on marker input
 * Moves focus to the next marker input
 */
function handleEnterKey(currentIdentifier: string): void {
  const markerIndex = markers.value.findIndex(m => m.identifier === currentIdentifier);
  if (markerIndex !== -1 && markerIndex < markers.value.length - 1) {
    const nextMarker = markers.value[markerIndex + 1];
    const nextInput = markerInputRefs.value.get(nextMarker.identifier);
    if (nextInput) {
      nextTick(() => {
        nextInput.focus();
      });
    }
  }
}

/**
 * Handle Tab key press on marker input
 * Allows default Tab behavior but manages focus
 */
function handleTabKey(_event: KeyboardEvent, _currentIdentifier: string): void {
  // Let the default Tab behavior work
  // Shift+Tab is handled automatically by the browser
  // The parameters are kept for future enhancements
}

/**
 * Handle global keyboard shortcuts
 */
function handleGlobalKeydown(event: KeyboardEvent): void {
  // Ctrl/Cmd+S - Save markers
  if ((event.ctrlKey || event.metaKey) && event.key === 's') {
    event.preventDefault();
    saveMarkers();
  }
  
  // Ctrl/Cmd+O - Open folder
  if ((event.ctrlKey || event.metaKey) && event.key === 'o') {
    event.preventDefault();
    handleSelectFolder();
  }
  
  // Ctrl/Cmd+R - Replace
  if ((event.ctrlKey || event.metaKey) && event.key === 'r') {
    event.preventDefault();
    if (canReplace.value) {
      handleReplace();
    }
  }
  
  // Escape - Close overlays/dialogs
  if (event.key === 'Escape') {
    if (isLoading.value) {
      // Don't allow closing loading overlay
      return;
    }
    if (showError.value) {
      showError.value = false;
    }
    if (showSuccess.value) {
      showSuccess.value = false;
    }
    if (showWarning.value) {
      showWarning.value = false;
    }
  }
}

/**
 * Focus first marker input
 */
async function focusFirstMarkerInput(): Promise<void> {
  await nextTick();
  if (markers.value.length > 0) {
    const firstMarker = markers.value[0];
    const firstInput = markerInputRefs.value.get(firstMarker.identifier);
    if (firstInput) {
      firstInput.focus();
    }
  }
}

/**
 * Scan folder for documents and markers
 */
async function scanFolder(): Promise<void> {
  if (!currentFolder.value) {
    showError.value = true;
    errorTitle.value = 'No Folder Selected';
    errorMessage.value = 'Please select a folder first.';
    return;
  }

  try {
    isLoading.value = true;
    loadingMessage.value = 'Scanning documents...';
    showProgress.value = false;

    // Use IPC to scan folder
    const result = await window.api.folder.scanFolder(currentFolder.value);
    
    if (result.error) {
      showError.value = true;
      errorTitle.value = 'Scan Failed';
      errorMessage.value = result.error;
      return;
    }

    // Build scan result from IPC response
    const scanResult = {
      folder: currentFolder.value,
      documents: result.documents.map(doc => doc.name),
      markers: [] as Marker[],
      prefix: markerPrefix.value,
      timestamp: new Date().toISOString(),
    };

    // Extract markers from documents
    const markerMap = new Map<string, Marker>();
    for (const doc of result.documents) {
      for (const markerText of doc.markers) {
        // Extract identifier from full marker (remove prefix)
        const identifier = markerText.startsWith(markerPrefix.value) 
          ? markerText.substring(markerPrefix.value.length) 
          : markerText;
        
        if (!markerMap.has(identifier)) {
          markerMap.set(identifier, {
            identifier,
            fullMarker: markerText,
            value: '',
            status: 'new' as const,
            documents: [],
          });
        }
        const marker = markerMap.get(identifier);
        if (marker) {
          marker.documents.push(doc.name);
        }
      }
    }
    
    scanResult.markers = Array.from(markerMap.values());

    // Initialize markers with saved state
    await initializeWithSavedState(scanResult);
    
    // Load documents
    loadDocumentsFromScanResult(scanResult);

    showSuccess.value = true;
    successTitle.value = 'Scan Complete';
    successMessage.value = `Found ${result.documents.length} document${result.documents.length !== 1 ? 's' : ''} with ${scanResult.markers.length} marker${scanResult.markers.length !== 1 ? 's' : ''}.`;
    
    // Focus first marker input after scan
    await focusFirstMarkerInput();
  } catch (error) {
    showError.value = true;
    errorTitle.value = 'Scan Failed';
    errorMessage.value = error instanceof Error ? error.message : 'Failed to scan folder. Please try again.';
  } finally {
    isLoading.value = false;
  }
}

/**
 * Show error notification
 */
function _showErrorNotification(title: string, message: string): void {
  errorTitle.value = title;
  errorMessage.value = message;
  showError.value = true;
}

/**
 * Show success notification
 */
function _showSuccessNotification(title: string, message: string): void {
  successTitle.value = title;
  successMessage.value = message;
  showSuccess.value = true;
}

/**
 * Show warning notification
 */
function _showWarningNotification(title: string, message: string): void {
  warningTitle.value = title;
  warningMessage.value = message;
  showWarning.value = true;
}

/**
 * Update loading state with progress
 */
function _updateLoadingProgress(message: string, progress?: number, details?: string): void {
  loadingMessage.value = message;
  if (progress !== undefined) {
    showProgress.value = true;
    progressValue.value = progress;
  }
  if (details) {
    progressDetails.value = details;
  }
}

/**
 * Clear all notifications
 */
function _clearNotifications(): void {
  showError.value = false;
  showSuccess.value = false;
  showWarning.value = false;
}

// ============================================================================
// LIFECYCLE
// ============================================================================

onMounted(async () => {
  // Validate initial prefix
  const result = validatePrefix(markerPrefix.value);
  prefixValidationErrors.value = result.errors;

  // Load settings from main process
  await loadSettings();

  // Load last folder from settings if available
  const lastFolder = settings.value.lastFolder;
  if (lastFolder) {
    currentFolder.value = lastFolder;
    markerPrefix.value = settings.value.preferences.defaultPrefix || DEFAULT_PREFIX;
    
    // Auto-scan the last folder
    await scanFolder();
    
    // Focus first marker input after scan
    await focusFirstMarkerInput();
  }
  
  // Add global keyboard event listener
  window.addEventListener('keydown', handleGlobalKeydown);
});

onUnmounted(() => {
  // Remove global keyboard event listener
  window.removeEventListener('keydown', handleGlobalKeydown);
});
</script>

<style scoped>
.fill-height {
  height: 100%;
}

.flex-grow-1 {
  flex-grow: 1;
}

/* Marker name should not take too much space */
.marker-name {
  min-width: 150px;
  max-width: 250px;
}

/* Custom scrollbar for lists */
:deep(.v-list) {
  max-height: 300px;
  overflow-y: auto;
}

/* Ensure card fills available height */
.v-card.fill-height {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.v-card-text.flex-grow-1 {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
}
</style>