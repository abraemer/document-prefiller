<template>
  <v-list-item
    class="marker-item"
    :class="`marker-item--${marker.status}`"
  >
    <template #prepend>
      <v-avatar
        :color="statusColor"
        size="40"
        class="mr-3"
      >
        <v-icon :icon="statusIcon" />
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
        :error-messages="showErrorMessages ? errorMessages : []"
        :error="showErrorMessages"
        variant="outlined"
        density="compact"
        hide-details="auto"
        :disabled="marker.status === 'removed'"
        @update:model-value="handleValueChange"
        @keydown.enter="handleEnterKey"
        @keydown.tab="handleTabKey"
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
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Marker } from '../../shared/types';
import { useValidation } from '../composables/useValidation';

/**
 * MarkerItem Component
 *
 * Displays an individual marker with its status indicator and allows
 * users to enter replacement values.
 *
 * According to TODO.md Step 6.7: "Marker values have no validation (allow any input)"
 *
 * @example
 * ```vue
 * <MarkerItem
 *   :marker="marker"
 *   @value-change="handleValueChange"
 *   @enter-pressed="handleEnterPressed"
 *   @tab-pressed="handleTabPressed"
 * />
 * ```
 */

interface Props {
  /** The marker to display */
  marker: Marker;
  /** Whether to show validation errors (always false for marker values per TODO.md) */
  showValidation?: boolean;
}

interface Emits {
  /** Emitted when the marker value changes */
  (e: 'value-change', identifier: string, value: string): void;
  /** Emitted when Enter key is pressed in the input field */
  (e: 'enter-pressed', identifier: string): void;
  /** Emitted when Tab key is pressed in the input field */
  (e: 'tab-pressed', identifier: string): void;
  /** Emitted when validation state changes (always valid for marker values) */
  (e: 'validation', identifier: string, isValid: boolean): void;
}

const props = withDefaults(defineProps<Props>(), {
  showValidation: false,
});

const emit = defineEmits<Emits>();

// ============================================================================
// VALIDATION
// ============================================================================

const { validateMarkerValue } = useValidation();

// ============================================================================
// STATE
// ============================================================================

/** Whether the field has been touched (user interacted with it) */
const isTouched = ref<boolean>(false);

/** Whether the field is currently valid (always true for marker values) */
const isValid = ref<boolean>(true);

/** Validation error messages (always empty for marker values) */
const errorMessages = ref<string[]>([]);

// ============================================================================
// COMPUTED
// ============================================================================

/**
 * Color for the marker status indicator based on status
 * Follows PLAN.md section 6.3 color scheme:
 * - Primary (#1976D2) for active markers
 * - Warning (#FF9800) for new markers
 * - Grey (#9E9E9E) for removed markers
 */
const statusColor = computed(() => {
  switch (props.marker.status) {
    case 'active':
      return 'primary';
    case 'new':
      return 'warning';
    case 'removed':
      return 'grey';
    default:
      return 'grey';
  }
});

/**
 * Icon for the marker status indicator
 */
const statusIcon = computed(() => {
  switch (props.marker.status) {
    case 'active':
      return 'mdi-check';
    case 'new':
      return 'mdi-star';
    case 'removed':
      return 'mdi-minus';
    default:
      return 'mdi-help';
  }
});

/**
 * Whether to show error messages (always false for marker values per TODO.md)
 */
const showErrorMessages = computed(() => {
  return props.showValidation && isTouched.value && errorMessages.value.length > 0;
});

// ============================================================================
// METHODS
// ============================================================================

/**
 * Perform validation on the marker value
 * According to TODO.md, marker values have no validation (always valid)
 */
function performValidation(value: string): boolean {
  const result = validateMarkerValue(value, props.marker.identifier);
  isValid.value = result.isValid;
  errorMessages.value = result.errors;
  emit('validation', props.marker.identifier, result.isValid);
  return result.isValid;
}

/**
 * Handle marker value change
 * Emits the value-change event with the marker identifier and new value
 */
function handleValueChange(value: string): void {
  // Mark as touched
  isTouched.value = true;
  
  // Validate (always valid for marker values per TODO.md)
  performValidation(value);
  
  // Emit value change
  emit('value-change', props.marker.identifier, value);
}

/**
 * Handle Enter key press in the input field
 * Emits the enter-pressed event with the marker identifier
 */
function handleEnterKey(): void {
  emit('enter-pressed', props.marker.identifier);
}

/**
 * Handle Tab key press in the input field
 * Emits the tab-pressed event with the marker identifier
 */
function handleTabKey(): void {
  emit('tab-pressed', props.marker.identifier);
}

/**
 * Expose validation method for parent components
 */
defineExpose({
  validate: performValidation,
  isValid,
  errorMessages,
});
</script>

<style scoped>
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
</style>