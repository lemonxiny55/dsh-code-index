/** Measured local observations, not a performance promise. Run after build. */
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
if (process.argv[2] !== '--worker') {
  const rows = []
  const baseline = process.argv[2] === '--baseline' ? path.resolve(process.argv[3]) : null
  for (const files of [6, 100, 600]) rows.push(JSON.parse(execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--worker', String(files), ...(baseline ? [baseline] : [])], { encoding: 'utf8' })))
  console.log(JSON.stringify({ method: 'Three isolated Node processes; generated real files; explicit file selection, not a Git-change or production-repository benchmark; one cold index and three warm analysis/projection samples per size', node: process.version, rows }, null, 2))
} else {
  const { buildIndex, buildChangeContext, buildImpactXray } = await import(process.argv[4] ? pathToFileURL(process.argv[4]).href : '../dist/index.js')
  const count = Number(process.argv[3])
  await mkdir('.dsh-code-index/impact-xray-mvp', { recursive: true })
  const root = await mkdtemp(path.resolve('.dsh-code-index/impact-xray-mvp/bench-'))
  await mkdir(path.join(root, '.git'))
  await writeFile(path.join(root, 'core.ts'), 'export function normalize(input: string) { return input.trim() }\n')
  for (let i = 1; i < count; i++) await writeFile(path.join(root, `caller${i}.ts`), `import { normalize } from './core'\nexport function caller${i}() { return normalize(' value ') }\nexport function entry${i}() { return caller${i}() }\n`)
  const start = performance.now(), index = await buildIndex(root), indexMs = performance.now() - start
  const samples = []
  for (let i = 0; i < 3; i++) {
    const cpu = process.cpuUsage(), before = performance.now()
    const result = await buildChangeContext(index, { kind: 'files', files: ['core.ts'] }, { maxImpact: 200, maxPaths: 50 })
    const analysisMs = performance.now() - before, project = performance.now(), view = buildImpactXray ? await buildImpactXray(index, result) : null
    const cpuUsed = process.cpuUsage(cpu)
    samples.push({ analysisMs, projectionMs: view ? performance.now() - project : null, cpuMs: (cpuUsed.user + cpuUsed.system) / 1000,
      nodes: view?.nodes.length ?? 0, edges: view?.edges.length ?? 0, metadataBytes: view ? Buffer.byteLength(JSON.stringify(view)) : 0, truncated: view?.truncated ?? Object.values(result.truncated).some(Boolean) })
  }
  console.log(JSON.stringify({ files: index.files.length, symbols: index.files.reduce((n, f) => n + f.symbols.length, 0), indexMs, samples, rssBytes: process.memoryUsage().rss, processPeakRssBytes: process.resourceUsage().maxRSS * 1024 }))
}
