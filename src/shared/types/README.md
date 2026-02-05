# Shared Types Package

This package contains all TypeScript type definitions shared between the main and renderer processes of the Document Prefiller application.

## Structure

```
src/shared/types/
├── index.ts           # Main entry point with barrel exports
├── data-models.ts     # Core data model interfaces
├── ipc.ts            # IPC message types
└── README.md         # This file
```

## Usage

### Importing Types

You can import types from the shared package in both main and renderer processes:

```typescript
// Import specific types
import { Marker, ScanResult, AppSettings } from '@shared/types';

// Import IPC types
import { IPC_CHANNELS, ScanFolderRequest, ScanFolderResponse } from '@shared/types';

// Import all types
import * as SharedTypes from '@shared/types';
```

### Type Guards

The package includes type guard functions for runtime type checking:

```typescript
import { isMarker, isScanResult, isReplacementValuesFile } from '@shared/types';

if (isMarker(value)) {
  // TypeScript knows value is a Marker
  console.log(value.identifier);
}
```

### Utility Types

Several utility types are provided for common transformations:

```typescript
import { DeepPartial, DeepRequired, KeysOfType, PickByType } from '@shared/types';

// Make all properties optional recursively
type PartialSettings = DeepPartial<AppSettings>;

// Make all properties required recursively
type RequiredSettings = DeepRequired<AppSettings>;

// Extract keys of a specific type
type StringKeys = KeysOfType<AppSettings, string>;

// Pick properties by type
type StringProps = PickByType<AppSettings, string>;
```

## Type Categories

### Data Models (`data-models.ts`)

Core data model interfaces as specified in PLAN.md section 5:

- `ReplacementValuesFile` - Structure of .replacement-values.json
- `AppSettings` - Application-wide settings
- `Marker` - Replacement marker detected in documents
- `ScanResult` - Result of scanning a folder
- `MarkerStatus` - Union type for marker status
- `DocumentInfo` - Document file with metadata
- `ReplacementRequest` - Request for document replacement
- `ReplacementResult` - Result of replacement operation

### IPC Types (`ipc.ts`)

Types for inter-process communication:

- `IPC_CHANNELS` - Constant with all IPC channel names
- `IpcChannel` - Union type of all channel names
- Request/Response types for each IPC operation
- Progress event types
- Error response types

#### IPC Operations

**Folder Operations:**
- `ScanFolderRequest` / `ScanFolderResponse`
- `SelectFolderRequest` / `SelectFolderResponse`

**Document Operations:**
- `ReplaceDocumentsRequest` / `ReplaceDocumentsResponse`
- `GetDocumentsRequest` / `GetDocumentsResponse`

**Settings Operations:**
- `GetSettingsRequest` / `GetSettingsResponse`
- `SaveSettingsRequest` / `SaveSettingsResponse`

**Window Operations:**
- `MinimizeWindowRequest`
- `MaximizeWindowRequest`
- `CloseWindowRequest`

### Type-Safe IPC

The package provides utility types for type-safe IPC communication:

```typescript
import { IpcRequestForChannel, IpcResponseForChannel } from '@shared/types';

// Get request type for a channel
type ScanRequest = IpcRequestForChannel<typeof IPC_CHANNELS.SCAN_FOLDER>;
// Result: ScanFolderRequest

// Get response type for a channel
type ScanResponse = IpcResponseForChannel<typeof IPC_CHANNELS.SCAN_FOLDER>;
// Result: ScanFolderResponse
```

## Best Practices

1. **Always import from `@shared/types`** - This ensures type consistency across processes
2. **Use type guards for runtime validation** - Especially when dealing with IPC data
3. **Leverage utility types** - They help with common type transformations
4. **Keep types in sync** - When modifying data models, update both the interface and any related types

## Examples

### Using Type Guards with IPC

```typescript
import { ipcRenderer } from 'electron';
import { isScanResult, IPC_CHANNELS } from '@shared/types';

const result = await ipcRenderer.invoke(IPC_CHANNELS.SCAN_FOLDER, { folderPath: '/path' });

if (isScanResult(result)) {
  // TypeScript knows result is a ScanResult
  console.log(`Found ${result.documents.length} documents`);
}
```

### Creating Type-Safe IPC Wrappers

```typescript
import { ipcRenderer } from 'electron';
import { IPC_CHANNELS, IpcRequestForChannel, IpcResponseForChannel } from '@shared/types';

async function invokeIpc<T extends IpcChannel>(
  channel: T,
  request: IpcRequestForChannel<T>
): Promise<IpcResponseForChannel<T>> {
  return ipcRenderer.invoke(channel, request);
}

// Usage
const response = await invokeIpc(IPC_CHANNELS.SCAN_FOLDER, { folderPath: '/path' });
```

## Maintenance

When adding new types:

1. Add the type to the appropriate file (`data-models.ts` or `ipc.ts`)
2. Export it from `index.ts` if it should be publicly accessible
3. Add a type guard if runtime validation is needed
4. Update this README with documentation
5. Run `yarn lint` to ensure no TypeScript errors

## Related Files

- `src/shared/constants/index.ts` - Application constants
- `src/preload/index.ts` - Preload script that exposes IPC to renderer
- `src/main/ipc/` - IPC handlers in main process
- `src/renderer/composables/` - Composables that use shared types