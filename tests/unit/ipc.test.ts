/**
 * IPC Communication Layer Tests
 * 
 * Tests for the unified IPC communication layer
 */

import { describe, it, expect } from 'vitest';
import { isSuccess, isError, getDataOrThrow, getDataOrDefault } from '../../src/renderer/utils/ipc';
import type { IpcResponse, IpcSuccessResponse, IpcErrorResponse } from '../../src/shared/types';

// ============================================================================
// CONVENIENCE FUNCTIONS TESTS
// ============================================================================

describe('IPC - Convenience Functions', () => {
  describe('isSuccess', () => {
    it('should return true for successful response', () => {
      const response: IpcSuccessResponse<string> = {
        success: true,
        data: 'test',
      };

      expect(isSuccess(response)).toBe(true);
    });

    it('should return false for error response', () => {
      const response: IpcErrorResponse = {
        success: false,
        message: 'Error',
      };

      expect(isSuccess(response)).toBe(false);
    });

    it('should handle response with success field as boolean', () => {
      const response1: IpcResponse<string> = {
        success: true,
        data: 'test',
      };

      const response2: IpcResponse<string> = {
        success: false,
        message: 'Error',
      };

      expect(isSuccess(response1)).toBe(true);
      expect(isSuccess(response2)).toBe(false);
    });
  });

  describe('isError', () => {
    it('should return true for error response', () => {
      const response: IpcErrorResponse = {
        success: false,
        message: 'Error',
      };

      expect(isError(response)).toBe(true);
    });

    it('should return false for successful response', () => {
      const response: IpcSuccessResponse<string> = {
        success: true,
        data: 'test',
      };

      expect(isError(response)).toBe(false);
    });

    it('should handle response with success field as boolean', () => {
      const response1: IpcResponse<string> = {
        success: true,
        data: 'test',
      };

      const response2: IpcResponse<string> = {
        success: false,
        message: 'Error',
      };

      expect(isError(response1)).toBe(false);
      expect(isError(response2)).toBe(true);
    });
  });

  describe('getDataOrThrow', () => {
    it('should return data from successful response', () => {
      const response: IpcSuccessResponse<string> = {
        success: true,
        data: 'test',
      };

      expect(getDataOrThrow(response)).toBe('test');
    });

    it('should return data from successful response with object', () => {
      const data = { name: 'test', value: 123 };
      const response: IpcSuccessResponse<typeof data> = {
        success: true,
        data,
      };

      expect(getDataOrThrow(response)).toEqual(data);
    });

    it('should throw error from error response', () => {
      const response: IpcErrorResponse = {
        success: false,
        message: 'Error',
      };

      expect(() => getDataOrThrow(response)).toThrow('Error');
    });

    it('should throw error with code from error response', () => {
      const response: IpcErrorResponse = {
        success: false,
        message: 'Error',
        code: 'TIMEOUT',
      };

      try {
        getDataOrThrow(response);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Error');
      }
    });

    it('should throw error with details from error response', () => {
      const details = { field: 'value' };
      const response: IpcErrorResponse = {
        success: false,
        message: 'Error',
        details,
      };

      try {
        getDataOrThrow(response);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error & { originalError?: unknown }).originalError).toEqual(details);
      }
    });
  });

  describe('getDataOrDefault', () => {
    it('should return data from successful response', () => {
      const response: IpcSuccessResponse<string> = {
        success: true,
        data: 'test',
      };

      expect(getDataOrDefault(response, 'default')).toBe('test');
    });

    it('should return data from successful response with object', () => {
      const data = { name: 'test', value: 123 };
      const response: IpcSuccessResponse<typeof data> = {
        success: true,
        data,
      };

      expect(getDataOrDefault(response, { name: 'default', value: 0 })).toEqual(data);
    });

    it('should return default from error response', () => {
      const response: IpcErrorResponse = {
        success: false,
        message: 'Error',
      };

      expect(getDataOrDefault(response, 'default')).toBe('default');
    });

    it('should return default object from error response', () => {
      const response: IpcErrorResponse = {
        success: false,
        message: 'Error',
      };

      const defaultData = { name: 'default', value: 0 };
      expect(getDataOrDefault(response, defaultData)).toEqual(defaultData);
    });

    it('should return null as default', () => {
      const response: IpcErrorResponse = {
        success: false,
        message: 'Error',
      };

      expect(getDataOrDefault<string | null>(response, null)).toBeNull();
    });

    it('should return undefined as default', () => {
      const response: IpcErrorResponse = {
        success: false,
        message: 'Error',
      };

      expect(getDataOrDefault<string | undefined>(response, undefined)).toBeUndefined();
    });
  });
});

