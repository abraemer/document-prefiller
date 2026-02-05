# Document Prefiller - Implementation TODO

This document breaks down the PLAN.md implementation into small, self-contained steps with validation criteria.

---

## Phase 1: Project Setup and Infrastructure

### [x] 1.1 Initialize Project with Vite + Electron + Vue.js
- **Description**: Create a new project using Vite with Electron and Vue.js 3 template
- **Validation Criteria**:
  - Project directory structure is created
  - `package.json` exists with required dependencies (vite, electron, vue, typescript)
  - Basic `vite.config.ts` is present
  - `electron.vite.config.ts` is configured
- **Dependencies**: None

### [x] 1.2 Configure TypeScript and ESLint
- **Description**: Set up TypeScript configuration for both main and renderer processes and configure ESLint for code linting
- **Validation Criteria**:
  - `tsconfig.json` exists with proper compiler options
  - `tsconfig.node.json` exists for main process
  - `tsconfig.app.json` exists for renderer process
  - `.eslintrc.cjs` exists with appropriate rules for TypeScript, Vue.js, and Electron
  - `.eslintignore` exists to exclude build outputs and dependencies
  - ESLint runs without errors on the codebase
  - Linting is configured for TypeScript and Vue files
  - `yarn lint` command works without errors
- **Dependencies**: 1.1

### [x] 1.3 Set Up Vuetify 3 Integration
- **Description**: Install and configure Vuetify 3 for the Vue.js renderer process
- **Validation Criteria**:
  - Vuetify 3 is installed in dependencies
  - Vuetify plugin is registered in renderer entry point
  - Vuetify styles are imported
  - Basic Vuetify component renders without errors
- **Dependencies**: 1.1

### [x] 1.4 Configure Vitest for Testing
- **Description**: Set up Vitest for unit and component testing
- **Validation Criteria**:
  - Vitest is installed in dev dependencies
  - `vitest.config.ts` exists with proper configuration
  - Test script is added to package.json
  - Sample test runs successfully
- **Dependencies**: 1.1, 1.2

### [x] 1.5 Create Basic Project Structure
- **Description**: Create the directory structure as defined in PLAN.md section 7.1
- **Validation Criteria**:
  - All directories from PLAN.md section 7.1 are created
  - Directory structure matches the documented layout
  - Empty placeholder files exist where needed
- **Dependencies**: 1.1

### [x] 1.6 Set Up Development and Build Scripts
- **Description**: Configure npm scripts for development, building, and testing
- **Validation Criteria**:
  - `package.json` contains scripts: `dev`, `build`, `preview`, `test`
  - Development server starts with `npm run dev`
  - Build process completes with `npm run build`
  - Test suite runs with `npm run test`
- **Dependencies**: 1.1, 1.5

### [x] 1.7 Configure Electron Preload Script and Context Bridge
- **Description**: Set up the preload script to securely expose APIs to renderer process
- **Validation Criteria**:
  - `src/preload/index.ts` exists
  - Context bridge is configured with `contextBridge.exposeInMainWorld()`
  - IPC channels are defined in preload script
  - Renderer can access exposed APIs
- **Dependencies**: 1.1, 1.6

---

## Phase 2: Core Data Models and Types

### [x] 2.1 Define TypeScript Interfaces for Data Models
- **Description**: Create TypeScript interfaces for all data models defined in PLAN.md section 5
- **Validation Criteria**:
  - `ReplacementValuesFile` interface is defined
  - `AppSettings` interface is defined
  - `Marker` interface is defined
  - `ScanResult` interface is defined
  - All interfaces match the schemas in PLAN.md
- **Dependencies**: 1.2

### [x] 2.2 Create Shared Types Package
- **Description**: Create a shared types module accessible by both main and renderer processes
- **Validation Criteria**:
  - `src/shared/types/index.ts` exists
  - All data model interfaces are exported
  - Types can be imported in both main and renderer processes
  - No TypeScript errors when importing shared types
