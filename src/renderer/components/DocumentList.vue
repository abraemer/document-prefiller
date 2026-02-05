<template>
  <v-card
    variant="outlined"
    class="document-list"
  >
    <v-card-title class="d-flex align-center py-3">
      <v-icon
        icon="mdi-file-document-multiple"
        class="mr-2"
      />
      Documents
      <v-spacer />
      <v-chip
        size="small"
        :color="documentCountColor"
      >
        {{ documentCountText }}
      </v-chip>
    </v-card-title>
    <v-divider />
    <v-card-text class="pa-0">
      <!-- Loading State -->
      <v-list
        v-if="isLoading"
        class="py-8"
      >
        <v-list-item>
          <v-list-item-title class="text-center">
            <v-progress-circular
              indeterminate
              color="primary"
              size="32"
              class="mb-2"
            />
            <div class="text-body-2 text-grey-darken-1">
              Loading documents...
            </div>
          </v-list-item-title>
        </v-list-item>
      </v-list>

      <!-- Error State -->
      <v-alert
        v-else-if="error"
        type="error"
        variant="tonal"
        class="ma-4"
        density="compact"
        closable
      >
        {{ error }}
      </v-alert>

      <!-- Empty State -->
      <v-list
        v-else-if="documents.length === 0"
        class="py-8"
      >
        <v-list-item>
          <v-list-item-title class="text-center text-grey">
            <v-icon
              icon="mdi-file-document-outline"
              size="48"
              class="mb-2"
            />
            <div class="text-body-1">
              No documents found
            </div>
            <div class="text-body-2 text-grey-darken-1 mt-1">
              Select a folder containing .docx files
            </div>
          </v-list-item-title>
        </v-list-item>
      </v-list>

      <!-- Document List -->
      <v-list
        v-else
        class="py-0 document-list-container"
      >
        <v-list-item
          v-for="document in documents"
          :key="document"
          class="px-4 py-2 document-item"
        >
          <template #prepend>
            <v-icon
              icon="mdi-file-word"
              class="mr-3"
              color="primary"
            />
          </template>
          <v-list-item-title class="text-body-1 document-name">
            {{ document }}
          </v-list-item-title>
        </v-list-item>
      </v-list>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';

// ============================================================================
// PROPS
// ============================================================================

interface Props {
  /** Array of document file names */
  documents?: string[];
  /** Loading state indicator */
  isLoading?: boolean;
  /** Error message to display */
  error?: string;
}

const props = withDefaults(defineProps<Props>(), {
  documents: () => [],
  isLoading: false,
  error: '',
});

// ============================================================================
// COMPUTED
// ============================================================================

/**
 * Get the color for the document count chip
 * Uses success color when documents exist, grey when empty
 */
const documentCountColor = computed(() => {
  return props.documents.length > 0 ? 'success' : 'grey';
});

/**
 * Get the text for the document count chip
 */
const documentCountText = computed(() => {
  return props.documents.length > 0
    ? `${props.documents.length} .docx file${props.documents.length !== 1 ? 's' : ''}`
    : 'No documents';
});
</script>

<style scoped>
.document-list {
  transition: all 0.3s ease;
}

.document-list-container {
  max-height: 300px;
  overflow-y: auto;
}

.document-item {
  transition: background-color 0.2s ease;
}

.document-item:hover {
  background-color: #F5F5F5;
}

.document-name {
  color: #1976D2;
  font-weight: 500;
  word-break: break-all;
}

/* Custom scrollbar styling */
.document-list-container::-webkit-scrollbar {
  width: 8px;
}

.document-list-container::-webkit-scrollbar-track {
  background: #F5F5F5;
  border-radius: 4px;
}

.document-list-container::-webkit-scrollbar-thumb {
  background: #BDBDBD;
  border-radius: 4px;
}

.document-list-container::-webkit-scrollbar-thumb:hover {
  background: #9E9E9E;
}

/* Responsive adjustments */
@media (max-width: 600px) {
  .document-name {
    font-size: 0.875rem;
  }
}
</style>