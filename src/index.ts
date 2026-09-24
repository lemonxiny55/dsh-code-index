/**
 * dsh-code-index — DeepSeek Harness bundle entry.
 *
 * Registers model-visible tools (code_index / code_symbols / code_search /
 * code_map / code_refs / code_change_context / code_context) plus an opt-in code_health
 * (config.codeHealth) backed by a tree-sitter symbol + call-graph index,
 * and injects a bounded auto-updating repo map for the default workspace
 * into the system prompt.
 */

type Disposer = void | (() => void)

/** Minimal structural Context; the real @deepseek-ai/cordis type is a
 *  runtime dependency we intentionally do not import in the bundle entry. */
interface MinimalContext {
  effect(fn: () => Disposer): void
  tools: { register(t: unknown): () => void }
  get?(name: string): unknown
  inject?(deps: string[], run: (ctx: MinimalContext) => void): unknown
  on?(event: string, listener: () => void): () => void
  fiber?: unknown
  systemPrompt: {
    section(section: {
      name: string
      order: number
      text: string | ((context: unknown) => string)
    }): () => void
  }
}

interface PromptContext {
  agent?: { session?: { header?: { cwd?: string } } }
  session?: { header?: { cwd?: string } }
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
export { symbolRefs, buildSymbolTable, callerCounts } from './refgraph.js'
export { findCycles, findOrphanModules, buildModuleGraph } from './health.js'
export { parseUnifiedDiff, readWorkingTreeDiff, readGitFileAtRef } from './git-diff.js'
export {
  buildTaskContext,
  renderTaskContext,
  routeTask,
} from './context.js'
export type {
  ContextFile,
  ContextOptions,
  ContextRelationship,
  ContextRoute,
  ContextSymbol,
  ContextTaskKind,
  TaskContextResult,
} from './context.js'
export type { DiffHunk, FileChange } from './git-diff.js'
export {
  buildChangeContext,
  changeContextInputFromArgs,
  renderChangeContext,
} from './change-context.js'
export type {
  CodeChangeContextArgs,
  ChangeContextInput,
  ChangeContextOptions,
  ChangeKind,
  ChangedSymbol,
  UnmappedChange,
  ImpactHop,
  ImpactRow,
  SymbolPath,
  ImportDependent,
  AffectedTest,
  ChangeContextResult,
} from './change-context.js'
export { tools } from './tools.js'
export { Config } from './config.js'

import { activateRepoContextManager, clearRepoContextManager, getIndex, invalidateIndexCache, tools } from './tools.js'
import { findRepoRoot } from './buildIndex.js'
import { rankRepoMap, renderRepoMap } from './repomap.js'
import { symbolCount } from './types.js'
import { applyConfig, getConfig, indexOptions, type PluginConfig } from './config.js'
import { registerSettings } from './settings.js'
import { RepoContextManager } from './repo-context.js'
import { cacheKeyForRoot } from './store.js'

export const inject = ['tools', 'systemPrompt'] as const

export function apply(ctx: MinimalContext, pluginConfig?: PluginConfig) {
  applyConfig(pluginConfig)
  invalidateIndexCache()
  ctx.effect(() => {
    const disposers: Array<() => void> = []
    const repoContexts = new RepoContextManager({
      indexOptions,
      watch: getConfig().externalWatch,
      debounceMs: getConfig().watchDebounceMs,
    })
    activateRepoContextManager(repoContexts)
    const updateConfig = (next?: PluginConfig): void => {
      applyConfig(next)
      repoContexts.reconfigure({ watch: getConfig().externalWatch, debounceMs: getConfig().watchDebounceMs })
    }
    console.log('[dsh-code-index] plugin loaded')

    // User-editable settings resolve over the composed plugin row; when a
    // settings provider is mounted, every committed change reconfigures live.
    // The provider initializes asynchronously, so wait for the service rather
    // than reading it once at load (which can precede its availability).
    if (ctx.inject) {
      const injected = ctx.inject(['settings'], (settingsCtx) => {
        const dispose = registerSettings(
          (name) => settingsCtx.get!(name),
          pluginConfig,
          (resolved) => updateConfig(resolved),
          settingsCtx.fiber,
        )
        if (dispose) disposers.push(dispose)
      })
      if (typeof injected === 'function') disposers.push(injected as () => void)
    }
    const removeVolatileListener = ctx.on?.('loader/volatile-update', () => updateConfig(pluginConfig))
    if (removeVolatileListener) disposers.push(removeVolatileListener)

    const visibleTools =
      getConfig().toolSurface === 'compact'
        ? tools.filter((tool) => ['code_index', 'code_context', 'code_health'].includes(tool.name))
        : tools
    for (const tool of visibleTools) {
      if (tool.name === 'code_health' && !getConfig().codeHealth) continue
      disposers.push(ctx.tools.register(tool))
      console.log(`[dsh-code-index] registered tool: ${tool.name}`)
    }

    // Resolve a distinct map from each DSH agent's current session context.
    const cachedMaps = new Map<string, { root: string; at: number; text: string }>()
    const saveMap = (key: string, value: { root: string; at: number; text: string }): void => {
      cachedMaps.delete(key)
      cachedMaps.set(key, value)
      while (cachedMaps.size > 4) cachedMaps.delete(cachedMaps.keys().next().value!)
    }

    async function warmMap(base: string): Promise<void> {
      const now = Date.now()
      const cfg = getConfig()
      const key = cacheKeyForRoot(base)
      try {
        const root = await findRepoRoot(base)
        if (!root) {
          saveMap(key, { root: '', at: now, text: '' })
          return
        }
        const index = await getIndex(root)
        const text = renderRepoMap(
          rankRepoMap(index, { topFiles: cfg.mapTopFiles }),
          { maxChars: cfg.mapMaxChars },
        )
        const stats = symbolCount(index)
        saveMap(key, {
          root: index.root,
          at: Date.now(),
          text: text ? `Project: ${index.root}\n${text}\n\n(summary: ${index.files.length} files, ${stats} symbols)` : '',
        })
      } catch {
        saveMap(key, { root: '', at: now, text: '' }) // never let injection fail the boot
      }
    }

    if (getConfig().autoInject) {
      disposers.push(ctx.systemPrompt.section({
        name: 'code-index:repo-map',
        order: 60, // before tool guidance (100–199), after persona (0)
        text: (rawContext) => {
          const context = rawContext as PromptContext
          const base = context.agent?.session?.header?.cwd ?? context.session?.header?.cwd ?? process.cwd()
          const key = cacheKeyForRoot(base)
          const now = Date.now()
          const cached = cachedMaps.get(key)
          if (cached && now - cached.at < getConfig().mapTtlMs) {
            saveMap(key, cached)
            return cached.text
          }
          void warmMap(base)
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
      clearRepoContextManager(repoContexts)
      void repoContexts.dispose()
      cachedMaps.clear()
      console.log('[dsh-code-index] plugin unloaded')
      if (errors.length > 0) throw new AggregateError(errors, 'failed to unload dsh-code-index')
    }
  })
}
