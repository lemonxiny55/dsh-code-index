import { describe, expect, it } from 'vitest'
import { excerptVariants, subtractExcerpt } from '../src/source-excerpts.js'

describe('bounded source evidence', () => {
  const symbol = { file: 'core.ts', line: 2, endLine: 4, signature: 'core()' }
  it('keeps exact whole-line ranges and degrades oversized bodies without slicing code', () => {
    expect(excerptVariants(['import x', 'function core() {', ' return 1', '}', 'noise'], symbol)[0])
      .toMatchObject({ startLine: 2, endLine: 4, mode: 'complete', code: 'function core() {\n return 1\n}' })
    const large = excerptVariants(Array.from({ length: 200 }, (_, i) => `line ${i}`), { ...symbol, endLine: 200 })
    expect(large[0].mode).toBe('window')
    const oneLine = excerptVariants(['import x', 'x'.repeat(2000)], { ...symbol, endLine: 2 })
    expect(oneLine).toEqual([expect.objectContaining({ mode: 'signature', signature: 'core()' })])
    expect(oneLine[0].code).toBeUndefined()
  })
  it('deduplicates overlapping current ranges without crossing base boundaries', () => {
    const excerpt = excerptVariants(['a', 'b', 'c', 'd'], symbol)[0]
    const selected = { ...excerpt, startLine: 3, endLine: 3, code: 'c' }
    expect(subtractExcerpt(excerpt, [selected]).map(item => [item.startLine, item.endLine, item.code]))
      .toEqual([[2, 2, 'b'], [4, 4, 'd']])
    expect(subtractExcerpt({ ...excerpt, side: 'base', ref: 'HEAD' }, [selected])).toHaveLength(1)
  })
})
