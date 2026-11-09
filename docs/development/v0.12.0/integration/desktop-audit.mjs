import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
export const inject = ['tools']
export async function restore(ctx) {
  const entries = [...ctx.loader.entries()].filter(e => e.options.name === 'dsh-code-index')
  if (entries.length !== 1) throw Error('Cannot uniquely restore original target entry')
  const target = entries[0]
  const before = ctx.tools.schemas().filter(t => t.name.startsWith('code_')).length
  // Public Entry.init starts the original entry without persisting configuration.
  if (target.fiber?.state !== 2) await target.init()
  const names = ctx.tools.schemas().map(t => t.name).filter(n => n.startsWith('code_')).sort()
  if (names.length !== 7 || target.fiber?.state !== 2) throw Error('Original default tool registration did not recover')
  const host = JSON.parse(readFileSync(path.join(import.meta.dirname, 'host-results.json'), 'utf8'))
  const batch = await ctx.tools.execute({ calls: [{ type: 'tool-call', id: 'restore:search', name: 'code_search', arguments: JSON.stringify({ repoRoot: host.repos.a, query: 'normalize' }) }], signal: new AbortController().signal })
  if (batch.results[0].result.isError || !batch.results[0].result.value?.some(s => s.name === 'normalize')) throw Error('Restored plugin did not dispatch search')
  writeFileSync(path.join(import.meta.dirname, 'desktop-restored-runtime.json'), JSON.stringify({
    method: 'verify original entry and native search in actual Desktop; Entry.init fallback only if not active; no persistence API',
    status: 'PASS', pid: process.pid, node: process.version, entry: target.options.name, state: target.fiber.state,
    toolsBeforeOriginalInit: before, names, search: batch.results[0], at: new Date().toISOString(),
  }, null, 2))
}
export async function apply(ctx) {
  const entries = [...ctx.loader.entries()].filter(e => e.options.name === 'dsh-code-index' || e.moduleNamespace?.name === 'dsh-code-index')
  writeFileSync(path.join(import.meta.dirname, 'desktop-entry.json'), JSON.stringify(entries.map(e => ({
    id: e.id, location: ctx.loader.locate(e.fiber), name: e.options.name, config: e.options.config, state: e.fiber?.state,
  })), null, 2))
  if (entries.length !== 1) throw Error('Expected exactly one target plugin; refusing to touch other entries')
  const smoke = JSON.parse(readFileSync(path.join(import.meta.dirname, 'smoke-node24.json'), 'utf8'))
  const entry = path.join(smoke.installedRoot, 'dist/index.js')
  // Session-local replacement through Cordis API; the stable files stay intact.
  await entries[0].fiber.dispose()
  const before = ctx.tools.schemas().filter(t => t.name.startsWith('code_')).length
  if (before !== 0) throw Error('Target tools did not fully unload')
  const candidate = await import(pathToFileURL(entry))
  const fiber = ctx.plugin(candidate, { codeHealth: true, externalWatch: true, autoInject: true })
  ctx.effect(() => () => fiber.dispose())
  writeFileSync(path.join(import.meta.dirname, 'desktop-candidate-load.json'), JSON.stringify({
    method: 'actual Desktop Cordis API: dispose target fiber, mount installed candidate in temporary probe scope',
    stableEntry: entries[0].options.name, candidateEntry: entry, package: smoke.version, sha256: smoke.sha256,
    targetToolsAfterUnload: before, restoreNeedsRestart: true,
  }, null, 2))
  const probe = await import(new URL('./desktop-probe.mjs?installed-candidate-' + Date.now(), import.meta.url))
  probe.apply(ctx)
}
