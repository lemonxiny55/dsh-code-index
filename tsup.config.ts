import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  // tsup's declaration worker injects baseUrl; TS 6 requires this scoped opt-in.
  dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
  sourcemap: true,
  clean: true,
  target: 'node22',
})
