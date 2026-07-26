import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: resolve(__dirname, 'src/index.js'),
      name: 'MobileModeMGK',
      fileName: () => 'mobile-mode-mgk.js',
      formats: ['es']
    },
    rollupOptions: {
      external: [],
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'mobile-mode-mgk.css';
          }
          return assetInfo.name;
        }
      }
    }
  }
});