// ============================================================================
// IPC RESPONSE TYPE TESTS
// ============================================================================

describe('IPC - Response Types', () => {
  describe('IpcSuccessResponse', () => {
    it('should create valid success response', () => {
      const response: IpcSuccessResponse<string> = {
        success: true,
        data: 'test',
      };

      expect(response.success).toBe(true);
      expect(response.data).toBe('test');
    });

    it('should create success response with complex data', () => {
      const data = {
        documents: [
          { path: '/path/to/doc1.docx', name: 'doc1.docx', markers: ['REPLACEME-NAME'] },
        ],
      };

      const response: IpcSuccessResponse<typeof data> = {
        success: true,
        data,
      };

      expect(response.success).toBe(true);
      expect(response.data).toEqual(data);
    });
  });

  describe('IpcErrorResponse', () => {
    it('should create valid error response', () => {
      const response: IpcErrorResponse = {
        success: false,
        message: 'Error occurred',
      };

      expect(response.success).toBe(false);
      expect(response.message).toBe('Error occurred');
    });

    it('should create error response with code', () => {
      const response: IpcErrorResponse = {
        success: false,
        message: 'Error occurred',
        code: 'TIMEOUT',
      };

      expect(response.success).toBe(false);
      expect(response.message).toBe('Error occurred');
      expect(response.code).toBe('TIMEOUT');
    });

    it('should create error response with details', () => {
      const details = { field: 'value', error: 'details' };
      const response: IpcErrorResponse = {
        success: false,
        message: 'Error occurred',
        details,
      };

      expect(response.success).toBe(false);
      expect(response.message).toBe('Error occurred');
      expect(response.details).toEqual(details);
    });

    it('should create error response with stack', () => {
      const stack = 'Error: Error occurred\n    at test.ts:1:1';
      const response: IpcErrorResponse = {
        success: false,
        message: 'Error occurred',
        stack,
      };

      expect(response.success).toBe(false);
      expect(response.message).toBe('Error occurred');
      expect(response.stack).toBe(stack);
    });
  });

  describe('IpcResponse union type', () => {
    it('should accept success response', () => {
      const response: IpcResponse<string> = {
        success: true,
        data: 'test',
      };

      expect(response.success).toBe(true);
    });

    it('should accept error response', () => {
      const response: IpcResponse<string> = {
        success: false,
        message: 'Error',
      };

      expect(response.success).toBe(false);
    });

    it('should work with type guards', () => {
      const successResponse: IpcResponse<string> = {
        success: true,
        data: 'test',
      };

      const errorResponse: IpcResponse<string> = {
        success: false,
        message: 'Error',
      };

      if (isSuccess(successResponse)) {
        expect(successResponse.data).toBe('test');
      }

      if (isError(errorResponse)) {
        expect(errorResponse.message).toBe('Error');
      }
    });
  });
});

// ============================================================================
// IPC ERROR HANDLING TESTS
// ============================================================================

