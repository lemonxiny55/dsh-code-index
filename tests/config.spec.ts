import { describe, expect, it } from 'vitest'
import { applyConfig, getConfig } from '../src/config.js'

describe('config', () => {
  it('exposes defaults when no partial is given', () => {
    applyConfig()
    expect(getConfig()).toMatchObject({
      excludeDirs: [],
      mapTopFiles: 24,
      mapMaxChars: 3200,
      mapTtlMs: 60_000,
      autoInject: true,
    })
  })

  it('merges a partial and keeps excludeDirs append-only', () => {
    applyConfig({ excludeDirs: ['vendor'], mapTopFiles: 10, autoInject: false, mapTtlMs: 5_000 })
    const cfg = getConfig()
    expect(cfg.excludeDirs).toEqual(['vendor'])
    expect(cfg.mapTopFiles).toBe(10)
    expect(cfg.mapTtlMs).toBe(5_000)
    expect(cfg.autoInject).toBe(false)
  })

  it('coerces wrong shapes back to defaults', () => {
    applyConfig({
      mapTopFiles: -3,
      mapMaxChars: 'nope' as unknown as number,
      mapTtlMs: 5, // below the 1s floor: a sub-second poll loop would spin
    })
    expect(getConfig()).toMatchObject({ mapTopFiles: 24, mapMaxChars: 3200, mapTtlMs: 60_000 })
  })
})
