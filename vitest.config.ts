import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Keep ignored PoC copies and package-manager caches out of the test gate.
  test: {
    include: ['tests/**/*.spec.ts'],
    // Git/watcher fixtures perform real IO; avoid a process per logical CPU.
    maxWorkers: 4,
  },
})
