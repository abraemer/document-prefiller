<template>
  <v-card
    v-if="!noCard"
    class="marker-list"
    elevation="2"
  >
    <v-card-title class="d-flex align-center pa-4">
      <v-icon
        icon="mdi-format-list-bulleted"
        class="mr-2"
      />
      <span class="text-h6">Detected Markers</span>
      <v-spacer />
      <v-chip
        v-if="saving"
        color="info"
        size="small"
        class="ml-2"
      >
        <v-progress-circular
          indeterminate
          size="12"
          width="2"
          class="mr-1"
        />
        Saving...
      </v-chip>
      <v-chip
        v-if="!loading"
        :color="markerCountColor"
        size="small"
        class="ml-2"
      >
        {{ markerCount }}
      </v-chip>
    </v-card-title>

    <v-divider />

    <v-card-text class="pa-0">
      <!-- Loading State -->
      <div
        v-if="loading"
        class="d-flex justify-center align-center pa-8"
      >
        <v-progress-circular
          indeterminate
          color="primary"
          size="48"
        />
      </div>

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
      <div
        v-else-if="markers.length === 0"
        class="empty-state pa-8 text-center"
      >
        <v-icon
          icon="mdi-file-document-outline"
          size="64"
          color="grey-lighten-1"
          class="mb-4"
        />
        <p class="text-body-1 text-grey-darken-1 mb-2">
          No markers detected
        </p>
        <p class="text-body-2 text-grey-darken-2">
          Select a folder containing .docx files to scan for markers
        </p>
      </div>

      <!-- Marker List -->
      <v-list
        v-else
        class="marker-list-content"
      >
        <MarkerItem
          v-for="marker in markers"
          :key="marker.identifier"
          :ref="(el) => setMarkerItemRef(el, marker.identifier)"
          :marker="marker"
          @value-change="handleValueChange"
          @enter-pressed="handleEnterKey"
        />
      </v-list>
    </v-card-text>

    <!-- Status Legend -->
    <v-divider v-if="markers.length > 0 && !noCard" />
    <v-card-actions
      v-if="markers.length > 0 && !noCard"
      class="pa-3"
    >
      <div class="d-flex align-center gap-4 text-caption">
        <div class="d-flex align-center">
          <v-icon
            icon="mdi-check"
            color="primary"
            size="20"
            class="mr-1"
          />
          <span>Active</span>
        </div>
        <div class="d-flex align-center">
          <v-icon
            icon="mdi-star"
            color="warning"
            size="20"
            class="mr-1"
          />
          <span>New</span>
        </div>
        <div class="d-flex align-center">
          <v-icon
            icon="mdi-minus"
            color="grey"
            size="20"
            class="mr-1"
          />
          <span>Removed</span>
        </div>
      </div>
    </v-card-actions>
  </v-card>
  <template v-else>
    <!-- No card wrapper mode - just the content -->
    <div class="marker-list-content-wrapper">
      <!-- Loading State -->
      <div
        v-if="loading"
        class="d-flex justify-center align-center pa-8"
      >
        <v-progress-circular
          indeterminate
          color="primary"
          size="48"
        />
      </div>

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
      <div
        v-else-if="markers.length === 0"
        class="empty-state pa-8 text-center"
      >
        <v-icon
          icon="mdi-file-document-outline"
          size="64"
          color="grey-lighten-1"
          class="mb-4"
        />
        <p class="text-body-1 text-grey-darken-1 mb-2">
          No markers detected
        </p>
        <p class="text-body-2 text-grey-darken-2">
          Select a folder containing .docx files to scan for markers
        </p>
      </div>

      <!-- Marker List -->
      <v-list
        v-else
        class="marker-list-content"
      >
        <MarkerItem
          v-for="marker in markers"
          :key="marker.identifier"
          :ref="(el) => setMarkerItemRef(el, marker.identifier)"
          :marker="marker"
          @value-change="handleValueChange"
          @enter-pressed="handleEnterKey"
        />
      </v-list>
    </div>
  </template>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Marker } from '../../shared/types';
import MarkerItem from './MarkerItem.vue';

