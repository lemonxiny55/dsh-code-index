import { realpath } from 'node:fs/promises'
import path from 'node:path'
import chokidar, { type FSWatcher } from 'chokidar'
import { buildIndexWithCache } from './buildIndex.js'
import { DEFAULT_EXCLUDED_DIRS, isGitIgnoredPath, SUPPORTED_EXTS, type GitIgnoreMatcherCache } from './scan.js'
import { cacheKeyForRoot } from './store.js'
import type { IndexOptions, RepoIndex } from './types.js'

export interface RepoContext {
  readonly root: string
  index: RepoIndex | null
  lastRefreshAt: number
  readonly dirtyFiles: Set<string>
  readonly ignoreMatcherCache: GitIgnoreMatcherCache
  watcher: FSWatcher | null
  debounceTimer: ReturnType<typeof setTimeout> | null
  refresh: Promise<RepoIndex> | null
  disposed: boolean
  generation: number
  lastUsedAt: number
}

export interface RepoContextManagerOptions {
  indexOptions: () => IndexOptions
  watch?: boolean
  debounceMs?: number
  maxContexts?: number
  onRefresh?: (root: string, index: RepoIndex) => void
}

function ignoredRelativePath(rel: string, options: IndexOptions): boolean {
  const components = rel.split(/[\\/]+/).filter(Boolean)
  const excluded = new Set([...DEFAULT_EXCLUDED_DIRS, ...(options.excludeDirs ?? [])])
  return components.some((component) => excluded.has(component))
}

export async function canonicalRepoRoot(root: string): Promise<string> {
  const resolved = await realpath(path.resolve(root))
  return path.normalize(resolved)
}

/**
 * Bounded per-worktree context cache. Every tool read performs a cheap mtime
 * scan and reparses only files dirtied by watcher events or scan metadata.
 */
export class RepoContextManager {
  private readonly contexts = new Map<string, RepoContext>()
  private readonly options: Required<Omit<RepoContextManagerOptions, 'onRefresh'>> &
    Pick<RepoContextManagerOptions, 'onRefresh'>
  private disposed = false

  constructor(options: RepoContextManagerOptions) {
    this.options = {
      indexOptions: options.indexOptions,
      watch: options.watch ?? true,
      debounceMs: Math.max(20, options.debounceMs ?? 120),
      maxContexts: Math.max(1, options.maxContexts ?? 4),
      onRefresh: options.onRefresh,
    }
  }

  async get(root: string, force = false): Promise<RepoIndex> {
    if (this.disposed) throw new Error('repo context manager is disposed')
    const canonical = await canonicalRepoRoot(root)
    const key = cacheKeyForRoot(canonical)
    let context = this.contexts.get(key)
    if (!context) {
      context = {
        root: canonical,
        index: null,
        lastRefreshAt: 0,
        dirtyFiles: new Set(),
        ignoreMatcherCache: new Map(),
        watcher: null,
        debounceTimer: null,
        refresh: null,
        disposed: false,
        generation: 0,
        lastUsedAt: Date.now(),
      }
      this.contexts.set(key, context)
      this.attachWatcher(context)
      this.evictInactive()
    } else {
      this.contexts.delete(key)
      this.contexts.set(key, context)
      context.lastUsedAt = Date.now()
    }
    let index = await this.refresh(context, force)
    // A filesystem event can arrive while the first refresh is in flight.
    // Drain its dirty set before returning so the requesting tool sees it.
    while (!context.disposed && context.dirtyFiles.size > 0) {
      if (context.refresh) await context.refresh
      else index = await this.refresh(context)
    }
    return index
  }

  getContext(root: string): RepoContext | undefined {
    const key = cacheKeyForRoot(path.resolve(root))
    return this.contexts.get(key)
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    const contexts = [...this.contexts.values()]
    this.contexts.clear()
    await Promise.all(contexts.map((context) => this.disposeContext(context)))
  }

