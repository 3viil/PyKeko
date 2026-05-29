import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Builds ONE self-contained .html (everything inlined). Recipe lifted from the
// existing 4hws_viewer prototype: assets inlined as data URLs up to 40 MB,
// no CSS split, dynamic imports collapsed into the main chunk.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    target: 'es2020',
    assetsInlineLimit: 40 * 1024 * 1024,
    cssCodeSplit: false,
    rollupOptions: {
      output: { inlineDynamicImports: true, manualChunks: undefined },
    },
    chunkSizeWarningLimit: 50 * 1024,
  },
  esbuild: { logLevel: 'error' },
});
