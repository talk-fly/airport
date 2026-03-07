import { build } from 'esbuild';

await build({
  entryPoints: ['src/main/server.ts'],
  outfile: 'dist/backend.js',
  platform: 'node',
  format: 'cjs',
  bundle: true,
  external: ['node-pty', 'bufferutil', 'utf-8-validate'],
  target: 'node20',
  sourcemap: false,
});

console.log('Backend built → dist/backend.js');
