/** Model-visible tools: code_index, code_symbols, code_search. */

import { defineTool, type JsonValue } from '@deepseek-ai/dsh-tools'
import path from 'node:path'
import { buildIndexWithCache, findRepoRoot } from './buildIndex.js'
import { renderHit, searchSymbols } from './search.js'
import { rankRepoMap, renderRepoMap } from './repomap.js'
import { getConfig, indexOptions } from './config.js'
import { cacheKeyForRoot } from './store.js'
import type { RepoIndex } from './types.js'

/** Minimal structural types for the harness surfaces we touch. */
interface ToolCwdContext {
  agent?: {
    session?: { header?: { cwd?: string } }
  }
}
type ToolRunExec = ToolCwdContext & { signal?: AbortSignal }

interface TextBlock {
  type: 'text'
  text: string
}

export interface IndexCache {
  get(root: string, force?: boolean): Promise<RepoIndex>
  invalidate(): void
}

/** Retain completed indexes briefly while still coalescing concurrent refreshes. */
export function createIndexCache(
  load: (root: string) => Promise<RepoIndex>,
  ttlMs = 60_000,
  now: () => number = Date.now,
): IndexCache {
  interface CompletedEntry {
    index: RepoIndex
    at: number
    epoch: number
  }
  interface LoadEntry {
    promise: Promise<RepoIndex>
    epoch: number
  }

  const completed = new Map<string, CompletedEntry>()
  const inFlight = new Map<string, LoadEntry>()
  let epoch = 0

  function startLoad(key: string, root: string, previous?: Promise<RepoIndex>): Promise<RepoIndex> {
    const loadEpoch = epoch
    const begin = previous
      ? previous.catch(() => undefined).then(() => load(root))
      : load(root)
    const promise = begin
      .then((index) => {
        if (loadEpoch === epoch) {
          completed.delete(key)
          completed.set(key, { index, at: now(), epoch: loadEpoch })
          while (completed.size > 16) completed.delete(completed.keys().next().value!)
        }
        return index
      })
      .finally(() => {
        if (inFlight.get(key)?.promise === promise) inFlight.delete(key)
      })
    inFlight.set(key, { promise, epoch: loadEpoch })
    return promise
  }

  return {
    get(root, force = false) {
      const resolvedRoot = path.resolve(root)
      const key = cacheKeyForRoot(resolvedRoot)
      const running = inFlight.get(key)
      if (running) {
        if (running.epoch === epoch && !force) return running.promise
        return startLoad(key, resolvedRoot, running.promise)
      }

      if (!force) {
        const cached = completed.get(key)
        if (cached && cached.epoch === epoch && now() - cached.at < ttlMs) {
          completed.delete(key)
          completed.set(key, cached)
          return Promise.resolve(cached.index)
        }
        if (cached) completed.delete(key)
      } else {
        completed.delete(key)
      }
      return startLoad(key, resolvedRoot)
    },
    invalidate() {
      epoch++
      completed.clear()
    },
  }
}

const indexCache = createIndexCache((root) => buildIndexWithCache(root, indexOptions()))

export function getIndex(root: string, force = false): Promise<RepoIndex> {
  return indexCache.get(root, force)
}

export function invalidateIndexCache(): void {
  indexCache.invalidate()
}

async function resolveRoot(arg: string | undefined, exec: ToolRunExec): Promise<string> {
  const cwd = exec.agent?.session?.header?.cwd
  const base = arg ?? cwd ?? process.cwd()
  const root = await findRepoRoot(base)
  if (!root) throw new Error(`no git repository found from ${path.resolve(base)}`)
  return root
}

