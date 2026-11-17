// Validate recorded real tool outputs against the synthetic source on disk.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
const dir = import.meta.dirname
const report = JSON.parse(readFileSync(path.join(dir, 'm2-desktop-results.json'), 'utf8'))
assert.equal(report.globalToolsUnchanged, true)
assert.deepEqual(report.lifecycle, [8, 7, 8, 7])
const cases = []
for (let i = 0; i < 3; i++) {
  const [text, review, xray] = report.calls.slice(i * 3, i * 3 + 3)
  const value = review.result.value, brief = value.brief
  assert.deepEqual(xray.result.content, text.result.content)
  assert.equal(xray.result.meta.card, 'impact-xray')
  assert.deepEqual(review.result.content, [{ type: 'text', text: value.text }])
  assert.equal(brief.verification, 'not-run')
  assert.equal(brief.omitted.changes, 0)
  for (const row of brief.changes) {
    const lines = readFileSync(path.join(review.arguments.repoRoot, row.file), 'utf8').split(/\r?\n/)
    assert.equal(row.code, lines.slice(row.startLine - 1, row.endLine).join('\n'))
  }
  cases.push({ task: 'ABC'[i], textChars: text.result.value.length, reviewEnvelopeChars: JSON.stringify(value).length,
    summary: brief.summary, changes: brief.changes.length, sourceBodies: brief.changes.filter(r => r.code).length,
    sourceTextMatchesDisk: true, tests: brief.tests, gaps: brief.gaps, textXrayCanonicalTextEqual: true })
}
assert.ok(report.calls[1].result.value.brief.relations.some(r => r.name === 'checkout' && r.resolution === 'exact'))
assert.ok(report.calls[1].result.value.brief.tests.some(r => r.resolution === 'import-scoped'))
assert.ok(report.calls[4].result.value.brief.tests.some(r => r.resolution === 'name-only'))
assert.equal(report.calls[7].result.value.brief.summary.relations, 0)
assert.equal(report.calls[7].result.value.brief.tests.length, 0)
assert.match(report.calls[7].result.value.text, /not proof of no callers or runtime impact/)
assert.match(JSON.stringify(report.calls[9].result.value), /OTHER_REPO_ONLY/)
assert.ok(!JSON.stringify(report.calls[9].result.value).includes('calculateTotal'))
assert.ok(!JSON.stringify(report.calls[10].result.value).includes('OTHER_REPO_ONLY'))
const budgets = report.calls.filter(c => c.arguments.outputFormat === 'review').map(c => {
  const used = JSON.stringify(c.result.value).length, limit = c.arguments.budgetChars ?? 5000
  assert.ok(used <= limit)
  return { limit, used }
})
const agents = ['A', 'B', 'C', 'B-max-tokens'].map(task => {
  const r = JSON.parse(readFileSync(path.join(dir, `m2-agent-${task}-results.json`), 'utf8'))
  const calls = r.events.filter(e => e.type === 'tool/call'), results = r.events.filter(e => e.type === 'tool/result')
  assert.equal(calls.length, r.toolCalls)
  assert.equal(results.length, calls.length)
  assert.equal(r.globalToolsUnchanged, true)
  for (const result of results) assert.equal(result.data.message.isError, false)
  if (task !== 'B-max-tokens') {
    assert.equal(r.turnEnd.reason.kind, 'completed')
    for (const format of ['text', 'review']) assert.ok(calls.some(c => { const a = JSON.parse(c.data.arguments); return a.outputFormat === format && !a.symbols && !a.files }))
  } else assert.equal(r.turnEnd.reason.kind, 'max-tokens')
  return { task, toolCalls: r.toolCalls, end: r.turnEnd.reason.kind, finalPresent: Boolean(r.final),
    invalidSymbolSelections: calls.filter(c => JSON.parse(c.data.arguments).symbols).length,
    semanticVerdict: task === 'B-max-tokens' ? 'INCOMPLETE' : 'COMPLETED_WITH_RECORDED_CAVEATS' }
})
writeFileSync(path.join(dir, 'm2-output-audit.json'), JSON.stringify({ status: 'PASS', scope: 'Recorded tool contracts and source equality; not an assertion that all model conclusions are correct', cases, budgets, agents }, null, 2))
console.log(JSON.stringify({ status: 'PASS', cases: cases.length, reviewCalls: budgets.length, agents }))
