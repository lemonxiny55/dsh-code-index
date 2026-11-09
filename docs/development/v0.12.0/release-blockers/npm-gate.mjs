import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import path from 'node:path'
import os from 'node:os'
const out = import.meta.dirname, repo = path.resolve(out, '../../../..')
const archive = path.resolve(process.argv[2] ?? path.join(out, '../integration/dsh-code-index-0.12.0-rc.0.tgz'))
const label = process.argv[3] ?? 'rc0'
const npm = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
const records = await Promise.all(['auto-peer', 'host-rc1'].map(async mode => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'cix-normal-npm-'))
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'normal-peer-smoke', version: '1.0.0', private: true }))
  // Empty local user/global npmrc plus process-only defaults: no force or legacy peer bypass.
  const config = path.join(root, 'empty.npmrc'); writeFileSync(config, '')
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^npm_config_/i.test(key)))
  Object.assign(env, { npm_config_userconfig: config, npm_config_globalconfig: path.join(root, 'empty-global.npmrc'), npm_config_cache: process.env.CIX_RELEASE_NPM_CACHE ?? path.join(root, 'cache'), npm_config_registry: 'https://registry.npmjs.org' })
  writeFileSync(env.npm_config_globalconfig, '')
  const args = [npm, 'install', '--no-audit', '--no-fund', archive, ...(mode === 'host-rc1' ? ['@deepseek-ai/dsh-tools@0.2.2-rc.1'] : [])]
  const started = Date.now(), child = spawn(process.execPath, args, { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = '', stderr = ''; child.stdout.on('data', b => { stdout += b }); child.stderr.on('data', b => { stderr += b })
  const timer = setTimeout(() => child.kill(), 240000)
  const exitCode = await new Promise((resolve, reject) => { child.once('close', resolve); child.once('error', reject) }); clearTimeout(timer)
  mkdirSync(out, { recursive: true }); writeFileSync(path.join(out, `${label}-${mode}.log`), stdout + stderr)
  const record = { mode, root, executable: process.execPath, args, exitCode, elapsedMs: Date.now() - started, archive, sha256: createHash('sha256').update(readFileSync(archive)).digest('hex'), bypass: false,
    environment: { registry: env.npm_config_registry, userconfig: 'empty disposable file', globalconfig: 'empty disposable file', cache: process.env.CIX_RELEASE_NPM_CACHE ? 'reuse verified download cache; fresh project/node_modules/lockfile' : 'fresh disposable cache' } }
  if (exitCode === 0) {
    const pkg = name => JSON.parse(readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8')).version
    record.installed = { plugin: pkg('dsh-code-index'), tools: pkg('@deepseek-ai/dsh-tools'), cordis: pkg('@deepseek-ai/cordis') }
  } else record.failure = /ERESOLVE/.test(stderr) ? 'ERESOLVE' : /ETARGET/.test(stderr) ? 'ETARGET' : 'see log'
  console.log(JSON.stringify(record)); return record
}))
writeFileSync(path.join(out, `${label}-npm.json`), JSON.stringify(records, null, 2) + '\n')
if (records.some(r => r.exitCode !== 0)) process.exitCode = 1
