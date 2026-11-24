import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { icuFoliaDataPlugin } from './dev/icuFolia/icuFoliaDataPlugin.mjs';

const pkgRoot = process.cwd();
const r = (...segs: string[]) => path.resolve(pkgRoot, ...segs);

export default defineConfig({
  base: './',
  publicDir: false,
  resolve: {
    dedupe: ['react', 'react-dom', 'three', 'pixi.js', 'framer-motion', 'zustand', 'i18next', 'react-i18next'],
    alias: {
      '@': r('src'),
      'music-metadata': r('src/lxmineStage/emptyStub.ts'),
      '@applemusic-like-lyrics/ttml': r('src/lxmineStage/emptyStub.ts'),
      'file-type/core': r('src/lxmineStage/emptyStub.ts'),
      'file-type': r('src/lxmineStage/emptyStub.ts'),
      'i18next-browser-languagedetector': r('src/lxmineStage/emptyStub.ts'),
      'lucide-react/dynamicIconImports': r('src/lxmineStage/lucideLite.ts'),
    },
  },
  plugins: [react(), icuFoliaDataPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify('1.3.0'),
    __BUILD_COMMIT__: JSON.stringify('lxmine'),
    __BUILD_KIND__: JSON.stringify('release'),
    __BUILD_REPO__: JSON.stringify('lxmine'),
    __COMMIT_HASH__: JSON.stringify('lxmine'),
  },
  build: {
    outDir: '../../apps/desktop/public/mine-stage/folia-stage',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      input: 'index.html',
    },
  },
});
