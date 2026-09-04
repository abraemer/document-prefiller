import type { PlatformAPI } from './platform';

/**
 * The single Window interface augmentation for window.api.
 *
 * Declared HERE and nowhere else: a second `interface Window { api: ... }`
 * augmentation anywhere in the repo conflicts with this one (TS2717 —
 * subsequent property declarations must have the same type) under vue-tsc.
 * The augmentation sits on one line so a same-line grep for the
 * declaration also matches the Window interface it declares.
 */
declare global { interface Window { api: PlatformAPI } }
