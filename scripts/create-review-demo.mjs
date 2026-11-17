// Offline, synthetic source only. Refuses to overwrite an existing directory.
import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
const destination = path.resolve(process.argv[2] ?? 'review-brief-demo')
if (existsSync(destination)) throw Error(`Destination already exists: ${destination}`)
mkdirSync(destination, { recursive: true })
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true })
const files = {
  'src/price.ts': 'export function calculateTotal(price: number, quantity: number): number {\n  return price * quantity\n}\n',
  'src/checkout.ts': "import { calculateTotal } from './price'\nexport function checkout() { return calculateTotal(10, 2) }\n",
  'src/policy.ts': 'export interface PricePolicy {\n  discount: number\n}\n',
  'src/quote.ts': "import type { PricePolicy } from './policy'\nexport function quote(policy: PricePolicy) { return 100 * (1 - policy.discount) }\n",
  'src/experimental.ts': "export function experimentalLabel() {\n  return 'preview'\n}\n",
  'tests/price.test.ts': "import { test } from 'node:test'\nimport assert from 'node:assert/strict'\nimport { calculateTotal } from '../src/price'\ntest('total', () => assert.equal(calculateTotal(10, 2), 20))\n",
  'tests/policy.test.ts': "import { test } from 'node:test'\nimport assert from 'node:assert/strict'\nimport { quote } from '../src/quote'\ntest('quote', () => assert.equal(quote({ discount: 0.1 }), 90))\n",
}
const write = (root, file, source) => { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), source) }
const main = path.join(destination, 'main')
for (const [file, source] of Object.entries(files)) write(main, file, source)
git(main, 'init', '-q'); git(main, 'add', '.'); git(main, '-c', 'user.name=Review Demo', '-c', 'user.email=demo@example.invalid', 'commit', '-qm', 'Synthetic review baseline')
const tasks = [
  { id: 'A', file: 'src/price.ts', source: files['src/price.ts'].replace('price * quantity', 'Math.round(price * quantity * 100) / 100'), prompt: 'Inspect the changed calculateTotal implementation and its static callers. Identify candidate tests and evidence gaps; do not execute tests or claim runtime coverage.' },
  { id: 'B', file: 'src/policy.ts', source: files['src/policy.ts'].replace('discount: number', 'discount: number\n  minimumTotal: number'), prompt: 'Review the changed public PricePolicy interface and importing dependents. Distinguish import evidence from resolved calls; identify test leads without claiming the interface migration is safe.' },
  { id: 'C', file: 'src/experimental.ts', source: files['src/experimental.ts'].replace("'preview'", "'preview-v2'"), prompt: 'Review experimentalLabel. If no static callers or test leads are found, explicitly state insufficient evidence; do not conclude there are no runtime users.' },
]
for (const task of tasks) {
  task.root = path.join(destination, task.id)
  git(main, 'worktree', 'add', '-qb', `demo-${task.id}`, task.root)
  write(task.root, task.file, task.source)
  delete task.source
}
const other = path.join(destination, 'other')
write(other, 'marker.ts', 'export function OTHER_REPO_ONLY() { return 99 }\n')
git(other, 'init', '-q'); git(other, 'add', '.'); git(other, '-c', 'user.name=Review Demo', '-c', 'user.email=demo@example.invalid', 'commit', '-qm', 'Distinct isolation marker')
const manifest = { main, other, tasks, baseline: git(main, 'rev-parse', 'HEAD').trim(), note: 'Candidate tests are source evidence only; this generator does not run them.' }
writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2))
console.log(JSON.stringify(manifest, null, 2))