- **Dependencies**: 2.1

### [x] 2.3 Define IPC Message Types
- **Description**: Create TypeScript types for IPC communication between main and renderer processes
- **Validation Criteria**:
  - IPC request types are defined (e.g., `ScanFolderRequest`, `ReplaceDocumentsRequest`)
  - IPC response types are defined (e.g., `ScanFolderResponse`, `ReplaceDocumentsResponse`)
  - IPC error types are defined
  - Types ensure type-safe IPC communication
- **Dependencies**: 2.2

### [x] 2.4 Create Constants File
- **Description**: Define application constants (default values, file names, etc.)
- **Validation Criteria**:
  - `src/shared/constants/index.ts` exists
  - `DEFAULT_PREFIX` constant is set to "REPLACEME-"
  - `SAVE_FILE_NAME` constant is set to ".replacement-values.json"
  - `VERSION` constant is defined
  - Constants are exported and accessible
- **Dependencies**: 2.2

### [x] 2.5 Set Up Type Validation Utilities
- **Description**: Create utility functions for validating data structures
- **Validation Criteria**:
  - `isValidReplacementValuesFile()` function exists
  - `isValidMarker()` function exists
  - `isValidScanResult()` function exists
  - Validation functions return proper boolean results
  - Unit tests exist for validation utilities
- **Dependencies**: 2.1, 2.2

---

## Phase 3: Main Process - File System Operations

### [x] 3.1 Implement Folder Scanning Logic
- **Description**: Create a service to scan folders for .docx files
- **Validation Criteria**:
  - `src/main/services/scanner.ts` exists
  - `scanFolder()` function returns list of .docx files
  - Function handles non-existent folders gracefully
  - Function handles folders with no .docx files
  - Unit tests pass for folder scanning
- **Dependencies**: 2.2, 2.4

### [x] 3.2 Implement .docx File Parsing
- **Description**: Create a function to extract text content from .docx files
- **Validation Criteria**:
  - `parseDocxFile()` function exists in scanner service
  - Function extracts text from .docx files
  - Function handles malformed .docx files gracefully
  - Function preserves basic document structure
  - Unit tests pass for file parsing
- **Dependencies**: 3.1

### [x] 3.3 Create Marker Detection Algorithm
- **Description**: Implement regex-based marker detection in document text
- **Validation Criteria**:
  - `detectMarkers()` function exists
  - Function uses configurable prefix pattern
  - Function returns unique markers
  - Function tracks which documents contain each marker
  - Unit tests pass for various marker patterns
- **Dependencies**: 3.2, 2.4

### [x] 3.4 Implement File Copy Operations
- **Description**: Create utility functions for copying files between directories
- **Validation Criteria**:
  - `copyFile()` function exists in `src/main/utils/file.ts`
  - Function copies files successfully
  - Function handles file copy errors gracefully
  - Function preserves file metadata
  - Unit tests pass for file operations
- **Dependencies**: 2.2

### [x] 3.5 Create Save File Read Operations
- **Description**: Implement reading of .replacement-values.json files
- **Validation Criteria**:
  - `readSaveFile()` function exists in storage service
  - Function parses JSON correctly
  - Function handles missing files (returns default)
  - Function handles malformed JSON gracefully
  - Function validates file structure
  - Unit tests pass for read operations
- **Dependencies**: 2.1, 2.5

### [x] 3.6 Create Save File Write Operations
- **Description**: Implement writing of .replacement-values.json files
- **Validation Criteria**:
  - `writeSaveFile()` function exists in storage service
  - Function writes valid JSON
  - Function includes version and timestamp
  - Function handles write errors gracefully
  - Function creates file if it doesn't exist
  - Unit tests pass for write operations
- **Dependencies**: 3.5

