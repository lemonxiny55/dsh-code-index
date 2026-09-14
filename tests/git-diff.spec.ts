import { describe, expect, it } from 'vitest'
import { parseUnifiedDiff, readGitFileAtRef, readWorkingTreeDiff } from '../src/git-diff.js'

describe('parseUnifiedDiff', () => {
  it('parses an added file (/dev/null old side)', () => {
    const diff = [
      'diff --git a/src/new.ts b/src/new.ts',
      'new file mode 100644',
      'index 0000000..1111111',
      '--- /dev/null',
      '+++ b/src/new.ts',
      '@@ -0,0 +1,3 @@',
      '+export const a = 1',
      '+export const b = 2',
      '+export const c = 3',
    ].join('\n')
    expect(parseUnifiedDiff(diff)).toEqual([
      {
        oldPath: null,
        newPath: 'src/new.ts',
        status: 'added',
        hunks: [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: 3 }],
      },
    ])
  })

  it('parses a modified file with multiple hunks', () => {
    const diff = [
      'diff --git a/src/a.ts b/src/a.ts',
      'index 1aa..2bb 100644',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -2,2 +2,3 @@ export function fn()',
      '-old',
      '+new',
      '+extra',
      '@@ -10 +11 @@',
      '-x',
      '+y',
    ].join('\n')
    expect(parseUnifiedDiff(diff)).toEqual([
      {
        oldPath: 'src/a.ts',
        newPath: 'src/a.ts',
        status: 'modified',
        hunks: [
          { oldStart: 2, oldLines: 2, newStart: 2, newLines: 3 },
          { oldStart: 10, oldLines: 1, newStart: 11, newLines: 1 },
        ],
      },
    ])
  })

  it('parses a deleted file (+++ /dev/null)', () => {
    const diff = [
      'diff --git a/src/gone.ts b/src/gone.ts',
      'deleted file mode 100644',
      'index 3cc..0000000',
      '--- a/src/gone.ts',
      '+++ /dev/null',
      '@@ -1,4 +0,0 @@',
      '-a',
      '-b',
      '-c',
      '-d',
    ].join('\n')
    expect(parseUnifiedDiff(diff)).toEqual([
      {
        oldPath: 'src/gone.ts',
        newPath: null,
        status: 'deleted',
        hunks: [{ oldStart: 1, oldLines: 4, newStart: 0, newLines: 0 }],
      },
    ])
  })

  it('parses a pure rename with no hunks', () => {
    const diff = [
      'diff --git a/src/old.ts b/src/new.ts',
      'similarity index 100%',
      'rename from src/old.ts',
      'rename to src/new.ts',
    ].join('\n')
    expect(parseUnifiedDiff(diff)).toEqual([
      {
        oldPath: 'src/old.ts',
        newPath: 'src/new.ts',
        status: 'renamed',
        hunks: [],
      },
    ])
  })

  it('parses a rename with content change from ---/+++', () => {
    const diff = [
      'diff --git a/src/old.ts b/src/new.ts',
      'similarity index 80%',
      'rename from src/old.ts',
      'rename to src/new.ts',
      '--- a/src/old.ts',
      '+++ b/src/new.ts',
      '@@ -1 +1 @@',
      '-a',
      '+b',
    ].join('\n')
    const [change] = parseUnifiedDiff(diff)
    expect(change).toMatchObject({
      oldPath: 'src/old.ts',
      newPath: 'src/new.ts',
      status: 'renamed',
    })
    expect(change!.hunks).toEqual([{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1 }])
  })

  it('defaults an omitted hunk count to 1', () => {
    const diff = [
      'diff --git a/x.ts b/x.ts',
      '--- a/x.ts',
      '+++ b/x.ts',
      '@@ -1 +1 @@',
      '-a',
      '+b',
    ].join('\n')
    expect(parseUnifiedDiff(diff)[0]!.hunks).toEqual([
      { oldStart: 1, oldLines: 1, newStart: 1, newLines: 1 },
    ])
  })

  it('treats ---/+++ content lines inside a hunk as content, not headers', () => {
    const diff = [
      'diff --git a/x.ts b/x.ts',
      '--- a/x.ts',
      '+++ b/x.ts',
      '@@ -1,3 +1,3 @@',
      ' keep',
      '--- removed comment',
      '+++ added comment',
      ' end',
    ].join('\n')
    const [change] = parseUnifiedDiff(diff)
    expect(change).toMatchObject({ oldPath: 'x.ts', newPath: 'x.ts' })
    expect(change!.hunks).toHaveLength(1)
  })

  it('parses multiple files in one diff and unquotes spaced paths', () => {
    const diff = [
      'diff --git a/a.ts b/a.ts',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -1 +1 @@',
      '-a',
      '+b',
      'diff --git "a/has space.ts" "b/has space.ts"',
      '--- "a/has space.ts"',
      '+++ "b/has space.ts"',
      '@@ -1 +1 @@',
      '-c',
      '+d',
    ].join('\n')
    const changes = parseUnifiedDiff(diff)
    expect(changes.map((change) => change.newPath)).toEqual(['a.ts', 'has space.ts'])
  })

  it('parses a bare unified diff without a diff --git preamble', () => {
    const diff = ['--- a/x.ts', '+++ b/x.ts', '@@ -1 +1 @@', '-a', '+b'].join('\n')
    expect(parseUnifiedDiff(diff)).toEqual([
      {
        oldPath: 'x.ts',
        newPath: 'x.ts',
        status: 'modified',
        hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1 }],
      },
    ])
  })

  it('keeps both paths from a mode-only diff --git block', () => {
    const diff = [
      'diff --git a/script.sh b/script.sh',
      'old mode 100644',
      'new mode 100755',
    ].join('\n')
    expect(parseUnifiedDiff(diff)).toEqual([
      { oldPath: 'script.sh', newPath: 'script.sh', status: 'modified', hunks: [] },
    ])
  })

  it('keeps both paths from a binary diff --git block, quoted included', () => {
    const binary = [
      'diff --git a/img.png b/img.png',
      'index 1111111..2222222 100644',
      'Binary files a/img.png and b/img.png differ',
    ].join('\n')
    expect(parseUnifiedDiff(binary)).toEqual([
      { oldPath: 'img.png', newPath: 'img.png', status: 'modified', hunks: [] },
    ])

    const spaced = [
      'diff --git "a/has space.png" "b/has space.png"',
      'Binary files "a/has space.png" and "b/has space.png" differ',
    ].join('\n')
    expect(parseUnifiedDiff(spaced)).toEqual([
      { oldPath: 'has space.png', newPath: 'has space.png', status: 'modified', hunks: [] },
    ])
  })

  it('nulls the missing side for added and deleted binary blocks', () => {
    const added = [
      'diff --git a/img.png b/img.png',
      'new file mode 100644',
      'Binary files /dev/null and b/img.png differ',
    ].join('\n')
    expect(parseUnifiedDiff(added)).toEqual([
      { oldPath: null, newPath: 'img.png', status: 'added', hunks: [] },
    ])

    const deleted = [
      'diff --git a/img.png b/img.png',
      'deleted file mode 100644',
      'Binary files a/img.png and /dev/null differ',
    ].join('\n')
    expect(parseUnifiedDiff(deleted)).toEqual([
      { oldPath: 'img.png', newPath: null, status: 'deleted', hunks: [] },
    ])
  })

  it('returns an empty array for empty or unrelated text', () => {
    expect(parseUnifiedDiff('')).toEqual([])
    expect(parseUnifiedDiff('nothing to see\n')).toEqual([])
  })
})

describe('git readers', () => {
  it('rejects a ref that starts with a dash', async () => {
    await expect(readWorkingTreeDiff('/tmp', '-c')).rejects.toThrow()
    await expect(readGitFileAtRef('/tmp', '--help', 'src/a.ts')).rejects.toThrow()
  })
})
