import { describe, expect, it, vi } from 'vitest'
import { registerSettings } from '../src/settings.js'

describe('host settings integration', () => {
  it('uses current volatile-config setup and returns its lifecycle cleanup', () => {
    const dispose = vi.fn()
    const configure = vi.fn(() => dispose)
    const onResolved = vi.fn()
    const fiber = { id: 'plugin-fiber' }
    const cleanup = registerSettings(() => ({ configure }), { autoInject: false }, onResolved, fiber)

    expect(configure).toHaveBeenCalledWith({ auto: false }, fiber)
    expect(onResolved).toHaveBeenCalledWith({ autoInject: false })
    cleanup?.()
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('retains the legacy settings namespace watcher and cleanup', () => {
    const unwatch = vi.fn()
    const watch = vi.fn(() => unwatch)
    const config = { mapTopFiles: 12 }
    const onResolved = vi.fn()
    const cleanup = registerSettings(() => ({ register: () => ({ get: () => config, watch }) }), undefined, onResolved)

    expect(onResolved).toHaveBeenCalledWith(config)
    expect(watch).toHaveBeenCalledOnce()
    cleanup?.()
    expect(unwatch).toHaveBeenCalledOnce()
  })
})