### [x] 3.7 Implement Window State Persistence
- **Description**: Create functions to save and restore window state
- **Validation Criteria**:
  - `saveWindowState()` function exists
  - `restoreWindowState()` function exists
  - Functions save/restore width, height, x, y, maximized state
  - Functions use electron-store for persistence
  - Window state is restored on app launch
  - Window state is saved on app close
- **Dependencies**: 2.1

### [x] 3.8 Set Up IPC Handler for Folder Operations
- **Description**: Create IPC handlers for folder scanning and selection
- **Validation Criteria**:
  - `src/main/ipc/folder.ts` exists
  - `handleScanFolder()` handler is registered
  - `handleSelectFolder()` handler is registered
  - Handlers communicate with scanner service
  - Handlers return proper responses or errors
  - Unit tests pass for IPC handlers
- **Dependencies**: 3.1, 3.3, 2.3

### [x] 3.9 Set Up IPC Handler for Document Operations
- **Description**: Create IPC handlers for document replacement operations
- **Validation Criteria**:
  - `src/main/ipc/document.ts` exists
  - `handleReplaceDocuments()` handler is registered
  - Handler communicates with replacement engine
  - Handler returns progress updates
  - Handler returns proper responses or errors
  - Unit tests pass for IPC handlers
- **Dependencies**: 3.4, 2.3

### [x] 3.10 Set Up IPC Handler for Settings Operations
- **Description**: Create IPC handlers for settings and window state
- **Validation Criteria**:
  - `src/main/ipc/settings.ts` exists
  - `handleGetSettings()` handler is registered
  - `handleSaveSettings()` handler is registered
  - Handlers communicate with storage service
  - Handlers return proper responses or errors
  - Unit tests pass for IPC handlers
- **Dependencies**: 3.5, 3.7, 2.3

### [x] 3.11 Register All IPC Handlers
- **Description**: Create central IPC handler registration
- **Validation Criteria**:
  - `src/main/ipc/handlers.ts` exists
  - All IPC handlers are registered
  - Handlers are registered in main process
  - No duplicate handler registrations
  - IPC communication works between processes
- **Dependencies**: 3.8, 3.9, 3.10

---

## Phase 4: Main Process - Replacement Engine

### [x] 4.1 Research and Select .docx Manipulation Library
- **Description**: Evaluate and select a library for .docx file manipulation
- **Validation Criteria**:
  - Library is selected and documented
  - Library is added to dependencies
  - Library can read .docx files
  - Library can write .docx files
  - Library preserves document formatting
- **Dependencies**: None
- **Decision**: JSZip (v3.10.1) - See STEP_4.1_RESEARCH.md for detailed analysis

### [x] 4.2 Implement Marker Replacement Algorithm
- **Description**: Create a function to replace markers with values in document text
- **Validation Criteria**:
  - `replaceMarkers()` function exists in replacer service
  - Function replaces all occurrences of markers
  - Function uses provided replacement values
  - Function handles empty values (removes markers)
  - Unit tests pass for replacement logic
- **Dependencies**: 4.1, 3.3

### [x] 4.3 Handle Text Replacement While Preserving Formatting
- **Description**: Ensure replacement preserves document formatting and structure
- **Validation Criteria**:
  - Replacement preserves bold, italic, underline styles
  - Replacement preserves font styles and sizes
  - Replacement preserves paragraph formatting
  - Replacement preserves tables and lists
  - Manual testing confirms formatting is preserved
- **Dependencies**: 4.2

### [x] 4.4 Implement Batch Document Processing
- **Description**: Create a function to process multiple documents in sequence
- **Validation Criteria**:
  - `processDocuments()` function exists
  - Function processes all documents in a folder
  - Function tracks progress for each document
  - Function handles individual document failures gracefully
  - Unit tests pass for batch processing
- **Dependencies**: 4.2, 3.4

### [x] 4.5 Add Error Handling for Malformed Documents
- **Description**: Implement graceful error handling for corrupted or invalid documents
- **Validation Criteria**:
  - Malformed documents are caught and logged
  - Processing continues for other documents
  - Error messages are clear and actionable
  - Error details are included in response
  - Unit tests pass for error scenarios
