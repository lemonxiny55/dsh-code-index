/** Stage-separated observations; never a speed or memory guarantee. No forced GC. */
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
const sha = value => createHash('sha256').update(value).digest('hex')
const script = fileURLToPath(import.meta.url)
if (process.argv[2] === '--worker') {
  const [moduleFile, root, file, mode] = process.argv.slice(3)
  const api = await import(pathToFileURL(moduleFile).href)
  const stages = []
  const capture = (stage, ms = 0) => stages.push({ stage, ms, ...process.memoryUsage(), peakRssBytes: process.resourceUsage().maxRSS * 1024 })
  capture('module-loaded')
  let start = performance.now()
  const index = await api.buildIndex(root)
  capture('cold-index', performance.now() - start)
  if (process.env.XRAY_BENCH_SETTLE_MS) {
    await new Promise(resolve => setTimeout(resolve, Number(process.env.XRAY_BENCH_SETTLE_MS)))
    capture('after-index-idle', Number(process.env.XRAY_BENCH_SETTLE_MS))
  }
  const samples = []
  for (let i = 0; i < 3; i++) {
    start = performance.now()
    const result = await api.buildChangeContext(index, { kind: 'files', files: [file] }, { maxImpact: 200, maxPaths: 50 })
    capture(`analysis-${i + 1}`, performance.now() - start)
    const analysisSha256 = sha(JSON.stringify(result))
    let view
    if (mode === 'xray') {
      start = performance.now()
      view = await api.buildImpactXray(index, result)
      capture(`projection-${i + 1}`, performance.now() - start)
    }
    samples.push({ analysisSha256, changed: result.changed.length, callers: result.directCallers.length, impact: result.impact.length,
      tests: result.tests.length, nodes: view?.nodes.length, edges: view?.edges.length,
      metadataBytes: view ? Buffer.byteLength(JSON.stringify(view)) : 0 })
  }
  console.log(JSON.stringify({ mode, files: index.files.length, symbols: index.files.reduce((n, f) => n + f.symbols.length, 0),
    indexedSourceBytes: (await Promise.all(index.files.map(f => readFile(path.join(root, f.path))))).reduce((n, b) => n + b.length, 0), stages, samples }))
} else {
  const [baseline, mediumRoot, mediumFile = 'lib/utils.js', repeats = '3'] = process.argv.slice(2)
  if (!baseline || !mediumRoot) throw Error('Usage: node scripts/impact-xray-rc-benchmark.mjs BASELINE_DIST MEDIUM_REPO [FILE] [REPEATS]')
  const scratch = path.resolve('.dsh-code-index/impact-xray-rc')
  const tiny = path.join(scratch, 'six-files')
  await mkdir(tiny, { recursive: true })
  await mkdir(path.join(tiny, '.git'), { recursive: true })
  await writeFile(path.join(tiny, 'core.ts'), 'export function normalize(input: string) { return input.trim() }\n')
  for (let i = 1; i < 6; i++) await writeFile(path.join(tiny, `caller${i}.ts`), `import { normalize } from './core'\nexport function caller${i}() { return normalize(' value ') }\nexport function entry${i}() { return caller${i}() }\n`)
  const variants = [{ name: 'v0.10.2-analysis', module: path.resolve(baseline), mode: 'analysis' },
    { name: 'candidate-analysis', module: path.resolve('dist/index.js'), mode: 'analysis' },
    { name: 'candidate-xray', module: path.resolve('dist/index.js'), mode: 'xray' }]
  const observations = []
  for (const [fixture, root, file] of [['six-files', tiny, 'core.ts'], ['express-v5.1.0', path.resolve(mediumRoot), mediumFile]]) {
    for (let repeat = 0; repeat < Number(repeats); repeat++) {
      // Rotate order to reduce systematic order / machine-temperature bias.
      const order = [...variants.slice(repeat % 3), ...variants.slice(0, repeat % 3)]
      for (const v of order) {
        const result = JSON.parse(execFileSync(process.execPath, [script, '--worker', v.module, root, file, v.mode], { encoding: 'utf8', maxBuffer: 4e6 }))
        observations.push({ fixture, repeat: repeat + 1, variant: v.name, ...result })
        await writeFile(path.join(scratch, 'performance-progress.json'), JSON.stringify(observations, null, 2) + '\n')
      }
    }
  }
  const byFixture = new Map()
  for (const row of observations) {
    const digests = row.samples.map(s => s.analysisSha256)
    const expected = byFixture.get(row.fixture) ?? digests[0]
    if (digests.some(d => d !== expected)) throw Error(`Analysis output changed: ${row.fixture}`)
    byFixture.set(row.fixture, expected)
  }
  console.log(JSON.stringify({ node: process.version, platform: process.platform, cpu: os.cpus()[0]?.model, physicalMemoryBytes: os.totalmem(),
    method: '18 isolated processes, three rotated repeats per fixture/variant. Identical files and explicit file selection, no fabricated diff. Cold index then three analysis samples; projection only in xray variant. Same analysis output hashes required. Process high-water RSS is cumulative, not a per-stage allocation metric. No forced GC; retained RSS is not proof of a leak.',
    indexIdleMs: Number(process.env.XRAY_BENCH_SETTLE_MS ?? 0),
    medium: { origin: execFileSync('git', ['-C', mediumRoot, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim(), commit: execFileSync('git', ['-C', mediumRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), selectedFile: mediumFile },
    engineSources: await Promise.all(['src/buildIndex.ts', 'src/extract.ts', 'src/refgraph.ts', 'src/change-context.ts'].map(async file => ({ file, sha256: sha(await readFile(file)) }))), observations }, null, 2))
}
