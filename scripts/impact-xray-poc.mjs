/** Create a fresh, real Git fixture; no host/profile changes or service. */
import { mkdir, writeFile, access } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const root = path.resolve(process.argv[2] ?? '.dsh-code-index/impact-xray-poc/fixture')
try { await access(root); throw Error(`Fixture directory already exists: ${root}`) }
catch (error) { if (error.code !== 'ENOENT') throw error }
await mkdir(path.join(root, 'src'), { recursive: true })
await mkdir(path.join(root, 'tests'))
const files = {
  'src/core.ts': 'export function normalize(input: string) {\n  return input.trim()\n}\nexport function localUsage() { return normalize(" local ") }\n',
  'src/startup.ts': 'import { normalize } from "./core"\nexport function startup() { return normalize(" startup ") }\n',
  'src/scoped.ts': 'import * as core from "./core"\nexport function scopedUsage() { return core.normalize(" scoped ") }\n',
  'src/loose.ts': '// Deliberately unresolved: a low-confidence name match, not an executable import.\nexport function looseUsage() { return normalize(" loose ") }\n',
  'src/main.ts': 'import { startup } from "./startup"\nexport function main() { return startup() }\n',
  'tests/core.test.ts': 'import { normalize } from "../src/core"\nexport function checkNormalize() { return normalize(" test ") === "test" }\n',
}
for (const [file, text] of Object.entries(files)) await writeFile(path.join(root, file), text)
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
git('init', '-q')
git('add', 'src', 'tests')
git('-c', 'user.name=Impact X-Ray PoC', '-c', 'user.email=poc@example.invalid', 'commit', '-qm', 'fixture baseline')
await writeFile(path.join(root, 'src/core.ts'), files['src/core.ts'].replace('input.trim()', 'input.trim().toUpperCase()'))
console.log(JSON.stringify({ root, base: git('rev-parse', 'HEAD'), changed: 'src/core.ts:2',
  request: { repoRoot: root, outputFormat: 'xray' },
  notes: 'Tiny analysis fixture. loose.ts intentionally has no import; the test file is a lead, not a coverage claim.' }, null, 2))