- **Dependencies**: 4.4

### [x] 4.6 Create Progress Tracking for Replacements
- **Description**: Implement progress reporting during document processing
- **Validation Criteria**:
  - Progress events are emitted during processing
  - Progress includes current document and total count
  - Progress includes percentage complete
  - Progress is sent via IPC to renderer
  - UI can display progress updates
- **Dependencies**: 4.4, 3.9

---

## Phase 5: Renderer Process - UI Components

### [x] 5.1 Create Root App.vue Component
- **Description**: Create the main Vue application component
- **Validation Criteria**:
  - `src/renderer/App.vue` exists
  - Component renders without errors
  - Component uses Vuetify layout
  - Component has proper template, script, and style sections
  - Component is registered in renderer entry point
- **Dependencies**: 1.4, 1.8

### [x] 5.2 Implement Folder Selector Component
- **Description**: Create a component for folder selection and display
- **Validation Criteria**:
  - `src/renderer/components/FolderSelector.vue` exists
  - Component displays current folder path
  - Component has a "Change Folder" button
  - Component opens folder dialog on button click
  - Component emits events for folder changes
  - Component shows error state if no .docx files found
  - Unit tests pass for component
- **Dependencies**: 5.1, 1.8

### [x] 5.3 Create Marker List Component
- **Description**: Create a component to display all detected markers
- **Validation Criteria**:
  - `src/renderer/components/MarkerList.vue` exists
  - Component displays list of markers
  - Component shows marker count
  - Component handles empty state
  - Component handles loading state
  - Component emits events for value changes
  - Unit tests pass for component
- **Dependencies**: 5.1

### [x] 5.4 Implement Marker Item Component
- **Description**: Create a component for individual marker input
- **Validation Criteria**:
  - `src/renderer/components/MarkerItem.vue` exists
  - Component displays marker identifier
  - Component has text input for value
  - Component shows marker status (new/removed/active)
  - Component handles value changes
  - Component handles keyboard events (tab, enter)
  - Component emits events for value updates
  - Unit tests pass for component
- **Dependencies**: 5.3

### [x] 5.5 Create Document List Component
- **Description**: Create a component to display scanned documents
- **Validation Criteria**:
  - `src/renderer/components/DocumentList.vue` exists
  - Component displays list of .docx files
  - Component shows document count
  - Component handles empty state
  - Component handles loading state
  - Unit tests pass for component
- **Dependencies**: 5.1

### [x] 5.6 Implement Prefix Input Component
- **Description**: Create a component for configuring marker prefix
- **Validation Criteria**:
  - `src/renderer/components/PrefixInput.vue` exists
  - Component displays current prefix
  - Component has text input for prefix
  - Component validates prefix is non-empty
  - Component emits events for prefix changes
  - Component triggers rescan on prefix change
  - Unit tests pass for component
- **Dependencies**: 5.1

### 5.7 Add Loading States to Components
- **Description**: Implement loading indicators for async operations
- **Validation Criteria**:
  - Loading spinner is shown during folder scan
  - Loading spinner is shown during replacement
  - Loading states are visually clear
  - Loading states don't block UI interaction unnecessarily
- **Dependencies**: 5.2, 5.3, 5.5

### 5.8 Add Error States to Components
- **Description**: Implement error display and handling in components
- **Validation Criteria**:
  - Error messages are displayed inline
  - Error messages are clear and actionable
  - Error states have appropriate styling
  - Error states can be dismissed
  - Components recover from errors appropriately
- **Dependencies**: 5.2, 5.3, 5.5

### 5.9 Implement Responsive Layout
- **Description**: Ensure UI adapts to different window sizes
- **Validation Criteria**:
  - Layout works at minimum window size (800x600)
  - Layout works at larger window sizes
  - Components resize appropriately
  - Scrollbars appear when needed
  - No horizontal overflow on normal content
