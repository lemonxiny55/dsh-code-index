/** Plugin configuration: merged once at apply time, read wherever needed. */

import type { IndexOptions } from './types.js'

export interface PluginConfig {
  /** Extra directories to exclude from indexing (appended to defaults). */
  excludeDirs?: string[]
  /** Max files in the ranked repo map (code_map / auto section). */
  mapTopFiles?: number
  /** Hard char cap for rendered maps. */
  mapMaxChars?: number
  /** Refresh interval for the auto-injected map (ms, min 1000). */
  mapTtlMs?: number
  /** Set false to disable the auto-injected system section. */
  autoInject?: boolean
}

interface EffectiveConfig {
  excludeDirs: string[]
  mapTopFiles: number
  mapMaxChars: number
  mapTtlMs: number
  autoInject: boolean
}

const DEFAULTS: EffectiveConfig = {
  excludeDirs: [],
  mapTopFiles: 24,
  mapMaxChars: 3200,
  mapTtlMs: 60_000,
  autoInject: true,
}

const state: { current: EffectiveConfig } = { current: { ...DEFAULTS } }

/** Merge a plugin-provided partial config over the defaults (idempotent). */
export function applyConfig(partial?: PluginConfig): void {
  state.current = {
    ...DEFAULTS,
    ...(partial ?? {}),
    excludeDirs: [...DEFAULTS.excludeDirs, ...(partial?.excludeDirs ?? [])],
  }
  // Coerce obviously wrong inputs.
  if (!Number.isFinite(state.current.mapTopFiles) || state.current.mapTopFiles < 1) {
    state.current.mapTopFiles = DEFAULTS.mapTopFiles
  }
  if (!Number.isFinite(state.current.mapMaxChars) || state.current.mapMaxChars < 200) {
    state.current.mapMaxChars = DEFAULTS.mapMaxChars
  }
  if (!Number.isFinite(state.current.mapTtlMs) || state.current.mapTtlMs < 1_000) {
    state.current.mapTtlMs = DEFAULTS.mapTtlMs
  }
}

export function getConfig(): Readonly<EffectiveConfig> {
  return state.current
}

/** Map the effective config onto the index pipeline options. */
export function indexOptions(): IndexOptions {
  return { excludeDirs: state.current.excludeDirs }
}