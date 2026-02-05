<template>
  <v-card
    variant="outlined"
    class="folder-selector"
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
          <div class="text-body-1 text-truncate folder-path">
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
            :loading="isLoading"
            :disabled="isLoading"
            @click="handleSelectFolder"
          >
            Change
          </v-btn>
        </v-col>
      </v-row>

      <!-- Error Message -->
      <v-alert
        v-if="errorMessage"
        type="error"
        variant="tonal"
        class="mt-3"
        density="compact"
        closable
        @click:close="errorMessage = ''"
      >
        {{ errorMessage }}
      </v-alert>

      <!-- Validation Warning -->
      <v-alert
        v-if="validationWarning"
        type="warning"
        variant="tonal"
        class="mt-3"
        density="compact"
        closable
        @click:close="validationWarning = ''"
      >
        {{ validationWarning }}
      </v-alert>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

// ============================================================================
// PROPS
// ============================================================================

interface Props {
  /** Current selected folder path */
  modelValue?: string;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
});

// ============================================================================
// EMITS
// ============================================================================

interface Emits {
  (e: 'update:modelValue', value: string): void;
  (e: 'folder-selected', folderPath: string): void;
  (e: 'error', error: string): void;
}

const emit = defineEmits<Emits>();

// ============================================================================
// STATE
// ============================================================================

const isLoading = ref<boolean>(false);
const errorMessage = ref<string>('');
const validationWarning = ref<string>('');

// ============================================================================
// COMPUTED
// ============================================================================

const currentFolder = computed(() => props.modelValue);

// ============================================================================
// METHODS
// ============================================================================

/**
 * Handle folder selection
 * Opens the folder selection dialog and processes the result
 */
async function handleSelectFolder(): Promise<void> {
  try {
    isLoading.value = true;
    errorMessage.value = '';
    validationWarning.value = '';

    // Check if window.api is available (Electron environment)
    if (!window.api?.folder?.selectFolder) {
      throw new Error('Folder selection API not available. Please ensure you are running in Electron.');
    }

    // Open folder selection dialog via IPC
    const result = await window.api.folder.selectFolder();

    // Check if user cancelled the dialog
    if (!result.folderPath) {
      return;
    }

    // Check for errors from the main process
    if (result.error) {
      throw new Error(result.error);
    }

    // Validate that the folder contains .docx files
    await validateFolder(result.folderPath);

    // Update the folder path
    emit('update:modelValue', result.folderPath);
    emit('folder-selected', result.folderPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to select folder';
    errorMessage.value = message;
    emit('error', message);
  } finally {
    isLoading.value = false;
  }
}

/**
 * Validate that the folder contains .docx files
 * @param folderPath - Path to the folder to validate
 */
async function validateFolder(folderPath: string): Promise<void> {
  try {
    // Check if window.api is available
    if (!window.api?.folder?.scanFolder) {
      throw new Error('Folder scan API not available. Please ensure you are running in Electron.');
    }

    // Scan the folder to check for .docx files
    const result = await window.api.folder.scanFolder(folderPath);

    // Check for scan errors
    if (result.error) {
      throw new Error(result.error);
    }

    // Check if any documents were found
    if (result.documents.length === 0) {
      validationWarning.value = 'No .docx files found in the selected folder. Please select a folder containing Word documents.';
    }
  } catch (error) {
    // If validation fails, we still allow the folder selection
    // but show a warning to the user
    const message = error instanceof Error ? error.message : 'Failed to validate folder';
    console.warn('Folder validation warning:', message);
    validationWarning.value = `Could not validate folder contents: ${message}`;
  }
}

/**
 * Clear all error and warning messages
 */
function clearMessages(): void {
  errorMessage.value = '';
  validationWarning.value = '';
}

// ============================================================================
// EXPOSE
// ============================================================================

defineExpose({
  clearMessages,
});
</script>

<style scoped>
.folder-selector {
  transition: all 0.3s ease;
}

.folder-path {
  color: #1976D2;
  font-weight: 500;
  word-break: break-all;
}

/* Ensure proper text truncation */
.text-truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Responsive adjustments */
@media (max-width: 600px) {
  .folder-path {
    font-size: 0.875rem;
  }
}
</style>