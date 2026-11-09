import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
const out = path.resolve('docs/development/v0.12.0/integration')
const commands = []
const run = (executable, args, label, env = process.env) => {
  const r = spawnSync(executable, args, { env, encoding: 'utf8', windowsHide: true, timeout: 180000 })
  writeFileSync(path.join(out, label + '.log'), (r.stdout ?? '') + (r.stderr ?? '') + (r.error?.message ?? ''))
  commands.push({ label, executable, args, cwd: process.cwd(), exitCode: r.status, signal: r.signal, ...(r.error ? { error: r.error.message } : {}) })
  console.log(label, r.status)
}
run('pnpm.cmd', ['build'], 'pnpm-build')
for (const [label, executable] of [['node24', process.execPath], ['node22', 'D:/DevCache/npm/_npx/d18f28baf1132559/node_modules/node/bin/node.exe']]) {
  run(executable, ['node_modules/typescript/bin/tsc', '--noEmit'], label + '-typecheck')
  run(executable, ['node_modules/tsup/dist/cli-default.js'], label + '-server-dts')
  run(executable, ['node_modules/tsup/dist/cli-default.js', '--config', 'tsup.client.config.ts'], label + '-client')
}
writeFileSync(path.join(out, 'build-commands.json'), JSON.stringify(commands, null, 2))
if (commands.slice(1).some(r => r.exitCode !== 0)) process.exitCode = 1
