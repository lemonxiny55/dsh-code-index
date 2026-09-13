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
})

interface SettingsScopeLike<T> {
  get(): T
  watch(callback: (next: T, prev: T) => void | Promise<void>): () => void
}

interface SettingsServiceLike {
  register<T>(ns: string, schema: unknown, options?: { base?: Partial<T> }): SettingsScopeLike<T>
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
): void {
  const service = getService('settings') as SettingsServiceLike | undefined
  if (!service) return
  const scope = service.register<PluginConfig>(SETTINGS_NAMESPACE, settingsSchema, {
    base: pluginConfig ?? {},
  })
  onResolved(scope.get())
  scope.watch((next) => {
    onResolved(next)
  })
}