describe('IPC - Error Handling', () => {
  it('should handle error with code', () => {
    const response: IpcErrorResponse = {
      success: false,
      message: 'Folder not found',
      code: 'FOLDER_NOT_FOUND',
    };

    expect(isError(response)).toBe(true);
    expect(response.code).toBe('FOLDER_NOT_FOUND');
  });

  it('should handle error with details', () => {
    const details = { path: '/invalid/path', error: 'ENOENT' };
    const response: IpcErrorResponse = {
      success: false,
      message: 'Failed to scan folder',
      details,
    };

    expect(isError(response)).toBe(true);
    expect(response.details).toEqual(details);
  });

  it('should handle error with stack trace', () => {
    const stack = 'Error: Failed to scan folder\n    at scanFolder (folder.ts:10:5)';
    const response: IpcErrorResponse = {
      success: false,
      message: 'Failed to scan folder',
      stack,
    };

    expect(isError(response)).toBe(true);
    expect(response.stack).toBe(stack);
  });

  it('should handle error with all fields', () => {
    const response: IpcErrorResponse = {
      success: false,
      message: 'Failed to scan folder',
      code: 'FOLDER_NOT_FOUND',
      details: { path: '/invalid/path' },
      stack: 'Error: Failed to scan folder\n    at scanFolder (folder.ts:10:5)',
    };

    expect(isError(response)).toBe(true);
    expect(response.message).toBe('Failed to scan folder');
    expect(response.code).toBe('FOLDER_NOT_FOUND');
    expect(response.details).toEqual({ path: '/invalid/path' });
    expect(response.stack).toBeDefined();
  });
});

// ============================================================================
// IPC DATA EXTRACTION TESTS
// ============================================================================

describe('IPC - Data Extraction', () => {
  it('should extract string data', () => {
    const response: IpcSuccessResponse<string> = {
      success: true,
      data: 'test string',
    };

    expect(getDataOrThrow(response)).toBe('test string');
    expect(getDataOrDefault(response, 'default')).toBe('test string');
  });

  it('should extract number data', () => {
    const response: IpcSuccessResponse<number> = {
      success: true,
      data: 42,
    };

    expect(getDataOrThrow(response)).toBe(42);
    expect(getDataOrDefault(response, 0)).toBe(42);
  });

  it('should extract boolean data', () => {
    const response: IpcSuccessResponse<boolean> = {
      success: true,
      data: true,
    };

    expect(getDataOrThrow(response)).toBe(true);
    expect(getDataOrDefault(response, false)).toBe(true);
  });

  it('should extract array data', () => {
    const data = [1, 2, 3, 4, 5];
    const response: IpcSuccessResponse<number[]> = {
      success: true,
      data,
    };

    expect(getDataOrThrow(response)).toEqual(data);
    expect(getDataOrDefault(response, [])).toEqual(data);
  });

  it('should extract object data', () => {
    const data = { name: 'test', value: 123, active: true };
    const response: IpcSuccessResponse<typeof data> = {
      success: true,
      data,
    };

    expect(getDataOrThrow(response)).toEqual(data);
    expect(getDataOrDefault(response, { name: 'default', value: 0, active: false })).toEqual(data);
  });

  it('should extract nested object data', () => {
    const data = {
      user: {
        name: 'John',
        age: 30,
        address: {
          city: 'New York',
          country: 'USA',
        },
      },
    };

    const response: IpcSuccessResponse<typeof data> = {
      success: true,
      data,
    };

    expect(getDataOrThrow(response)).toEqual(data);
    expect(getDataOrDefault(response, {
      user: {
        name: 'default',
        age: 0,
        address: {
          city: 'default',
          country: 'default',
        },
      },
    })).toEqual(data);
  });
});

// ============================================================================
// IPC DEFAULT VALUE TESTS
// ============================================================================

describe('IPC - Default Values', () => {
  it('should use default string value on error', () => {
    const response: IpcErrorResponse = {
      success: false,
      message: 'Error',
    };

    expect(getDataOrDefault(response, 'default string')).toBe('default string');
  });

  it('should use default number value on error', () => {
    const response: IpcErrorResponse = {
      success: false,
      message: 'Error',
    };

    expect(getDataOrDefault(response, 42)).toBe(42);
  });

  it('should use default boolean value on error', () => {
    const response: IpcErrorResponse = {
      success: false,
      message: 'Error',
    };

    expect(getDataOrDefault(response, false)).toBe(false);
  });

  it('should use default array value on error', () => {
    const response: IpcErrorResponse = {
      success: false,
      message: 'Error',
    };

    const defaultArray = [1, 2, 3];
    expect(getDataOrDefault(response, defaultArray)).toEqual(defaultArray);
  });

  it('should use default object value on error', () => {
    const response: IpcErrorResponse = {
      success: false,
      message: 'Error',
    };

    const defaultObject = { name: 'default', value: 0 };
    expect(getDataOrDefault(response, defaultObject)).toEqual(defaultObject);
  });
});