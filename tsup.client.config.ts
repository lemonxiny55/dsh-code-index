import { defineConfig } from 'tsup'

/**
 * Browser half: a closure-factory CJS bundle the dsh web shell registers via
 * `window.__ModuleLoader__.load`. React stays external (a shell platform
 * module); everything else inlines.
 *
 * tsup/esbuild has no `intro` option, so the factory's `module`/`exports`
 * prelude must ride in the banner directly above the CommonJS body; without it
 * the emitted `module.exports` reference throws `module is not defined` at boot.
 */
export default defineConfig({
  entry: { client: 'src/client/index.tsx' },
  format: ['cjs'],
  platform: 'browser',
  target: 'es2022',
  dts: false,
  sourcemap: true,
  clean: false,
  external: ['react', 'react/jsx-runtime'],
  outDir: 'dist',
  outExtension: () => ({ js: '.js' }),
  banner: {
    js: [
      'window.__ModuleLoader__.load({ id: "dsh-code-index", factory: (require) => {',
      'var module = { exports: {} }; var exports = module.exports;',
    ].join('\n'),
  },
  footer: { js: 'return module.exports; } });' },
  esbuildOptions(options) {
    options.jsx = 'automatic'
    options.entryNames = 'client'
  },
})
