/**
 * Unified-diff parsing and a thin `git` adapter.
 *
 * `parseUnifiedDiff` is pure (no IO) so it is unit-testable in isolation; the
 * two readers shell out to `git` exclusively through `execFile` with an argv
 * array — a ref or path is never interpolated into a shell string.
 */

import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

/** One `@@` hunk header; a missing count means 1 (git omits `,1`). */
export interface DiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
}

/** One file's entry in a unified diff. */
export interface FileChange {
  /** Repo-relative path on the base side, or null for an added file. */
  oldPath: string | null
  /** Repo-relative path on the current side, or null for a deleted file. */
  newPath: string | null
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  hunks: DiffHunk[]
}

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/
const HEADER_PATH_PREFIX_RE = /^[ab]\//
/** Git can emit large diffs; keep a generous but bounded capture buffer. */
const MAX_BUFFER = 64 * 1024 * 1024

interface Draft {
  oldPath: string | null
  newPath: string | null
  /** Fallback paths from the `diff --git` line, overridden by later records. */
  gitOldPath: string | null
  gitNewPath: string | null
  /** Set when `---`/`+++` was seen, so an explicit /dev/null is not re-filled. */
  sawOldHeader: boolean
  sawNewHeader: boolean
  renameFrom: string | null
  renameTo: string | null
  newFile: boolean
  deletedFile: boolean
  hunks: DiffHunk[]
  /** Once a hunk starts, `---`/`+++` lines are content, not file headers. */
  sawHunk: boolean
}

function newDraft(): Draft {
  return {
    oldPath: null,
    newPath: null,
    gitOldPath: null,
    gitNewPath: null,
    sawOldHeader: false,
    sawNewHeader: false,
    renameFrom: null,
    renameTo: null,
    newFile: false,
    deletedFile: false,
    hunks: [],
    sawHunk: false,
  }
}

/**
 * Parse `git diff` / `diff -u` output into per-file changes. Handles
 * `diff --git`, `new file mode`, `deleted file mode`, `rename from/to`,
 * `---`/`+++` (including `/dev/null`), and `@@` headers with omitted counts.
 */
export function parseUnifiedDiff(text: string): FileChange[] {
  const changes: FileChange[] = []
  let draft: Draft | null = null

  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      if (draft) changes.push(finalize(draft))
      draft = newDraft()
      const [rawOld, rawNew] = splitDiffGitPaths(line.slice('diff --git '.length))
      draft.gitOldPath = rawOld === null ? null : parseHeaderPath(rawOld)
      draft.gitNewPath = rawNew === null ? null : parseHeaderPath(rawNew)
      continue
    }

    if (!draft) {
      // Bare unified diff without a `diff --git` preamble: start on the first
      // recognized file line and ignore anything before it.
      if (!isFileLine(line)) continue
      draft = newDraft()
    }

    if (line.startsWith('new file mode ')) {
      draft.newFile = true
    } else if (line.startsWith('deleted file mode ')) {
      draft.deletedFile = true
    } else if (line.startsWith('rename from ')) {
      draft.renameFrom = parseRawPath(line.slice('rename from '.length))
    } else if (line.startsWith('rename to ')) {
      draft.renameTo = parseRawPath(line.slice('rename to '.length))
    } else if (!draft.sawHunk && line.startsWith('--- ')) {
      draft.oldPath = parseHeaderPath(line.slice(4))
      draft.sawOldHeader = true
    } else if (!draft.sawHunk && line.startsWith('+++ ')) {
      draft.newPath = parseHeaderPath(line.slice(4))
      draft.sawNewHeader = true
    } else if (line.startsWith('@@ ')) {
      const hunk = parseHunk(line)
      if (hunk) {
        draft.hunks.push(hunk)
        draft.sawHunk = true
      }
    }
  }

  if (draft) changes.push(finalize(draft))
  return changes
}

function isFileLine(line: string): boolean {
  return (
    line.startsWith('--- ') ||
    line.startsWith('+++ ') ||
    line.startsWith('@@ ') ||
    line.startsWith('new file mode ') ||
    line.startsWith('deleted file mode ') ||
    line.startsWith('rename from ') ||
    line.startsWith('rename to ')
  )
}

