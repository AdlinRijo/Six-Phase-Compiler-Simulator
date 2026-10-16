import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/@codemirror/') || id.includes('/node_modules/@lezer/')) return 'editor';
          if (id.includes('/node_modules/animejs/')) return 'animation';
        }
      }
    }
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js']
  }
});
