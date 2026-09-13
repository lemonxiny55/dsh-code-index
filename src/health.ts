/** Import-graph health checks: circular dependencies and orphan modules. */

import { resolveImport } from './repomap.js'
import type { RepoIndex } from './types.js'

export interface ModuleGraph {
  nodes: string[]
  edges: Map<string, Set<string>>
}

/** Nodes are indexed files; an edge A -> B means A imports B (self-edges dropped). */
export function buildModuleGraph(index: RepoIndex): ModuleGraph {
  const nodes = index.files.map((file) => file.path).sort((a, b) => a.localeCompare(b))
  const fileSet = new Set(nodes)
  const edges = new Map<string, Set<string>>()
  for (const file of index.files) {
    const targets = new Set<string>()
    for (const spec of file.imports ?? []) {
      const target = resolveImport(spec, file.path, fileSet)
      if (target && target !== file.path) targets.add(target)
    }
    edges.set(file.path, targets)
  }
  return { nodes, edges }
}

/** Tarjan strongly-connected components of size > 1 — i.e. import cycles. */
export function findCycles(index: RepoIndex): string[][] {
  const { nodes, edges } = buildModuleGraph(index)
  const discovery = new Map<string, number>()
  const low = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const components: string[][] = []
  let counter = 0

  const visit = (node: string): void => {
    discovery.set(node, counter)
    low.set(node, counter)
    counter++
    stack.push(node)
    onStack.add(node)

    for (const next of edges.get(node) ?? []) {
      if (!discovery.has(next)) {
        visit(next)
        low.set(node, Math.min(low.get(node)!, low.get(next)!))
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node)!, discovery.get(next)!))
      }
    }

    if (low.get(node) === discovery.get(node)) {
      const component: string[] = []
      for (;;) {
        const member = stack.pop()!
        onStack.delete(member)
        component.push(member)
        if (member === node) break
      }
      if (component.length > 1) components.push(component.sort())
    }
  }

  for (const node of nodes) {
    if (!discovery.has(node)) visit(node)
  }
  components.sort((a, b) => a[0]!.localeCompare(b[0]!))
  return components
}

const ENTRY_RE =
  /(^|\/)(index|main|cli|app|server|mod|lib|__init__)\.[A-Za-z0-9]+$|(^|\/)(bin|cmd|scripts)\/|\.config\.[A-Za-z0-9]+$/
const TEST_RE =
  /(^|\/)(tests?|__tests__)(\/|$)|\.(?:spec|test)\.[cm]?[jt]sx?$|(^|\/)(?:test_[^/]+\.py|[^/]+_test\.(?:py|go))$/

/**
 * Symbol-bearing files that neither import nor are imported by any other file,
 * excluding conventional entry points and tests (which are legitimately
 * unreferenced). A cheap, low-false-positive stand-in for dead-code detection.
 */
export function findOrphanModules(index: RepoIndex): string[] {
  const { nodes, edges } = buildModuleGraph(index)
  const incoming = new Map<string, number>()
  for (const targets of edges.values()) {
    for (const target of targets) incoming.set(target, (incoming.get(target) ?? 0) + 1)
  }
  const withSymbols = new Set(
    index.files.filter((file) => file.symbols.length > 0).map((file) => file.path),
  )
  return nodes.filter(
    (path) =>
      withSymbols.has(path) &&
      (incoming.get(path) ?? 0) === 0 &&
      (edges.get(path)?.size ?? 0) === 0 &&
      !ENTRY_RE.test(path) &&
      !TEST_RE.test(path),
  )
}
