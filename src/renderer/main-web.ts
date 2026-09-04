// Web entry point — mirrors src/renderer/main.ts but installs the browser
// window.api shim before the app mounts.
//
// Import ordering is load-bearing:
// - `installWebApi` is imported STATICALLY because its module side effect
//   assigns window.api synchronously; App.vue's onMounted touches window.api
//   immediately, so the shim must exist before any app code runs. A dynamic
//   import of './main' inside the ready chain guarantees this ordering — a
//   static `import './main'` would hoist both modules and race the install.
// - The app is imported DYNAMICALLY, chained on the adapter's `ready`
//   promise, so the synchronous workspace-name cache is guaranteed populated
//   (IndexedDB load) before the app mounts. `ready` never rejects (failures
//   settle it with an empty cache), so a plain .then() chain suffices.
// - No top-level await: Vite's default build target rejects TLA, and the
//   .then() chain is the standard-compliant equivalent.

import { installWebApi } from './platform/web'

void installWebApi().ready.then(() => import('./main'))
