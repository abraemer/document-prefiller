/**
 * useValidation Composable
 * Provides form validation utilities for the application
 */

import { ref, computed } from 'vue';
import { MIN_PREFIX_LENGTH, MAX_PREFIX_LENGTH } from '../../shared/constants';

/**
 * Validation result type
 */
export interface ValidationResult {
  /** Whether the value is valid */
  isValid: boolean;
  /** Error messages (empty if valid) */
  errors: string[];
}

/**
 * Form validation state
 */
export interface FormValidationState {
  /** Whether the form is valid */
  isValid: boolean;
  /** Whether the form has been touched (user interacted with it) */
  isTouched: boolean;
  /** Whether the form is dirty (has unsaved changes) */
  isDirty: boolean;
  /** Validation errors by field name */
  errors: Record<string, string[]>;
}

/**
 * useValidation Composable
 * 
 * Provides reactive state and utilities for form validation
 * 
 * @example
 * ```typescript
 * const {
 *   validatePrefix,
 *   validateMarkerValue,
 *   formState,
 *   isFormValid,
 *   resetValidation
 * } = useValidation();
 * ```
 */
export function useValidation() {
  // ============================================================================
  // STATE
  // ============================================================================

  /** Form validation state */
  const formState = ref<FormValidationState>({
    isValid: true,
    isTouched: false,
    isDirty: false,
    errors: {},
  });

  /** Prefix validation state */
  const prefixValidation = ref<ValidationResult>({
    isValid: true,
    errors: [],
  });

  /** Marker value validation state (by identifier) */
  const markerValidation = ref<Record<string, ValidationResult>>({});

  // ============================================================================
  // COMPUTED PROPERTIES
  // ============================================================================

  /**
   * Whether the form is valid
   */
  const isFormValid = computed<boolean>(() => {
    return formState.value.isValid && prefixValidation.value.isValid;
  });

  /**
   * Whether the form has any errors
   */
  const hasErrors = computed<boolean>(() => {
    return Object.keys(formState.value.errors).length > 0 || 
           prefixValidation.value.errors.length > 0;
  });

  /**
   * All error messages combined
   */
  const allErrors = computed<string[]>(() => {
    const errors: string[] = [];
    
    // Add prefix errors
    errors.push(...prefixValidation.value.errors);
    
    // Add form field errors
    for (const fieldErrors of Object.values(formState.value.errors)) {
      errors.push(...fieldErrors);
    }
    
    return errors;
  });

  // ============================================================================
  // VALIDATION FUNCTIONS
  // ============================================================================

  /**
   * Validate marker prefix
   * 
   * @param prefix - The prefix to validate
   * @returns Validation result
   */
  function validatePrefix(prefix: string): ValidationResult {
    const errors: string[] = [];

    // Check if prefix is empty
    if (!prefix || prefix.trim().length === 0) {
      errors.push('Prefix cannot be empty');
    }

    // Check minimum length
    if (prefix.length < MIN_PREFIX_LENGTH) {
      errors.push(`Prefix must be at least ${MIN_PREFIX_LENGTH} character${MIN_PREFIX_LENGTH > 1 ? 's' : ''}`);
    }

    // Check maximum length
    if (prefix.length > MAX_PREFIX_LENGTH) {
      errors.push(`Prefix must not exceed ${MAX_PREFIX_LENGTH} characters`);
    }

    const result: ValidationResult = {
      isValid: errors.length === 0,
      errors,
    };

    prefixValidation.value = result;
    updateFormState();

    return result;
  }

  /**
   * Validate marker value
   * According to TODO.md, marker values have no validation (allow any input)
   * This function always returns valid but can be extended if needed
   * 
   * @param value - The marker value to validate
   * @param identifier - The marker identifier
   * @returns Validation result (always valid)
   */
  function validateMarkerValue(value: string, identifier: string): ValidationResult {
    // According to TODO.md Step 6.7: "Marker values have no validation (allow any input)"
    // So we always return valid
    const result: ValidationResult = {
      isValid: true,
      errors: [],
    };

    markerValidation.value[identifier] = result;
    updateFormState();

    return result;
  }

  /**
   * Validate a field with custom rules
   * 
   * @param fieldName - The name of the field
   * @param value - The value to validate
   * @param rules - Array of validation rules
   * @returns Validation result
   */
  function validateField(
    fieldName: string,
    value: unknown,
    rules: Array<(value: unknown) => string | true>
  ): ValidationResult {
    const errors: string[] = [];

    for (const rule of rules) {
      const result = rule(value);
      if (result !== true) {
        errors.push(result);
      }
    }

    const result: ValidationResult = {
      isValid: errors.length === 0,
      errors,
    };

    if (errors.length > 0) {
      formState.value.errors[fieldName] = errors;
    } else {
      delete formState.value.errors[fieldName];
    }

    updateFormState();

    return result;
  }

  /**
   * Validate multiple fields at once
   * 
   * @param fields - Object with field names and their values/rules
   * @returns Whether all fields are valid
   */
  function validateFields(
    fields: Record<string, {
      value: unknown;
      rules: Array<(value: unknown) => string | true>;
    }>
  ): boolean {
    let allValid = true;

    for (const [fieldName, { value, rules }] of Object.entries(fields)) {
      const result = validateField(fieldName, value, rules);
      if (!result.isValid) {
        allValid = false;
      }
    }

    return allValid;
  }

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  /**
   * Update form state based on current validation results
   */
  function updateFormState(): void {
    const hasPrefixErrors = prefixValidation.value.errors.length > 0;
    const hasFieldErrors = Object.keys(formState.value.errors).length > 0;

    formState.value.isValid = !hasPrefixErrors && !hasFieldErrors;
  }

  /**
   * Mark the form as touched
   */
  function touchForm(): void {
    formState.value.isTouched = true;
  }

  /**
   * Mark the form as dirty
   */
  function markDirty(): void {
    formState.value.isDirty = true;
  }

  /**
   * Reset validation state
   */
  function resetValidation(): void {
    formState.value = {
      isValid: true,
      isTouched: false,
      isDirty: false,
      errors: {},
    };
    prefixValidation.value = {
      isValid: true,
      errors: [],
    };
    markerValidation.value = {};
  }

  /**
   * Clear errors for a specific field
   * 
   * @param fieldName - The name of the field to clear errors for
   */
  function clearFieldError(fieldName: string): void {
    delete formState.value.errors[fieldName];
    updateFormState();
  }

  /**
   * Clear all errors
   */
  function clearAllErrors(): void {
    formState.value.errors = {};
    prefixValidation.value = {
      isValid: true,
      errors: [],
    };
    markerValidation.value = {};
    updateFormState();
  }

  // ============================================================================
  // VUETIFY VALIDATION RULES
  // ============================================================================

  /**
   * Get Vuetify-compatible validation rules for prefix
   * 
   * @returns Array of Vuetify validation rule functions
   */
  function getPrefixRules(): Array<(value: string) => string | true> {
    return [
      (value: string) => {
        if (!value || value.trim().length === 0) {
          return 'Prefix cannot be empty';
        }
        return true;
      },
      (value: string) => {
        if (value.length < MIN_PREFIX_LENGTH) {
          return `Prefix must be at least ${MIN_PREFIX_LENGTH} character${MIN_PREFIX_LENGTH > 1 ? 's' : ''}`;
        }
        return true;
      },
      (value: string) => {
        if (value.length > MAX_PREFIX_LENGTH) {
          return `Prefix must not exceed ${MAX_PREFIX_LENGTH} characters`;
        }
        return true;
      },
    ];
  }

  /**
   * Get Vuetify-compatible validation rules for marker value
   * According to TODO.md, marker values have no validation (allow any input)
   * 
   * @returns Empty array (no validation rules)
   */
  function getMarkerValueRules(): Array<(value: string) => string | true> {
    // No validation for marker values per TODO.md requirements
    return [];
  }

  // ============================================================================
  // RETURN
  // ============================================================================

  return {
    // State
    formState,
    prefixValidation,
    markerValidation,

    // Computed
    isFormValid,
    hasErrors,
    allErrors,

    // Validation functions
    validatePrefix,
    validateMarkerValue,
    validateField,
    validateFields,

    // State management
    touchForm,
    markDirty,
    resetValidation,
    clearFieldError,
    clearAllErrors,

    // Vuetify rules
    getPrefixRules,
    getMarkerValueRules,
  };
}