/** Function-level call graph built from the cached index — pure, no IO. */

import type { RepoIndex, SymbolInfo } from './types.js'

/** name -> definitions; several when same-named symbols live in different files. */
export function buildSymbolTable(index: RepoIndex): Map<string, SymbolInfo[]> {
  const table = new Map<string, SymbolInfo[]>()
  for (const file of index.files) {
    for (const symbol of file.symbols) {
      const list = table.get(symbol.name)
      if (list) list.push(symbol)
      else table.set(symbol.name, [symbol])
    }
  }
  for (const list of table.values()) {
    list.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
  }
  return table
}

/** One call site that invokes the queried symbol. */
export interface CallerHit {
  file: string
  line: number
  from: string
}

/** One distinct symbol the queried function calls, with its first call line. */
export interface CalleeHit {
  name: string
  line: number
  /** In-repo definitions matched by the callee name. */
  targets: SymbolInfo[]
}

export interface SymbolRefs {
  /** Definitions of the queried symbol (empty when only call sites exist). */
  defs: SymbolInfo[]
  callers: CallerHit[]
  callees: CalleeHit[]
}

/** How many call sites reference each name — used to rank search hits. */
export function callerCounts(index: RepoIndex): Map<string, number> {
  const counts = new Map<string, number>()
  for (const file of index.files) {
    for (const call of file.calls ?? []) {
      counts.set(call.name, (counts.get(call.name) ?? 0) + 1)
    }
  }
  return counts
}

/**
 * Resolve one symbol to its callers (call sites invoking it anywhere) and its
 * callees (calls made inside the definition, attributed by the extracted
 * enclosing-function name). Name-based, so it is a best-effort view: like-named
 * symbols are reported as candidates rather than guessed apart.
 */
export function symbolRefs(index: RepoIndex, symbol: string, limit = 200): SymbolRefs {
  const table = buildSymbolTable(index)
  const defs = table.get(symbol) ?? []

  const callers: CallerHit[] = []
  const calleeFirstLine = new Map<string, number>()
  for (const file of index.files) {
    for (const call of file.calls ?? []) {
      if (call.name === symbol) {
        callers.push({ file: file.path, line: call.line, from: call.from })
      }
      if (call.from === symbol && !calleeFirstLine.has(call.name)) {
        calleeFirstLine.set(call.name, call.line)
      }
    }
  }

  callers.sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.from.localeCompare(b.from),
  )

  const callees: CalleeHit[] = [...calleeFirstLine.entries()]
    .map(([name, line]) => ({ name, line, targets: table.get(name) ?? [] }))
    .sort((a, b) => a.line - b.line || a.name.localeCompare(b.name))

  return {
    defs,
    callers: callers.slice(0, limit),
    callees: callees.slice(0, limit),
  }
}
