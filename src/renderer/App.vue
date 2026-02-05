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
      <v-card class="pa-6 text-center">
        <v-progress-circular
          indeterminate
          size="64"
          color="primary"
          class="mb-4"
        />
        <div class="text-h6">
          {{ loadingMessage }}
        </div>
      </v-card>
    </v-overlay>

    <!-- Error Snackbar -->
    <v-snackbar
      v-model="showError"
      color="error"
      :timeout="5000"
    >
      {{ errorMessage }}
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
      :timeout="3000"
    >
      {{ successMessage }}
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

// Error state
const showError = ref<boolean>(false);
const errorMessage = ref<string>('');

// Success state
const showSuccess = ref<boolean>(false);
const successMessage = ref<string>('');

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
    errorMessage.value = error instanceof Error ? error.message : 'Failed to select folder';
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

      // TODO: Implement rescan with new prefix via IPC
      // await scanFolder();
    }
  } catch (error) {
    showError.value = true;
    errorMessage.value = error instanceof Error ? error.message : 'Failed to update prefix';
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

      // TODO: Implement refresh via IPC
      // await scanFolder();
    }
  } catch (error) {
    showError.value = true;
    errorMessage.value = error instanceof Error ? error.message : 'Failed to refresh';
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

    // TODO: Implement replacement via IPC
    // const result = await window.electron.ipcRenderer.invoke('replace-documents', {
    //   folder: currentFolder.value,
    //   markers: markers.value,
    // });

    // Placeholder for now
    console.log('Replace clicked');
    
    showSuccess.value = true;
    successMessage.value = 'Replacement completed successfully!';
  } catch (error) {
    showError.value = true;
    errorMessage.value = error instanceof Error ? error.message : 'Failed to replace markers';
  } finally {
    isLoading.value = false;
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