- **Dependencies**: 5.1, 5.2, 5.3, 5.5

---

## Phase 6: Renderer Process - State Management

### 6.1 Create Composable for Marker Management
- **Description**: Implement `useMarkers` composable for marker state
- **Validation Criteria**:
  - `src/renderer/composables/useMarkers.ts` exists
  - Composable manages marker list state
  - Composable provides functions to update marker values
  - Composable tracks marker status (new/removed/active)
  - Composable persists marker values
  - Unit tests pass for composable
- **Dependencies**: 2.2, 1.8

### 6.2 Create Composable for Document Management
- **Description**: Implement `useDocuments` composable for document state
- **Validation Criteria**:
  - `src/renderer/composables/useDocuments.ts` exists
  - Composable manages document list state
  - Composable provides functions to scan documents
  - Composable tracks scan status
  - Composable communicates with main process via IPC
  - Unit tests pass for composable
- **Dependencies**: 2.2, 1.8, 3.8

### 6.3 Create Composable for Settings Management
- **Description**: Implement `useSettings` composable for app settings
- **Validation Criteria**:
  - `src/renderer/composables/useSettings.ts` exists
  - Composable manages settings state
  - Composable provides functions to save/load settings
  - Composable manages window state
  - Composable communicates with main process via IPC
  - Unit tests pass for composable
- **Dependencies**: 2.2, 1.8, 3.10

### 6.4 Implement IPC Communication Layer
- **Description**: Create a wrapper for IPC calls with error handling
- **Validation Criteria**:
  - IPC wrapper functions exist for all channels
  - Wrapper handles errors gracefully
  - Wrapper provides type-safe calls
  - Wrapper includes timeout handling
  - Wrapper logs IPC calls for debugging
  - Unit tests pass for IPC layer
- **Dependencies**: 2.3, 1.8

### 6.5 Add State Persistence Logic
- **Description**: Implement auto-save of marker values
- **Validation Criteria**:
  - Marker values are saved on change
  - Save is debounced to avoid excessive writes
  - Save errors are handled gracefully
  - Save status is indicated to user
  - Values are loaded on folder open
- **Dependencies**: 6.1, 6.4

### 6.6 Implement Marker Status Tracking
- **Description**: Track and display marker status (new/removed/active)
- **Validation Criteria**:
  - New markers are detected (not in save file)
  - Removed markers are detected (in save file but not scanned)
  - Active markers are detected (in both)
  - Status is visually indicated in UI
  - Status updates on rescan
- **Dependencies**: 6.1, 6.2

### 6.7 Add Form Validation
- **Description**: Implement validation for marker values and prefix
- **Validation Criteria**:
  - Prefix validation ensures non-empty string
  - Marker values have no validation (allow any input)
  - Validation errors are displayed inline
  - Form submission is blocked on validation errors
  - Validation runs on input change
- **Dependencies**: 6.1, 6.3

---

## Phase 7: Integration and User Flow

### 7.1 Integrate Main and Renderer Processes
- **Description**: Connect main process services with renderer UI
- **Validation Criteria**:
  - IPC communication works bidirectionally
  - Renderer can call main process functions
  - Main process can send events to renderer
  - No TypeScript errors in IPC calls
  - Integration tests pass
- **Dependencies**: 3.11, 6.4

### 7.2 Implement Folder Selection Flow
- **Description**: Complete flow for selecting a folder
- **Validation Criteria**:
  - Folder dialog opens on app launch (if no saved folder)
  - Folder dialog opens on "Change Folder" click
  - Selected folder is validated for .docx files
  - Error shown if no .docx files found
  - Folder is saved to settings
  - Documents are scanned on folder selection
- **Dependencies**: 7.1, 5.2, 6.2

### 7.3 Implement Document Scanning Flow
- **Description**: Complete flow for scanning documents and detecting markers
- **Validation Criteria**:
  - Documents are scanned on folder open
  - Markers are detected in documents
  - Markers are deduplicated
  - Save file is loaded if exists
  - Marker status is calculated
  - UI displays markers and documents
  - Loading state is shown during scan