function finalize(draft: Draft): FileChange {
  let oldPath = draft.renameFrom ?? (draft.sawOldHeader ? draft.oldPath : draft.gitOldPath)
  let newPath = draft.renameTo ?? (draft.sawNewHeader ? draft.newPath : draft.gitNewPath)
  if (draft.newFile) oldPath = null
  if (draft.deletedFile) newPath = null
  let status: FileChange['status'] = 'modified'
  if (draft.newFile || (oldPath === null && newPath !== null && draft.renameFrom === null)) {
    status = 'added'
  } else if (
    draft.deletedFile ||
    (newPath === null && oldPath !== null && draft.renameTo === null)
  ) {
    status = 'deleted'
  } else if (draft.renameFrom !== null || draft.renameTo !== null) {
    status = 'renamed'
  }
  return { oldPath, newPath, status, hunks: draft.hunks }
}

/**
 * Extract the two repo paths from a `diff --git` body, honoring git's C-style
 * quoting; the tokens keep their `a/`/`b/` prefix for {@link parseHeaderPath}.
 */
function splitDiffGitPaths(rest: string): [string | null, string | null] {
  const tokens: string[] = []
  let index = 0
  while (index < rest.length && tokens.length < 2) {
    while (index < rest.length && rest[index] === ' ') index++
    if (index >= rest.length) break
    const start = index
    if (rest[index] === '"') {
      index++
      while (index < rest.length) {
        if (rest[index] === '\\') index += 2
        else if (rest[index] === '"') {
          index++
          break
        } else index++
      }
    } else {
      while (index < rest.length && rest[index] !== ' ') index++
    }
    tokens.push(rest.slice(start, index))
  }
  return [tokens[0] ?? null, tokens[1] ?? null]
}

function parseHunk(line: string): DiffHunk | null {
  const match = HUNK_RE.exec(line)
  if (!match) return null
  const oldCount = match[2] as string | undefined
  const newCount = match[4] as string | undefined
  return {
    oldStart: Number(match[1]),
    oldLines: oldCount === undefined ? 1 : Number(oldCount),
    newStart: Number(match[3]),
    newLines: newCount === undefined ? 1 : Number(newCount),
  }
}

/** `--- a/x` / `+++ b/x` / `--- /dev/null`, tolerating a trailing timestamp. */
function parseHeaderPath(raw: string): string | null {
  let value = raw
  const tab = value.indexOf('\t')
  if (tab >= 0) value = value.slice(0, tab)
  value = value.trim()
  if (value === '/dev/null') return null
  if (value.startsWith('"')) value = unquoteGitPath(value)
  value = value.replace(HEADER_PATH_PREFIX_RE, '')
  return value.length > 0 ? value : null
}

/** `rename from/to` paths are repo-relative with no `a/`/`b/` prefix. */
function parseRawPath(raw: string): string | null {
  let value = raw.trim()
  if (value.startsWith('"')) value = unquoteGitPath(value)
  return value.length > 0 ? value : null
}

/** Decode git's C-style quoted path (octal escapes reassembled as UTF-8 bytes). */
function unquoteGitPath(value: string): string {
  const inner = value.slice(1, -1)
  const bytes: number[] = []
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!
    if (ch !== '\\') {
      bytes.push(...Buffer.from(ch, 'utf8'))
      continue
    }
    i++
    const esc: string | undefined = inner[i]
    if (esc === undefined) break
    if (esc >= '0' && esc <= '7') {
      let octal = esc
      let next: string | undefined = inner[i + 1]
      while (octal.length < 3 && next !== undefined && next >= '0' && next <= '7') {
        octal += next
        i++
        next = inner[i + 1]
      }
      bytes.push(parseInt(octal, 8))
      continue
    }
    switch (esc) {
      case 'n':
        bytes.push(0x0a)
        break
      case 't':
        bytes.push(0x09)
        break
      case 'r':
        bytes.push(0x0d)
        break
      case 'f':
        bytes.push(0x0c)
        break
      case 'v':
        bytes.push(0x0b)
        break
      case 'b':
        bytes.push(0x08)
        break
      case 'a':
        bytes.push(0x07)
        break
      case '"':
        bytes.push(0x22)
        break
      case '\\':
        bytes.push(0x5c)
        break
      default:
        bytes.push(...Buffer.from(esc, 'utf8'))
    }
  }
  return Buffer.from(bytes).toString('utf8')
}

/** Reject a ref that git would parse as an option rather than a revision. */
function requireSafeRef(ref: string, label: string): void {
  if (ref.length === 0) throw new Error(`${label} must not be empty`)
  if (ref.startsWith('-')) throw new Error(`${label} must not start with '-': ${ref}`)
}