  reconfigure(options: { watch?: boolean; debounceMs?: number }): void {
    if (options.debounceMs !== undefined) this.options.debounceMs = Math.max(20, options.debounceMs)
    if (options.watch === undefined || options.watch === this.options.watch) return
    this.options.watch = options.watch
    for (const context of this.contexts.values()) {
      if (options.watch) this.attachWatcher(context)
      else {
        if (context.debounceTimer) clearTimeout(context.debounceTimer)
        context.debounceTimer = null
        const watcher = context.watcher
        context.watcher = null
        void watcher?.close()
      }
    }
  }

  private async refresh(context: RepoContext, force = false): Promise<RepoIndex> {
    if (context.refresh) {
      const index = await context.refresh
      return force ? this.refresh(context, true) : index
    }
    const generation = context.generation
    const dirty = force ? new Set(['*']) : new Set(context.dirtyFiles)
    context.dirtyFiles.clear()
    const promise = buildIndexWithCache(context.root, this.options.indexOptions(), undefined, dirty)
      .then((index) => {
        if (!context.disposed && context.generation === generation) {
          context.index = index
          context.lastRefreshAt = Date.now()
          this.options.onRefresh?.(context.root, index)
        }
        return index
      })
      .finally(() => {
        if (context.refresh === promise) context.refresh = null
        if (!context.disposed && context.dirtyFiles.size > 0) this.scheduleRefresh(context)
      })
    context.refresh = promise
    return promise
  }

  private attachWatcher(context: RepoContext): void {
    if (!this.options.watch) return
    const options = this.options.indexOptions()
    const ignored = (absolute: string): boolean => {
      const rel = path.relative(context.root, absolute)
      return rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)
        || ignoredRelativePath(rel, options)
        || isGitIgnoredPath(context.root, rel, context.ignoreMatcherCache)
    }
    const watcher = chokidar.watch(context.root, {
      ignored,
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 60, pollInterval: 20 },
      followSymlinks: false,
    })
    context.watcher = watcher
    watcher.on('all', (event, absolute) => {
      if (context.disposed || !['add', 'change', 'unlink'].includes(event)) return
      const rel = path.relative(context.root, absolute).split(path.sep).join('/')
      if (!rel || ignoredRelativePath(rel, this.options.indexOptions())
        || isGitIgnoredPath(context.root, rel, context.ignoreMatcherCache)) return
      if (!SUPPORTED_EXTS.has(path.extname(rel).toLowerCase())) return
      context.dirtyFiles.add(rel)
      this.scheduleRefresh(context)
    })
    watcher.on('error', (error) => {
      if (!context.disposed) console.warn(`[dsh-code-index] watcher failed for ${context.root}: ${String(error)}`)
    })
  }

  private scheduleRefresh(context: RepoContext): void {
    if (context.disposed || this.disposed) return
    if (context.debounceTimer) clearTimeout(context.debounceTimer)
    context.debounceTimer = setTimeout(() => {
      context.debounceTimer = null
      void this.refresh(context).catch((error: unknown) => {
        if (!context.disposed) console.warn(`[dsh-code-index] refresh failed for ${context.root}: ${String(error)}`)
      })
    }, this.options.debounceMs)
  }

  private evictInactive(): void {
    while (this.contexts.size > this.options.maxContexts) {
      const oldest = this.contexts.entries().next().value as [string, RepoContext] | undefined
      if (!oldest) return
      this.contexts.delete(oldest[0])
      void this.disposeContext(oldest[1])
    }
  }

  private async disposeContext(context: RepoContext): Promise<void> {
    context.disposed = true
    context.generation++
    if (context.debounceTimer) clearTimeout(context.debounceTimer)
    context.debounceTimer = null
    const watcher = context.watcher
    context.watcher = null
    if (watcher) await watcher.close()
    await context.refresh?.catch(() => undefined)
    context.dirtyFiles.clear()
    context.ignoreMatcherCache.clear()
    context.index = null
  }
}