- **Dependencies**: 7.2, 5.3, 5.5, 6.1, 6.2

### 7.4 Implement Value Entry Flow
- **Description**: Complete flow for entering replacement values
- **Validation Criteria**:
  - Marker inputs are displayed
  - Values can be entered and edited
  - Values are auto-saved
  - Empty values are allowed
  - Tab navigation works between inputs
  - Enter key moves to next input
  - First input is auto-focused
- **Dependencies**: 7.3, 5.4, 6.1

### 7.5 Implement Replacement Flow
- **Description**: Complete flow for replacing markers in documents
- **Validation Criteria**:
  - "Replace" button triggers output folder dialog
  - Output folder is validated for write access
  - Documents are copied to output folder
  - Markers are replaced with values
  - Progress is shown during replacement
  - Success message is shown on completion
  - Removed markers are cleaned up from save file
- **Dependencies**: 7.4, 4.4, 4.6, 6.4

### 7.6 Add Auto-Save Functionality
- **Description**: Implement automatic saving of marker values
- **Validation Criteria**:
  - Values are saved on input blur
  - Values are saved after debounce (500ms)
  - Save status is indicated (e.g., "Saved", "Saving...")
  - Save errors are displayed
  - Multiple rapid changes only trigger one save
- **Dependencies**: 7.4, 6.5

### 7.7 Implement Window State Persistence
- **Description**: Save and restore window size and position
- **Validation Criteria**:
  - Window size is saved on resize
  - Window position is saved on move
  - Maximized state is saved
  - Window state is restored on app launch
  - Window fits within screen bounds on restore
- **Dependencies**: 3.7, 6.3

### 7.8 Add Keyboard Navigation
- **Description**: Implement keyboard shortcuts and navigation
- **Validation Criteria**:
  - Tab moves between marker inputs
  - Enter moves to next marker input
  - Shift+Tab moves to previous input
  - Escape closes dialogs
  - Ctrl/Cmd+S saves values
  - Keyboard navigation works throughout app
- **Dependencies**: 7.4, 5.4

---

## Phase 8: Polish and Refinement

### 8.1 Add Visual Feedback for All Actions
- **Description**: Provide visual feedback for user interactions
- **Validation Criteria**:
  - Buttons have hover and active states
  - Inputs have focus states
  - Actions show loading indicators
  - Success actions show confirmation
  - Error actions show error messages
  - All feedback is visually clear
- **Dependencies**: 7.5

### 8.2 Implement Toast Notifications
- **Description**: Add toast notifications for non-critical information
- **Validation Criteria**:
  - Toast component exists
  - Success toasts are shown for completed actions
  - Error toasts are shown for failed actions
  - Info toasts are shown for informational messages
  - Toasts auto-dismiss after timeout
  - Toasts can be manually dismissed
  - Multiple toasts stack properly
- **Dependencies**: 8.1

### 8.3 Add Confirmation Dialogs
- **Description**: Add confirmation dialogs for destructive actions
- **Validation Criteria**:
  - Confirmation dialog exists
  - Dialog is shown before overwriting files
  - Dialog is shown before clearing values
  - Dialog has "Confirm" and "Cancel" buttons
  - Dialog action can be cancelled
  - Dialog is accessible via keyboard
- **Dependencies**: 8.2

### 8.4 Improve Error Messages
- **Description**: Make error messages clear and actionable
- **Validation Criteria**:
  - Error messages are user-friendly
  - Error messages explain what went wrong
  - Error messages suggest how to fix
  - Error messages are consistent in tone
  - Technical errors are translated to user language
- **Dependencies**: 8.2

### 8.5 Add Loading Indicators
- **Description**: Implement progress indicators for long-running operations
- **Validation Criteria**:
  - Progress bar is shown during replacement
  - Progress percentage is displayed
  - Current document being processed is shown
  - Spinner is shown during folder scan
  - Loading states are visually clear
  - Loading states don't block UI