export const tools = [
  defineTool({
    name: 'code_index',
    description:
      'Manage the semantic repo index: status or (re)build it for the current workspace. Auto-builds the first time it is queried. Returns file/symbol counts and the index location.',
    parameters: {
      action: {
        type: 'string',
        enum: ['status', 'build'],
        description: '"status" (default) reports without forcing a rebuild; "build" forces a fresh scan.',
      },
      repoRoot: {
        type: 'string',
        description:
          'Optional absolute repo path. Defaults to the workspace root of the current session.',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value: string): TextBlock[] => [{ type: 'text', text: value }],
    },
    async execute(args: { action?: string; repoRoot?: string }, exec: ToolRunExec): Promise<string> {
      try {
        const root = await resolveRoot(args.repoRoot, exec)
        const index = await getIndex(root, args.action === 'build')
        const total = index.files.reduce((n, f) => n + f.symbols.length, 0)
        const langs = new Set(index.files.map((f) => f.lang))
        return [
          `repo: ${root}`,
          `files indexed: ${index.files.length}`,
          `symbols: ${total}`,
          `languages: ${[...langs].join(', ')}`,
          index.files.length === 0 ? 'no supported files found' : 'index up to date',
        ].join('\n')
      } catch (error) {
        return `code_index: ${(error as Error).message ?? String(error)}`
      }
    },
  }),

  defineTool({
    name: 'code_symbols',
    description:
      'List symbols (functions, classes, interfaces, types, methods, variables) in the current repo. Filter by name substring, file path substring, or symbol kind. Results are exported-first, alphabetically ordered.',
    parameters: {
      query: {
        type: 'string',
        description: 'Substring of the symbol name to match (case-insensitive). Omit to list all.',
      },
      file: {
        type: 'string',
        description: 'Substring of the repo-relative file path to match, e.g. "src/core".',
      },
      kind: {
        type: 'string',
        enum: ['function', 'method', 'class', 'interface', 'type', 'enum', 'variable', 'field'],
        description: 'Only return symbols of this kind.',
      },
      exportedOnly: {
        type: 'boolean',
        description: 'Only exported (module-level public) symbols.',
      },
      limit: {
        type: 'number',
        description: 'Max rows (default 50).',
      },
      repoRoot: {
        type: 'string',
        description: 'Optional absolute repo path; defaults to the session workspace root.',
      },
    },
    output: {
      schema: { type: 'array' },
      render: (_args, value: JsonValue[]): TextBlock[] =>
        value.map((v) => ({
          type: 'text' as const,
          text: renderHit(v as unknown as Parameters<typeof renderHit>[0]),
        })),
    },
    async execute(
      args: {
        query?: string
        file?: string
        kind?: 'function' | 'method' | 'class' | 'interface' | 'type' | 'enum' | 'variable' | 'field'
        exportedOnly?: boolean
        limit?: number
        repoRoot?: string
      },
      exec: ToolRunExec,
    ): Promise<JsonValue[]> {
      const root = await resolveRoot(args.repoRoot, exec)
      const index = await getIndex(root)
      const hits = searchSymbols(
        index,
        { query: args.query, file: args.file, kind: args.kind, exportedOnly: args.exportedOnly },
        args.limit ?? 50,
      )
      return hits as unknown as JsonValue[]
    },
  }),

  defineTool({
    name: 'code_search',
    description:
      'Ranked symbol search over the repo index: exact > prefix > substring name matches, exported symbols first. Results carry a relevance score and file:line, so the model can locate definitions quickly.',
    parameters: {
      query: {
        type: 'string',
        required: true,
        description: 'Symbol name (or fragment) to find.',
      },
      limit: {
        type: 'number',
        description: 'Max hits (default 20).',
      },
      repoRoot: {
        type: 'string',
        description: 'Optional absolute repo path; defaults to the session workspace root.',
      },
    },
    output: {
      schema: { type: 'array' },
      render: (_args, value: JsonValue[]): TextBlock[] =>
        value.map((v) => ({
          type: 'text' as const,
          text: renderHit(v as unknown as Parameters<typeof renderHit>[0]),
        })),
    },
    async execute(
      args: { query: string; limit?: number; repoRoot?: string },
      exec: ToolRunExec,
    ): Promise<JsonValue[]> {
      const root = await resolveRoot(args.repoRoot, exec)
      const index = await getIndex(root)
      const hits = searchSymbols(index, { query: args.query }, args.limit ?? 20)
      return hits as unknown as JsonValue[]
    },
  }),

  defineTool({
    name: 'code_map',
    description:
      'Return a bounded, ranked map of the current repo (top files by symbol density, with their key symbols and lines). The model can call this once per session to build an internal model of the codebase before browsing files.',
    parameters: {
      repoRoot: {
        type: 'string',
        description: 'Optional absolute repo path; defaults to the session workspace root.',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value: string): TextBlock[] => [{ type: 'text', text: value }],
    },
    async execute(args: { repoRoot?: string }, exec: ToolRunExec): Promise<string> {
      try {
        const root = await resolveRoot(args.repoRoot, exec)
        const index = await getIndex(root)
        const cfg = getConfig()
        const map = renderRepoMap(
          rankRepoMap(index, { topFiles: cfg.mapTopFiles }),
          { maxChars: cfg.mapMaxChars },
        )
        if (!map) return 'no indexable symbols found in this repo'
        return map
      } catch (error) {
        return `code_index: ${(error as Error).message ?? String(error)}`
      }
    },
  }),
]
