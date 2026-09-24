/** Plugin configuration: merged once at apply time, read wherever needed. */

import type { IndexOptions } from './types.js'
import Schema from '@deepseek-ai/schemastery'

/** DSH 0.1.7+ renders fields marked volatile in its per-plugin config forms. */
export const Config = Schema.object({
  excludeDirs: Schema.array(Schema.string()).default([]).volatile(),
  mapTopFiles: Schema.number().default(24).volatile(),
  mapMaxChars: Schema.number().default(3200).volatile(),
  mapTtlMs: Schema.number().default(60_000).volatile(),
  autoInject: Schema.boolean().default(true).volatile(),
  codeHealth: Schema.boolean().default(false).volatile(),
  toolSurface: Schema.string().default('full').volatile(),
  externalWatch: Schema.boolean().default(true).volatile(),
  watchDebounceMs: Schema.number().default(120).volatile(),
})

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
  /** Register the code_health tool (circles / orphans). Off by default. */
  codeHealth?: boolean
  /** Experimental tool surface; full preserves the complete v0.6 API. */
  toolSurface?: 'full' | 'compact'
  /** Observe source changes made by editors and external tools. */
  externalWatch?: boolean
  /** Coalesce filesystem events before refreshing affected files. */
  watchDebounceMs?: number
}

interface EffectiveConfig {
  excludeDirs: string[]
  mapTopFiles: number
  mapMaxChars: number
  mapTtlMs: number
  autoInject: boolean
  codeHealth: boolean
  toolSurface: 'full' | 'compact'
  externalWatch: boolean
  watchDebounceMs: number
}

const DEFAULTS: EffectiveConfig = {
  excludeDirs: [],
  mapTopFiles: 24,
  mapMaxChars: 3200,
  mapTtlMs: 60_000,
  autoInject: true,
  codeHealth: false,
  toolSurface: 'full',
  externalWatch: true,
  watchDebounceMs: 120,
}

const state: { current: EffectiveConfig } = { current: { ...DEFAULTS } }

/** Merge a plugin-provided partial config over the defaults (idempotent). */
export function applyConfig(partial?: PluginConfig): void {
  const resolved = partial
    ? Object.fromEntries(Object.entries(partial).map(([key, value]) => [key, unwrapVolatile(value)])) as PluginConfig
    : undefined
  state.current = {
    ...DEFAULTS,
    ...(resolved ?? {}),
    excludeDirs: [...DEFAULTS.excludeDirs, ...(resolved?.excludeDirs ?? [])],
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
  if (state.current.toolSurface !== 'full' && state.current.toolSurface !== 'compact') {
    state.current.toolSurface = DEFAULTS.toolSurface
  }
  if (typeof state.current.externalWatch !== 'boolean') state.current.externalWatch = DEFAULTS.externalWatch
  if (!Number.isFinite(state.current.watchDebounceMs) || state.current.watchDebounceMs < 20) {
    state.current.watchDebounceMs = DEFAULTS.watchDebounceMs
  }
}

function unwrapVolatile<T>(value: T): T {
  if (typeof value !== 'object' || value === null || !('get' in value) || typeof value.get !== 'function') {
    return value
  }
  return value.get() as T
}

export function getConfig(): Readonly<EffectiveConfig> {
  return state.current
}

/** Map the effective config onto the index pipeline options. */
export function indexOptions(): IndexOptions {
  return { excludeDirs: state.current.excludeDirs }
}
