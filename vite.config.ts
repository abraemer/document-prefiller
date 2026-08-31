/// <reference types="vite-plugin-electron/electron-env" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron'
import { notBundle } from 'vite-plugin-electron/plugin'
import renderer from 'vite-plugin-electron-renderer'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// ESM shim: Vite 7+ loads configs with the native ESM loader where __dirname
// is not defined (same pattern as src/main/index.ts:7)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vitejs.dev/config/
export default defineConfig({
  root: 'src/renderer',
  base: './',
  publicDir: path.resolve(__dirname, 'public'),
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    vue(),
    electron([
      {
        // Main process entry point
        entry: path.resolve(__dirname, 'src/main/index.ts'),
        onstart(args) {
          // Start Electron from the project root (the dev server root is src/renderer)
          args.startup(undefined, { cwd: __dirname })
        },
        vite: {
          plugins: [notBundle()],
          build: {
            outDir: path.resolve(__dirname, 'dist-electron/main'),
            emptyOutDir: true,
            rolldownOptions: {
              output: {
                entryFileNames: '[name].js',
              },
            },
          },
          resolve: {
            alias: {
              '@': path.resolve(__dirname, './src'),
            },
          },
        },
      },
      {
        // Preload script entry point
        entry: path.resolve(__dirname, 'src/preload/index.ts'),
        onstart(args) {
          // Notify the renderer process that the preload script is ready;
          // on first build start Electron from the project root
          if (process.electronApp) {
            args.reload()
          } else {
            args.startup(undefined, { cwd: __dirname })
          }
        },
        vite: {
          build: {
            outDir: path.resolve(__dirname, 'dist-electron/preload'),
            emptyOutDir: true,
            rolldownOptions: {
              output: {
                entryFileNames: '[name].mjs',
              },
            },
          },
        },
      },
    ]),
    renderer(),
  ],
})
