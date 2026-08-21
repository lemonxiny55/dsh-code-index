/** Plugin configuration: merged once at apply time, read wherever needed. */

import type { IndexOptions } from './types.js'

export interface PluginConfig {
  /** Extra directories to exclude from indexing (appended to defaults). */
  excludeDirs?: string[]
  /** Max files in the ranked repo map (code_map / auto section). */
  mapTopFiles?: number
  /** Hard char cap for rendered maps. */
  mapMaxChars?: number
  /** Set false to disable the auto-injected system section. */
  autoInject?: boolean
}

interface EffectiveConfig {
  excludeDirs: string[]
  mapTopFiles: number
  mapMaxChars: number
  autoInject: boolean
}

const DEFAULTS: EffectiveConfig = {
  excludeDirs: [],
  mapTopFiles: 24,
  mapMaxChars: 3200,
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
}

export function getConfig(): Readonly<EffectiveConfig> {
  return state.current
}

/** Map the effective config onto the index pipeline options. */
export function indexOptions(): IndexOptions {
  return { excludeDirs: state.current.excludeDirs }
}