function runGit(args: readonly string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, encoding: 'utf8', maxBuffer: MAX_BUFFER }, (error, stdout) => {
      if (error) reject(error)
      else resolve(stdout)
    })
  })
}

/**
 * Working-tree diff against `baseRef`, rename-aware and hunk-minimal.
 * Excludes untracked files (git semantics) — callers should say so.
 */
export async function readWorkingTreeDiff(root: string, baseRef: string): Promise<string> {
  requireSafeRef(baseRef, 'baseRef')
  const tracked = await runGit(
    ['diff', '--no-ext-diff', '--find-renames', '--unified=0', baseRef, '--', '.'],
    root,
  )
  const untracked = await runGit(['ls-files', '--others', '--exclude-standard', '-z', '--'], root)
  const changes = parseUnifiedDiff(tracked)
  const untrackedFiles: Array<{ path: string; content: string; lines: number }> = []
  for (const rawPath of untracked.split('\0')) {
    if (rawPath.length === 0) continue
    const normalized = rawPath.replace(/\\/g, '/')
    // The index cache is intentionally local state, even when the host repo
    // has no .gitignore yet. It must not appear as a source change.
    if (normalized === '.dsh-code-index' || normalized.startsWith('.dsh-code-index/')) continue
    try {
      const content = await readFile(path.resolve(root, normalized), 'utf8')
      const lines = content.length === 0 ? 0 : content.split(/\r?\n/).length - (content.endsWith('\n') ? 1 : 0)
      untrackedFiles.push({ path: normalized, content, lines })
    } catch {
      // A file can disappear between ls-files and readFile. Git would also
      // omit that race, so leave it out rather than failing the whole diff.
    }
  }

  // Git cannot detect an unstaged rename because its destination is still
  // untracked. Pair exact-content deleted/base files with untracked files so
  // the change-context layer receives the same rename signal as a staged diff.
  const paired = new Set<string>()
  for (const change of changes) {
    if (change.status !== 'deleted' || change.oldPath === null) continue
    let oldContent: string
    try {
      oldContent = await runGit(['show', `${baseRef}:${change.oldPath}`], root)
    } catch {
      continue
    }
    const match = untrackedFiles.find((file) => !paired.has(file.path) && file.content === oldContent)
    if (!match) continue
    change.newPath = match.path
    change.status = 'renamed'
    change.hunks = []
    paired.add(match.path)
  }

  for (const file of untrackedFiles) {
    if (paired.has(file.path)) continue
    changes.push({
      oldPath: null,
      newPath: file.path,
      status: 'added',
      hunks: file.lines > 0 ? [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: file.lines }] : [],
    })
  }
  return renderNormalizedDiff(changes)
}

/** Re-render only the structural part consumed by parseUnifiedDiff. */
function renderNormalizedDiff(changes: readonly FileChange[]): string {
  return changes
    .map((change) => {
      const oldPath = change.oldPath ?? change.newPath!
      const newPath = change.newPath ?? change.oldPath!
      const lines = [`diff --git ${diffToken(`a/${oldPath}`)} ${diffToken(`b/${newPath}`)}`]
      if (change.status === 'added') lines.push('new file mode 100644')
      if (change.status === 'deleted') lines.push('deleted file mode 100644')
      if (change.status === 'renamed') {
        lines.push('similarity index 100%', `rename from ${diffToken(change.oldPath!)}`, `rename to ${diffToken(change.newPath!)}`)
      } else {
        lines.push(`--- ${change.oldPath === null ? '/dev/null' : diffToken(`a/${change.oldPath}`)}`)
        lines.push(`+++ ${change.newPath === null ? '/dev/null' : diffToken(`b/${change.newPath}`)}`)
      }
      for (const hunk of change.hunks) {
        const oldCount = hunk.oldLines === 1 ? '' : `,${hunk.oldLines}`
        const newCount = hunk.newLines === 1 ? '' : `,${hunk.newLines}`
        lines.push(`@@ -${hunk.oldStart}${oldCount} +${hunk.newStart}${newCount} @@`)
      }
      return `${lines.join('\n')}\n`
    })
    .join('')
}

function diffToken(value: string): string {
  return /[\s"]/.test(value) ? `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : value
}

/** Read one repo-relative file at a ref; null when the path/ref is absent. */
export async function readGitFileAtRef(
  root: string,
  ref: string,
  repoRelativePath: string,
): Promise<string | null> {
  requireSafeRef(ref, 'ref')
  try {
    return await runGit(['show', `${ref}:${repoRelativePath}`], root)
  } catch {
    return null
  }
}
