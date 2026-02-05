<template>
  <v-card
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
        <v-list-item
          v-for="marker in markers"
          :key="marker.identifier"
          class="marker-item"
          :class="`marker-item--${marker.status}`"
        >
          <template #prepend>
            <v-avatar
              :color="getStatusColor(marker.status)"
              size="40"
              class="mr-3"
            >
              <v-icon :icon="getStatusIcon(marker.status)" />
            </v-avatar>
          </template>

          <v-list-item-title class="d-flex align-center">
            <span class="font-weight-medium">{{ marker.fullMarker }}</span>
            <v-chip
              v-if="marker.status === 'new'"
              color="warning"
              size="x-small"
              class="ml-2"
            >
              New
            </v-chip>
            <v-chip
              v-if="marker.status === 'removed'"
              color="grey"
              size="x-small"
              class="ml-2"
            >
              Removed
            </v-chip>
          </v-list-item-title>

          <v-list-item-subtitle class="mt-1">
            <v-text-field
              :model-value="marker.value"
              :label="`Value for ${marker.identifier}`"
              :placeholder="`Enter replacement value for ${marker.identifier}`"
              variant="outlined"
              density="compact"
              hide-details
              :disabled="marker.status === 'removed'"
              @update:model-value="handleValueChange(marker.identifier, $event)"
              @keydown.enter="handleEnterKey(marker.identifier)"
            />
          </v-list-item-subtitle>

          <template #append>
            <div class="text-caption text-grey-darken-1 text-right">
              <div>{{ marker.documents.length }} document{{ marker.documents.length !== 1 ? 's' : '' }}</div>
              <v-tooltip location="top">
                <template #activator="slotProps">
                  <v-icon
                    v-bind="slotProps.props"
                    icon="mdi-information-outline"
                    size="16"
                    class="mt-1"
                  />
                </template>
                <div class="text-caption">
                  {{ marker.documents.join(', ') }}
                </div>
              </v-tooltip>
            </div>
          </template>
        </v-list-item>
      </v-list>
    </v-card-text>

    <!-- Status Legend -->
    <v-divider v-if="markers.length > 0" />
    <v-card-actions
      v-if="markers.length > 0"
      class="pa-3"
    >
      <div class="d-flex align-center gap-4 text-caption">
        <div class="d-flex align-center">
          <v-avatar
            color="primary"
            size="20"
            class="mr-1"
          >
            <v-icon
              icon="mdi-check"
              size="12"
            />
          </v-avatar>
          <span>Active</span>
        </div>
        <div class="d-flex align-center">
          <v-avatar
            color="warning"
            size="20"
            class="mr-1"
          >
            <v-icon
              icon="mdi-star"
              size="12"
            />
          </v-avatar>
          <span>New</span>
        </div>
        <div class="d-flex align-center">
          <v-avatar
            color="grey"
            size="20"
            class="mr-1"
          >
            <v-icon
              icon="mdi-minus"
              size="12"
            />
          </v-avatar>
          <span>Removed</span>
        </div>
      </div>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Marker } from '../../shared/types';

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
}

interface Emits {
  /** Emitted when a marker value changes */
  (e: 'value-change', identifier: string, value: string): void;
  /** Emitted when Enter key is pressed in a marker input */
  (e: 'enter-pressed', identifier: string): void;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
});

const emit = defineEmits<Emits>();

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

/**
 * Get the color for a marker status
 */
function getStatusColor(status: Marker['status']): string {
  switch (status) {
    case 'active':
      return 'primary';
    case 'new':
      return 'warning';
    case 'removed':
      return 'grey';
    default:
      return 'grey';
  }
}

/**
 * Get the icon for a marker status
 */
function getStatusIcon(status: Marker['status']): string {
  switch (status) {
    case 'active':
      return 'mdi-check';
    case 'new':
      return 'mdi-star';
    case 'removed':
      return 'mdi-minus';
    default:
      return 'mdi-help';
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
 */
function handleEnterKey(identifier: string): void {
  emit('enter-pressed', identifier);
}
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