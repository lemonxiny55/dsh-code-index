import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import assert from 'node:assert/strict'
const load = createRequire(import.meta.url)
const { build } = createRequire(load.resolve('tsup'))('esbuild')
const state = JSON.parse(readFileSync(readFileSync('node_modules/.v012-rc-state-path', 'utf8'), 'utf8'))
const baseline = execFileSync('git', ['show', '0afb59b:src/context.ts'], { encoding: 'utf8' })
const file = path.join(state.scratch, 'router-before.mjs')
await build({ stdin: { contents: baseline, resolveDir: path.resolve('src'), sourcefile: 'context.ts', loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: file, logLevel: 'silent' })
const before = await import(pathToFileURL(file))
const smoke = JSON.parse(readFileSync(path.join(state.out, 'smoke-node24.json'), 'utf8'))
const after = await import(pathToFileURL(path.join(smoke.installedRoot, 'dist/index.js')))
const inputs = ['Explain src/change.ts', 'Explain src/current.ts', 'Explain src/failure.ts', 'Explain src/coverage.ts', 'Fix failing tests/config.spec.ts', 'Review current changes in src/change.ts']
const measurements = inputs.map(task => ({ task, before: before.routeTask(task), after: after.routeTask(task) }))
assert.ok(measurements.slice(0, 4).some(m => m.before.includeChangeContext))
// Same contract as context.spec.ts: a path keyword must not request change analysis.
assert.ok(measurements.slice(0, 4).every(m => !m.after.includeChangeContext))
assert.equal(measurements[4].after.kind, 'test'); assert.equal(measurements[5].after.kind, 'change')
writeFileSync(path.join(state.out, 'router-comparison.json'), JSON.stringify({ method: 'bundle unchanged HEAD context.ts in isolated scratch; compare installed candidate routeTask; no workspace source replacement', node: process.version, baseline: '0afb59b', command: { executable: process.execPath, args: ['docs/development/v0.12.0/integration/router-comparison.mjs'], exitCode: 0 }, measurements }, null, 2))
console.log(measurements.map(m => `${m.task}: ${m.before.kind}/${m.before.includeChangeContext} -> ${m.after.kind}/${m.after.includeChangeContext}`).join('\n'))
