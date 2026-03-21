import { defineConfig } from 'vite';

export default defineConfig({
  base: '/setup/',
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:2243',
    },
  },
});
