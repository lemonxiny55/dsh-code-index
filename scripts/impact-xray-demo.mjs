/** Reproducible real JavaScript repository for the Desktop demo. */
import { access, mkdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
const root = path.resolve(process.argv[2] ?? '.dsh-code-index/impact-xray-mvp/demo-repo')
try { await access(root); throw Error(`Refusing to overwrite ${root}`) } catch (e) { if (e.code !== 'ENOENT') throw e }
await mkdir(path.join(root, 'src'), { recursive: true }); await mkdir(path.join(root, 'tests'))
const files = {
  'package.json': JSON.stringify({ name: 'impact-xray-demo', private: true, type: 'module', scripts: { test: 'node --test' } }, null, 2) + '\n',
  'src/core.js': 'export function normalize(input) {\n  return input.trim()\n}\nexport function localUsage() { return normalize(" local ") }\n',
  'src/startup.js': 'import { normalize } from "./core.js"\nexport function startup() { return normalize(" startup ") }\n',
  'src/scoped.js': 'import * as core from "./core.js"\nexport function scopedUsage() { return core.normalize(" scoped ") }\n',
  'src/loose.js': '// Deliberately unresolved name: a candidate, not a verified executable path.\nexport function looseUsage() { return normalize(" loose ") }\n',
  'src/main.js': 'import { startup } from "./startup.js"\nexport function main() { return startup() }\n',
  'tests/core.test.js': 'import test from "node:test"\nimport assert from "node:assert/strict"\nimport { normalize } from "../src/core.js"\nexport function checkNormalize() { return normalize(" test ") }\ntest("normalization preserves letter case", () => assert.equal(checkNormalize(), "test"))\n',
}
for (const [file, text] of Object.entries(files)) await writeFile(path.join(root, file), text)
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
git('init', '-q'); git('add', '.'); git('-c', 'user.name=Impact X-Ray Demo', '-c', 'user.email=demo@example.invalid', 'commit', '-qm', 'real demo baseline')
await writeFile(path.join(root, 'src/core.js'), files['src/core.js'].replace('input.trim()', 'input.trim().toUpperCase()'))
console.log(JSON.stringify({ root, base: git('rev-parse', 'HEAD'), request: { repoRoot: root, outputFormat: 'xray' },
  test: 'node --test (baseline passes; current case-conversion edit intentionally fails)',
  uncertainty: 'looseUsage intentionally has no import; its name-only edge is a low-confidence candidate.' }, null, 2))
