/// <reference types="vitest" />
/// <reference types="@testing-library/jest-dom" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}