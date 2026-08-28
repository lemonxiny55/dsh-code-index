/**
 * dsh-code-index — DeepSeek Harness bundle entry.
 *
 * Registers four model-visible tools (code_index / code_symbols /
 * code_search / code_map) backed by a tree-sitter symbol index, and
 * injects a bounded auto-updating repo map for the default workspace
 * into the system prompt.
 */

type Disposer = void | (() => void)

/** Minimal structural Context; the real @deepseek-ai/cordis type is a
 *  runtime dependency we intentionally do not import in the bundle entry. */
interface MinimalContext {
  effect(fn: () => Disposer): void
  tools: { register(t: unknown): () => void }
  systemPrompt: {
    section(section: {
      name: string
      order: number
      text: string | ((context: unknown) => string)
    }): () => void
  }
}

export const name = 'dsh-code-index'

// Public API surface (consumable by other bundles / tests).
export { buildIndex, buildIndexWithCache, findRepoRoot } from './buildIndex.js'
export { extractSymbols, extractAll, languageForFile, parseFileToSymbols } from './extract.js'
export { scanRepo, DEFAULT_EXCLUDED_DIRS, SUPPORTED_EXTS } from './scan.js'
export { loadIndex, saveIndex, defaultCachePath, CACHE_DIR_NAME } from './store.js'
export { symbolCount } from './types.js'
export type { RepoIndex, IndexedFile, SymbolInfo, SymbolKind, IndexOptions } from './types.js'
export { searchSymbols, renderHit } from './search.js'
export { rankRepoMap, renderRepoMap, scoreFile } from './repomap.js'
export { tools } from './tools.js'

import { getIndex, invalidateIndexCache, tools } from './tools.js'
import { findRepoRoot } from './buildIndex.js'
import { rankRepoMap, renderRepoMap } from './repomap.js'
import { symbolCount } from './types.js'
import { applyConfig, getConfig, type PluginConfig } from './config.js'

export const inject = ['tools', 'systemPrompt'] as const

export function apply(ctx: MinimalContext, pluginConfig?: PluginConfig) {
  applyConfig(pluginConfig)
  invalidateIndexCache()
  ctx.effect(() => {
    const disposers: Array<() => void> = []
    console.log('[dsh-code-index] plugin loaded')
    for (const tool of tools) {
      disposers.push(ctx.tools.register(tool))
      console.log(`[dsh-code-index] registered tool: ${tool.name}`)
    }

    // Auto-inject a bounded repo map for the DEFAULT workspace (the dsh
    // launch directory, per the harness docs). Multi-workspace web sessions
    // should rely on the `code_map` tool, which resolves the per-session cwd.
    let cached: { root: string; at: number; text: string } | null = null

    async function warmMap(): Promise<void> {
      const now = Date.now()
      const cfg = getConfig()
      try {
        const root = await findRepoRoot(process.cwd())
        if (!root) {
          cached = { root: '', at: now, text: '' }
          return
        }
        const index = await getIndex(root)
        const text = renderRepoMap(
          rankRepoMap(index, { topFiles: cfg.mapTopFiles }),
          { maxChars: cfg.mapMaxChars },
        )
        const stats = symbolCount(index)
        cached = {
          root: index.root,
          at: Date.now(),
          text: text ? `${text}\n\n(summary: ${index.files.length} files, ${stats} symbols)` : '',
        }
      } catch {
        cached = { root: '', at: now, text: '' } // never let injection fail the boot
      }
    }

    // Warm eagerly at load so the first assembly already has the map.
    void warmMap()

    if (getConfig().autoInject) {
      disposers.push(ctx.systemPrompt.section({
        name: 'code-index:repo-map',
        order: 60, // before tool guidance (100–199), after persona (0)
        text: () => {
          const now = Date.now()
          if (cached && now - cached.at < getConfig().mapTtlMs) return cached.text
          void warmMap()
          return cached?.text ?? ''
        },
      }))
    }

    return () => {
      const errors: unknown[] = []
      for (const dispose of disposers.reverse()) {
        try {
          dispose()
        } catch (error) {
          errors.push(error)
        }
      }
      console.log('[dsh-code-index] plugin unloaded')
      if (errors.length > 0) throw new AggregateError(errors, 'failed to unload dsh-code-index')
    }
  })
}
