import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 3000,
    proxy: {
      '/api': 'http://127.0.0.1:8080',
    },
  },
  build: {
    outDir: 'dist',
    // Production serves dist directly. Keep the current release available
    // until Vite writes the next index and its fingerprinted assets.
    emptyOutDir: false,
    // Because the directory is never emptied, every past release stays on disk
    // and a browser holding a cached index.html keeps being served the assets
    // that index names — which is how a fixed stylesheet can go on rendering
    // the old broken layout. The postbuild step prunes those leftovers, and it
    // needs the manifest to know which files the new release actually uses.
    manifest: true,
    sourcemap: false,
  },
})
