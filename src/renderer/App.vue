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
                            <template #prepend>
                              <v-icon
                                :color="getMarkerStatusColor(marker.status)"
                                :icon="getMarkerStatusIcon(marker.status)"
                                class="mr-3"
                              />
                            </template>
                            <v-list-item-title class="font-weight-medium">
                              {{ marker.fullMarker }}
                            </v-list-item-title>
                            <template #append>
                              <v-text-field
                                v-model="marker.value"
                                variant="outlined"
                                density="compact"
                                placeholder="Enter value..."
                                single-line
                                hide-details
                                style="max-width: 300px"
                                @update:model-value="handleMarkerValueChange(marker)"
                              />
                            </template>
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
                            :key="doc"
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
                              {{ doc }}
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
import { ref, computed, onMounted } from 'vue';
import type { Marker } from '@/shared/types';
import { DEFAULT_PREFIX, MIN_PREFIX_LENGTH, MAX_PREFIX_LENGTH } from '@/shared/constants';

// ============================================================================
// STATE
// ============================================================================

const currentFolder = ref<string>('');
const markerPrefix = ref<string>(DEFAULT_PREFIX);
const markers = ref<Marker[]>([]);
const documents = ref<string[]>([]);

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

// ============================================================================
// COMPUTED
// ============================================================================

const canReplace = computed(() => {
  return currentFolder.value !== '' && markers.value.length > 0;
});

const prefixRules = [
  (v: string) => !!v || 'Prefix is required',
  (v: string) => v.length >= MIN_PREFIX_LENGTH || `Prefix must be at least ${MIN_PREFIX_LENGTH} character`,
  (v: string) => v.length <= MAX_PREFIX_LENGTH || `Prefix must be at most ${MAX_PREFIX_LENGTH} characters`,
];

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

    // TODO: Implement folder selection via IPC
    // const result = await window.electron.ipcRenderer.invoke('select-folder');
    // if (result.success) {
    //   currentFolder.value = result.folder;
    //   await scanFolder();
    // }

    // Placeholder for now
    console.log('Select folder clicked');
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
    if (newPrefix && currentFolder.value) {
      isLoading.value = true;
      loadingMessage.value = 'Rescanning documents...';
      showProgress.value = false;

      // TODO: Implement rescan with new prefix via IPC
      // await scanFolder();
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

      // TODO: Implement refresh via IPC
      // await scanFolder();
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
  // TODO: Implement auto-save of marker values
  console.log('Marker value changed:', marker.identifier, marker.value);
}

/**
 * Handle replace action
 */
async function handleReplace(): Promise<void> {
  try {
    isLoading.value = true;
    loadingMessage.value = 'Replacing markers...';
    showProgress.value = true;
    progressValue.value = 0;
    progressDetails.value = 'Preparing documents...';

    // TODO: Implement replacement via IPC
    // const result = await window.electron.ipcRenderer.invoke('replace-documents', {
    //   folder: currentFolder.value,
    //   markers: markers.value,
    // });

    // Placeholder for now - simulate progress
    for (let i = 0; i <= 100; i += 10) {
      await new Promise(resolve => setTimeout(resolve, 100));
      progressValue.value = i;
      progressDetails.value = `Processing document ${Math.floor(i / 10) + 1} of 10...`;
    }

    showSuccess.value = true;
    successTitle.value = 'Replacement Complete';
    successMessage.value = `Successfully replaced markers in ${documents.value.length} document${documents.value.length !== 1 ? 's' : ''}.`;
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
 * Scan folder for documents and markers
 */
async function _scanFolder(): Promise<void> {
  // TODO: Implement folder scanning via IPC
  // const result = await window.electron.ipcRenderer.invoke('scan-folder', {
  //   folder: currentFolder.value,
  //   prefix: markerPrefix.value,
  // });
  // if (result.success) {
  //   documents.value = result.documents;
  //   markers.value = result.markers;
  // }
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

onMounted(() => {
  // TODO: Load last folder from settings
  // if (lastFolder) {
  //   currentFolder.value = lastFolder;
  //   scanFolder();
  // }
});
</script>

<style scoped>
.fill-height {
  height: 100%;
}

.flex-grow-1 {
  flex-grow: 1;
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