import { defineConfig } from 'tsup';
import { chmodSync, existsSync } from 'fs';
import { createPluginDiscoveryPlugin } from './build-plugins/plugin-discovery.js';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  format: ['esm'],
  target: 'node18',
  platform: 'node',
  outDir: 'build',
  clean: true,
  sourcemap: true, // Enable source maps for debugging
  dts: {
    entry: {
      index: 'src/index.ts',
    },
  },
  splitting: false,
  shims: false,
  treeshake: true,
  minify: false,
  esbuildPlugins: [createPluginDiscoveryPlugin()],
  onSuccess: async () => {
    console.log('✅ Build complete!');

    // Set executable permissions for built files
    if (existsSync('build/index.js')) {
      chmodSync('build/index.js', '755');
    }
  },
});