- **Dependencies**: 7.5, 4.6

### 8.6 Implement Undo/Redo (if feasible)
- **Description**: Add undo/redo functionality for value changes
- **Validation Criteria**:
  - Undo restores previous value
  - Redo restores undone value
  - Undo/redo works for multiple changes
  - Undo/redo history is limited (e.g., 50 actions)
  - Keyboard shortcuts work (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z)
  - Undo/redo buttons are available
- **Dependencies**: 7.4

### 8.7 Add Keyboard Shortcuts
- **Description**: Implement additional keyboard shortcuts for common actions
- **Validation Criteria**:
  - Ctrl/Cmd+O opens folder dialog
  - Ctrl/Cmd+R triggers replacement
  - Ctrl/Cmd+N changes folder
  - Ctrl/Cmd+, opens settings
  - F1 opens help
  - Shortcuts are documented in UI
  - Shortcuts don't conflict with browser/system shortcuts
- **Dependencies**: 7.8

---

## Phase 9: Testing

### 9.1 Write Unit Tests for Scanner Service
- **Description**: Create comprehensive unit tests for document scanner
- **Validation Criteria**:
  - Tests for folder scanning exist
  - Tests for .docx parsing exist
  - Tests for marker detection exist
  - Tests for edge cases exist (empty folder, no .docx files)
  - Tests for error handling exist
  - All tests pass
  - Code coverage >80% for scanner service
- **Dependencies**: 3.3

### 9.2 Write Unit Tests for Replacement Engine
- **Description**: Create comprehensive unit tests for replacement logic
- **Validation Criteria**:
  - Tests for marker replacement exist
  - Tests for multiple occurrences exist
  - Tests for empty values exist
  - Tests for formatting preservation exist
  - Tests for special characters exist
  - Tests for error handling exist
  - All tests pass
  - Code coverage >80% for replacement engine
- **Dependencies**: 4.2

### 9.3 Write Unit Tests for Storage Operations
- **Description**: Create comprehensive unit tests for file storage
- **Validation Criteria**:
  - Tests for save file creation exist
  - Tests for save file reading exist
  - Tests for save file updating exist
  - Tests for invalid file handling exist
  - Tests for missing file handling exist
  - All tests pass
  - Code coverage >80% for storage service
- **Dependencies**: 3.6

### 9.4 Write Component Tests for UI Components
- **Description**: Create component tests for all Vue components
- **Validation Criteria**:
  - Tests for MarkerList component exist
  - Tests for MarkerItem component exist
  - Tests for FolderSelector component exist
  - Tests for DocumentList component exist
  - Tests for PrefixInput component exist
  - Tests for App component exist
  - All tests pass
  - Code coverage >80% for components
- **Dependencies**: 5.9

### 9.5 Write Integration Tests for User Flows
- **Description**: Create integration tests for complete user workflows
- **Validation Criteria**:
  - Tests for folder selection flow exist
  - Tests for document scanning flow exist
  - Tests for value entry flow exist
  - Tests for replacement flow exist
  - Tests for state persistence exist
  - All tests pass
- **Dependencies**: 7.5

### 9.6 Write E2E Tests for Critical Paths
- **Description**: Create end-to-end tests for critical user journeys
- **Validation Criteria**:
  - E2E test for first-time user flow exists
  - E2E test for returning user flow exists
  - E2E test for prefix change flow exists
  - E2E test for error handling flow exists
  - All tests pass
  - Tests run on CI/CD
- **Dependencies**: 9.5

### 9.7 Add Test Fixtures and Mock Data
- **Description**: Create test fixtures and mock data for testing
- **Validation Criteria**:
  - Sample .docx files with markers exist in test fixtures
  - Mock save files exist
  - Mock IPC handlers exist
  - Test data covers various scenarios
  - Fixtures are well-documented
