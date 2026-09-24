/** Host-side settings namespace for the plugin's user-editable config. */

import Schema from '@deepseek-ai/schemastery'
import type { PluginConfig } from './config.js'
export const SETTINGS_NAMESPACE = 'code-index'

export const settingsSchema = Schema.object({
  excludeDirs: Schema.array(Schema.string()).default([]),
  mapTopFiles: Schema.number().default(24),
  mapMaxChars: Schema.number().default(3200),
  mapTtlMs: Schema.number().default(60_000),
  autoInject: Schema.boolean().default(true),
  codeHealth: Schema.boolean().default(false),
  toolSurface: Schema.string().default('full'),
  externalWatch: Schema.boolean().default(true),
  watchDebounceMs: Schema.number().default(120),
})

interface SettingsScopeLike<T> {
  get(): T
  watch(callback: (next: T, prev: T) => void | Promise<void>): () => void
}

interface SettingsServiceLike {
  register<T>(ns: string, schema: unknown, options?: { base?: Partial<T> }): SettingsScopeLike<T>
  configure?(options: { auto: boolean }, fiber?: unknown): void | (() => void)
}

/**
 * Register the `code-index` settings namespace when a settings provider is
 * mounted, and mirror every resolved change into the plugin's live config.
 * Absent provider = the composed config stands, exactly as before.
 */
export function registerSettings(
  getService: (name: string) => unknown,
  pluginConfig: PluginConfig | undefined,
  onResolved: (config: PluginConfig) => void,
  fiber?: unknown,
): (() => void) | undefined {
  const service = getService('settings') as SettingsServiceLike | undefined
  if (!service) return undefined
  // Current DSH renders volatile plugin fields as config forms. Configure the
  // legacy provider only to disable its automatic schema editor; the config
  // callback is fed by loader/volatile-update in the bundle entry.
  if (service.configure) {
    const dispose = service.configure({ auto: false }, fiber)
    onResolved(pluginConfig ?? {})
    return typeof dispose === 'function' ? dispose : undefined
  }
  const scope = service.register<PluginConfig>(SETTINGS_NAMESPACE, settingsSchema, {
    base: pluginConfig ?? {},
  })
  onResolved(scope.get())
  return scope.watch((next) => {
    onResolved(next)
  })
}
