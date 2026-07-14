import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  // inlineDynamicImports: Pixi v8 auto-detects its environment via dynamic import;
  // as a split chunk it never loads in prod (app.init() hangs on a blank page).
  build: { target: 'es2022', rollupOptions: { output: { inlineDynamicImports: true } } },
  server: { host: true },
})
