import type { RepoIndex } from './types.js'

/** One summary and at most three file locations. No source or exception dump. */
export function indexIntegrityWarnings(index: RepoIndex): string[] {
  const affected = index.files.filter(file => file.diagnostic && file.diagnostic.status !== 'parsed')
  if (!affected.length) return []
  const partial = affected.filter(file => file.diagnostic!.status === 'partial').length
  return [
    `index incomplete: ${partial} partial, ${affected.length - partial} failed; inspect code_index`,
    ...affected.slice(0, 3).map(file => {
      const diagnostic = file.diagnostic!
      const location = diagnostic.issues[0]?.line
      return `${file.path.slice(0, 100)}${location ? `:${location}` : ''}: ${diagnostic.status} (${diagnostic.reason ?? `${diagnostic.errorCount} ERROR, ${diagnostic.missingCount} MISSING`})`
    }),
  ]
}