- **Dependencies**: 9.1

### 9.8 Set Up CI/CD for Automated Testing
- **Description**: Configure automated testing pipeline
- **Validation Criteria**:
  - CI/CD pipeline is configured (GitHub Actions, GitLab CI, etc.)
  - Unit tests run on every push
  - Integration tests run on every push
  - E2E tests run on every PR
  - Test results are reported
  - Build fails if tests fail
- **Dependencies**: 9.6

---

## Phase 10: Documentation and Deployment

### 10.1 Write User Documentation
- **Description**: Create comprehensive user documentation
- **Validation Criteria**:
  - Installation guide exists
  - Getting started guide exists
  - Feature documentation exists
  - FAQ section exists
  - Troubleshooting guide exists
  - Documentation is clear and easy to follow
  - Documentation includes screenshots
- **Dependencies**: 7.5

### 10.2 Create README with Setup Instructions
- **Description**: Create project README with setup and development instructions
- **Validation Criteria**:
  - README.md exists in project root
  - Project description is clear
  - Installation instructions are provided
  - Development setup instructions are provided
  - Build instructions are provided
  - Contributing guidelines are included
  - License information is included
- **Dependencies**: 1.7

### 10.3 Add In-App Help or Tooltips
- **Description**: Add contextual help within the application
- **Validation Criteria**:
  - Help button exists in UI
  - Tooltips exist for key UI elements
  - Help modal/dialog exists
  - Help content is clear and concise
  - Help is accessible via keyboard (F1)
- **Dependencies**: 8.7

### 10.4 Configure Build for Different Platforms
- **Description**: Set up build configuration for Windows, macOS, and Linux
- **Validation Criteria**:
  - Build configuration for Windows exists
  - Build configuration for macOS exists
  - Build configuration for Linux exists
  - Build scripts work for all platforms
  - Build artifacts are generated correctly
- **Dependencies**: 1.7

### 10.5 Create Application Icons
- **Description**: Design and create application icons for all platforms
- **Validation Criteria**:
  - Icon files exist in `public/icons/`
  - Windows .ico icon exists
  - macOS .icns icon exists
  - Linux .png icon exists
  - Icons are consistent in design
  - Icons meet platform guidelines
- **Dependencies**: None

### 10.6 Set Up Code Signing (if needed)
- **Description**: Configure code signing for distribution
- **Validation Criteria**:
  - Code signing certificate is obtained (if applicable)
  - Windows code signing is configured
  - macOS code signing is configured
  - Signed builds are generated
  - Signed installs work without warnings
- **Dependencies**: 10.4

### 10.7 Create Installer Packages
- **Description**: Create installers for all target platforms
- **Validation Criteria**:
  - Windows installer (.exe or .msi) is created
  - macOS installer (.dmg) is created
  - Linux packages (.deb, .rpm, .AppImage) are created
  - Installers work correctly
  - Installers include proper metadata
- **Dependencies**: 10.4, 10.5

### 10.8 Test on Target Platforms
- **Description**: Perform thorough testing on all target platforms
- **Validation Criteria**:
  - Application runs on Windows 10/11
  - Application runs on macOS (Intel and Apple Silicon)
  - Application runs on Linux (Ubuntu, Fedora, Debian)
  - All features work on all platforms
  - Platform-specific issues are resolved
  - Manual testing checklist is completed
- **Dependencies**: 10.7

---

## Summary

This TODO document breaks down the 10 development phases from PLAN.md into **88 granular, actionable steps**. Each step includes:

- **Clear description** of what needs to be done
- **Validation criteria** to verify successful completion
- **Dependencies** on previous steps

The steps are organized in logical execution order, with dependencies clearly marked. This structure allows for:

- Incremental progress tracking
- Parallel work on independent steps
- Clear validation at each stage
- Easy identification of blockers

**Total Steps**: 88
**Estimated Completion**: Each step can be completed independently, making it easy to track progress and manage the implementation timeline.