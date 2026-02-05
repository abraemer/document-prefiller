<template>
  <div class="prefix-input">
    <v-text-field
      v-model="localPrefix"
      :label="label"
      :hint="hint"
      :error-messages="errorMessages"
      :rules="validationRules"
      :disabled="disabled"
      :loading="loading"
      variant="outlined"
      density="comfortable"
      prepend-inner-icon="mdi-tag"
      clearable
      @update:model-value="handlePrefixChange"
      @blur="handleBlur"
      @keyup.enter="handleEnter"
    >
      <template #append-inner>
        <v-tooltip location="top">
          <template #activator="{ props: tooltipProps }">
            <v-icon
              v-bind="tooltipProps"
              icon="mdi-information-outline"
              size="small"
              color="grey"
            />
          </template>
          <span>{{ tooltipText }}</span>
        </v-tooltip>
      </template>
    </v-text-field>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { DEFAULT_PREFIX, MIN_PREFIX_LENGTH, MAX_PREFIX_LENGTH } from '@/shared/constants';

// ============================================================================
// PROPS
// ============================================================================

interface Props {
  /** Current marker prefix value */
  modelValue?: string;
  /** Label for the input field */
  label?: string;
  /** Hint text displayed below the input */
  hint?: string;
  /** Tooltip text explaining the prefix */
  tooltipText?: string;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Whether the input is in a loading state */
  loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: DEFAULT_PREFIX,
  label: 'Marker Prefix',
  hint: 'The prefix used to identify markers in documents',
  tooltipText: 'Markers in documents must start with this prefix (e.g., REPLACEME-WORD)',
  disabled: false,
  loading: false,
});

// ============================================================================
// EMITS
// ============================================================================

interface Emits {
  /** Emitted when the prefix value changes */
  (e: 'update:modelValue', value: string): void;
  /** Emitted when the prefix is changed and valid */
  (e: 'change', value: string): void;
  /** Emitted when the input loses focus */
  (e: 'blur', value: string): void;
  /** Emitted when Enter key is pressed */
  (e: 'enter', value: string): void;
}

const emit = defineEmits<Emits>();

// ============================================================================
// STATE
// ============================================================================

/** Local state for the prefix value */
const localPrefix = ref<string>(props.modelValue);

/** Validation error messages */
const errorMessages = ref<string[]>([]);

// ============================================================================
// COMPUTED
// ============================================================================

/**
 * Validation rules for the prefix input
 */
const validationRules = computed(() => [
  (value: string) => {
    if (!value || value.trim().length === 0) {
      return 'Prefix cannot be empty';
    }
    if (value.length < MIN_PREFIX_LENGTH) {
      return `Prefix must be at least ${MIN_PREFIX_LENGTH} character(s)`;
    }
    if (value.length > MAX_PREFIX_LENGTH) {
      return `Prefix must not exceed ${MAX_PREFIX_LENGTH} characters`;
    }
    return true;
  },
]);

// ============================================================================
// WATCHERS
// ============================================================================

/**
 * Watch for changes to the modelValue prop and update local state
 */
watch(
  () => props.modelValue,
  (newValue) => {
    if (newValue !== localPrefix.value) {
      localPrefix.value = newValue;
    }
  }
);

// ============================================================================
// METHODS
// ============================================================================

/**
 * Validate the prefix value
 */
const validatePrefix = (value: string): boolean => {
  const errors: string[] = [];

  if (!value || value.trim().length === 0) {
    errors.push('Prefix cannot be empty');
  }

  if (value.length < MIN_PREFIX_LENGTH) {
    errors.push(`Prefix must be at least ${MIN_PREFIX_LENGTH} character(s)`);
  }

  if (value.length > MAX_PREFIX_LENGTH) {
    errors.push(`Prefix must not exceed ${MAX_PREFIX_LENGTH} characters`);
  }

  errorMessages.value = errors;
  return errors.length === 0;
};

/**
 * Handle prefix value changes
 */
const handlePrefixChange = (value: string): void => {
  localPrefix.value = value;
  emit('update:modelValue', value);

  // Validate the new value
  const isValid = validatePrefix(value);

  // Only emit change event if valid
  if (isValid) {
    emit('change', value);
  }
};

/**
 * Handle blur event
 */
const handleBlur = (): void => {
  const trimmedValue = localPrefix.value.trim();
  
  // Update with trimmed value if different
  if (trimmedValue !== localPrefix.value) {
    localPrefix.value = trimmedValue;
    emit('update:modelValue', trimmedValue);
    
    const isValid = validatePrefix(trimmedValue);
    if (isValid) {
      emit('change', trimmedValue);
    }
  }
  
  emit('blur', localPrefix.value);
};

/**
 * Handle Enter key press
 */
const handleEnter = (): void => {
  const trimmedValue = localPrefix.value.trim();
  
  // Update with trimmed value if different
  if (trimmedValue !== localPrefix.value) {
    localPrefix.value = trimmedValue;
    emit('update:modelValue', trimmedValue);
    
    const isValid = validatePrefix(trimmedValue);
    if (isValid) {
      emit('change', trimmedValue);
    }
  }
  
  emit('enter', localPrefix.value);
};
</script>

<style scoped>
.prefix-input {
  width: 100%;
}

/* Ensure the text field has proper spacing */
.prefix-input :deep(.v-input) {
  margin-bottom: 0;
}

/* Style the prepend icon */
.prefix-input :deep(.v-input__prepend) {
  color: #1976D2;
}

/* Style the clear button */
.prefix-input :deep(.v-input__append-inner) {
  align-items: center;
}

/* Error message styling */
.prefix-input :deep(.v-messages__message) {
  color: #F44336;
}

/* Hint text styling */
.prefix-input :deep(.v-input__details .v-messages) {
  color: #757575;
}
</style>