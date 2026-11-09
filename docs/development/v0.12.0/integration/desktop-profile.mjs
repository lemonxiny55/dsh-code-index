// Reversible runtime-entry override; never replace the installed stable package.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import path from 'node:path'
import os from 'node:os'
const out = path.resolve('docs/development/v0.12.0/integration')
const state = JSON.parse(readFileSync(readFileSync('node_modules/.v012-rc-state-path', 'utf8'), 'utf8'))
const smoke = JSON.parse(readFileSync(path.join(out, 'smoke-node24.json'), 'utf8'))
const target = path.join(os.homedir(), '.dsh/profiles/desktop/cordis.patch.yml')
const recordPath = path.join(out, 'desktop-profile.json'), backup = path.join(state.scratch, 'desktop-patch.original')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
if (process.argv[2] === 'refresh' || process.argv[2] === 'runtime-restore') {
  const record = JSON.parse(readFileSync(recordPath, 'utf8'))
  const current = readFileSync(target, 'utf8')
  if (record.restored || sha(current) !== record.temporaryHash) throw Error('Concurrent profile edit')
  const original = readFileSync(backup, 'utf8')
  record.revision = (record.revision ?? 0) + 1
  const temporary = original + '\n# Temporary Desktop Host API acceptance only.\n- insert:\n    - id: v012-desktop-acceptance\n      name: ' + JSON.stringify(path.join(out, 'desktop-entry.mjs').replaceAll('\\', '/')) + '\n      config:\n        revision: ' + record.revision + '\n' + (process.argv[2] === 'runtime-restore' ? '        restore: true\n' : '')
  record.temporaryHash = sha(temporary)
  writeFileSync(recordPath, JSON.stringify(record, null, 2)); writeFileSync(target, temporary)
  console.log('Desktop API acceptance revision', record.revision)
} else if (process.argv[2] === 'resume') {
  const record = JSON.parse(readFileSync(recordPath, 'utf8'))
  const original = readFileSync(target)
  if (!record.restored || sha(original) !== record.originalHash || sha(readFileSync(backup)) !== record.originalHash) throw Error('Original profile or backup changed')
  writeFileSync(path.join(out, 'desktop-profile-first.json'), JSON.stringify(record, null, 2))
  const temporary = original.toString('utf8') + '\n# Temporary Desktop Host API acceptance only.\n- insert:\n    - id: v012-desktop-acceptance\n      name: ' + JSON.stringify(path.join(out, 'desktop-audit.mjs').replaceAll('\\', '/')) + '\n'
  record.temporaryHash = sha(temporary); record.restored = false; delete record.restoredHash; delete record.restoredAt
  record.resumed = new Date().toISOString(); record.method = 'temporary local Host API probe; candidate mounted in its Cordis scope, stable installation retained'
  writeFileSync(recordPath, JSON.stringify(record, null, 2)); writeFileSync(target, temporary)
  console.log('Resumed reversible Desktop Host API acceptance')
} else if (process.argv[2] === 'audit') {
  const record = JSON.parse(readFileSync(recordPath, 'utf8'))
  const current = readFileSync(target, 'utf8')
  if (sha(current) !== record.temporaryHash) throw Error('Concurrent profile edit')
  const temporary = current.replace('desktop-probe.mjs', 'desktop-audit.mjs')
  record.temporaryHash = sha(temporary)
  writeFileSync(recordPath, JSON.stringify(record, null, 2)); writeFileSync(target, temporary)
  console.log('Inspecting only the target plugin loader entry')
} else if (process.argv[2] === 'probe') {
  const record = JSON.parse(readFileSync(recordPath, 'utf8'))
  const current = readFileSync(target, 'utf8')
  if (sha(current) !== record.temporaryHash) throw Error('Concurrent profile edit')
  const temporary = current + '\n- insert:\n    - id: v012-desktop-acceptance\n      name: ' + JSON.stringify(path.join(out, 'desktop-probe.mjs').replaceAll('\\', '/')) + '\n'
  record.temporaryHash = sha(temporary); record.probe = true
  writeFileSync(recordPath, JSON.stringify(record, null, 2)); writeFileSync(target, temporary)
  console.log('Temporary Desktop probe added; exact restoration preserved')
} else if (process.argv[2] === 'restore') {
  const record = JSON.parse(readFileSync(recordPath, 'utf8'))
  if (sha(readFileSync(target)) !== record.temporaryHash) throw Error('Concurrent profile edit; refusing to overwrite')
  const original = readFileSync(backup)
  if (sha(original) !== record.originalHash) throw Error('Backup integrity mismatch')
  writeFileSync(target, original)
  record.restoredHash = sha(readFileSync(target)); record.restored = record.restoredHash === record.originalHash
  record.restoredAt = new Date().toISOString(); writeFileSync(recordPath, JSON.stringify(record, null, 2))
  console.log(JSON.stringify({ restored: record.restored }))
} else {
  if (existsSync(recordPath) || existsSync(backup)) throw Error('Existing transaction; refusing to overwrite')
  const original = readFileSync(target)
  const entry = path.join(smoke.installedRoot, 'dist/index.js').replaceAll('\\', '/')
  const temporary = original.toString('utf8') + '\n# Temporary v0.12.0 candidate acceptance; restore exact original after verification.\n- id: code-index\n  name: ' + JSON.stringify(entry) + '\n  config:\n    codeHealth: true\n    externalWatch: true\n'
  const yaml = createRequire(path.join(state.host, 'package.json'))('yaml')
  const rows = yaml.parse(temporary, { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: String }] })
  if (rows.at(-1).name !== entry) throw Error('Temporary patch parse mismatch')
  writeFileSync(backup, original, { flag: 'wx' })
  const record = { target, backup, installedRoot: smoke.installedRoot, package: smoke.version, sha256: smoke.sha256, originalHash: sha(original), temporaryHash: sha(temporary), restored: false, started: new Date().toISOString() }
  writeFileSync(recordPath, JSON.stringify(record, null, 2))
  if (sha(readFileSync(target)) !== record.originalHash) throw Error('Concurrent profile edit')
  writeFileSync(target, temporary)
  console.log(JSON.stringify({ temporaryCandidate: smoke.version, originalSaved: true, packageInstallationReplaced: false }))
}