/**
 * MarkerList Component
 *
 * Displays a list of detected markers with their status indicators
 * and allows users to enter replacement values.
 *
 * @example
 * ```vue
 * <MarkerList
 *   :markers="markers"
 *   :loading="false"
 *   @value-change="handleValueChange"
 * />
 * ```
 */

interface Props {
  /** Array of markers to display */
  markers: Marker[];
  /** Whether the component is in a loading state */
  loading?: boolean;
  /** Error message to display */
  error?: string;
  /** Whether the component is in a saving state */
  saving?: boolean;
  /** Whether to omit the card wrapper (for embedding in other cards) */
  noCard?: boolean;
}

interface Emits {
  /** Emitted when a marker value changes */
  (e: 'value-change', identifier: string, value: string): void;
  /** Emitted when Enter key is pressed in a marker input */
  (e: 'enter-pressed', identifier: string): void;
  /** Emitted when a marker value is saved */
  (e: 'value-saved', identifier: string): void;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  error: '',
  saving: false,
  noCard: false,
});

const emit = defineEmits<Emits>();

// ============================================================================
// STATE
// ============================================================================

/** Map of marker item refs for keyboard navigation */
const markerItemRefs = ref<Map<string, InstanceType<typeof MarkerItem>>>(new Map());

// ============================================================================
// COMPUTED
// ============================================================================

/**
 * Total number of markers
 */
const markerCount = computed(() => props.markers.length);

/**
 * Color for the marker count chip based on count
 */
const markerCountColor = computed(() => {
  if (markerCount.value === 0) return 'grey';
  if (markerCount.value > 10) return 'error';
  if (markerCount.value > 5) return 'warning';
  return 'success';
});

// ============================================================================
// METHODS
// ============================================================================

/**
 * Set marker item ref for keyboard navigation
 */
function setMarkerItemRef(el: unknown, identifier: string): void {
  if (el && typeof el === 'object' && 'focus' in el) {
    markerItemRefs.value.set(identifier, el as InstanceType<typeof MarkerItem>);
  }
}

/**
 * Handle marker value change
 */
function handleValueChange(identifier: string, value: string): void {
  emit('value-change', identifier, value);
}

/**
 * Handle Enter key press in marker input
 * Moves focus to the next marker input
 */
function handleEnterKey(identifier: string): void {
  const markerIndex = props.markers.findIndex(m => m.identifier === identifier);
  if (markerIndex !== -1 && markerIndex < props.markers.length - 1) {
    const nextMarker = props.markers[markerIndex + 1];
    const nextItem = markerItemRefs.value.get(nextMarker.identifier);
    if (nextItem) {
      nextItem.focus();
    }
  }
  emit('enter-pressed', identifier);
}

/**
 * Focus first marker input
 */
function focusFirstMarkerInput(): void {
  if (props.markers.length > 0) {
    const firstMarker = props.markers[0];
    const firstItem = markerItemRefs.value.get(firstMarker.identifier);
    if (firstItem) {
      firstItem.focus();
    }
  }
}

/**
 * Expose methods for parent components
 */
defineExpose({
  focusFirstMarkerInput,
});
</script>

<style scoped>
.marker-list {
  background-color: #ffffff;
}

.marker-list-content {
  max-height: 500px;
  overflow-y: auto;
}

.marker-item {
  transition: background-color 0.2s ease;
}

.marker-item:hover {
  background-color: #f5f5f5;
}

.marker-item--removed {
  opacity: 0.6;
}

.marker-item--removed .v-text-field {
  opacity: 0.7;
}

.empty-state {
  min-height: 200px;
}

.gap-4 {
  gap: 1rem;
}

/* Marker name should not take too much space */
.marker-name {
  min-width: 200px;
  max-width: 300px;
}

/* Custom scrollbar for marker list */
.marker-list-content::-webkit-scrollbar {
  width: 8px;
}

.marker-list-content::-webkit-scrollbar-track {
  background: #f1f1f1;
}

.marker-list-content::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 4px;
}

.marker-list-content::-webkit-scrollbar-thumb:hover {
  background: #555;
}
</style>