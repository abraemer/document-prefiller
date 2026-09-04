import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'
import { existsSync, renameSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// ESM shim: Vite 7+ loads configs with the native ESM loader where __dirname
// is not defined (same pattern as vite.config.ts and src/main/index.ts:7)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Vite derives the output HTML filename from the source basename, so the
// single web entry (index-web.html, todo 13) builds to dist-web/index-web.html.
// Rename it to index.html so the bundle can be served at any host root
// (vite preview /, document-prefiller.braemer.me) without a second input.
function renameWebEntryToIndex(): Plugin {
  return {
    name: 'rename-web-entry-to-index',
    writeBundle() {
      const from = path.resolve(__dirname, 'dist-web/index-web.html')
      const to = path.resolve(__dirname, 'dist-web/index.html')
      // existsSync guard keeps the hook idempotent under build --watch re-runs
      if (existsSync(from)) renameSync(from, to)
    },
  }
}

// Web-only build config: bundles the browser variant (index-web.html) to
// dist-web/. No electron plugins, no renderer() — the desktop pipeline
// (vite.config.ts) stays the single source for the Electron build.
// https://vitejs.dev/config/
export default defineConfig({
  root: 'src/renderer',
  base: './',
  publicDir: path.resolve(__dirname, 'public'),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [vue(), renameWebEntryToIndex()],
  build: {
    outDir: path.resolve(__dirname, 'dist-web'),
    // outDir lies outside root — Vite refuses to empty it without this flag
    emptyOutDir: true,
    rolldownOptions: {
      input: {
        index: path.resolve(__dirname, 'src/renderer/index-web.html'),
      },
    },
  },
})
