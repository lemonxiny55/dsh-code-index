export const STOP_WORDS = new Set(
  [
    'a',
    'an',
    'and',
    'are',
    'be',
    'by',
    'does',
    'for',
    'from',
    'how',
    'in',
    'is',
    'it',
    'my',
    'of',
    'on',
    'or',
    'the',
    'this',
    'to',
    'what',
    'where',
    'why',
    'with',
    'src', 'lib', 'test', 'tests', 'spec', 'fix', 'explain', 'please', 'help',
    'current', 'change', 'changes', 'code', 'repo', 'repository', 'function', 'symbol', 'git',
  ],
)

// Small, auditable vocabulary bridge into the existing identifier terms.
// These are retrieval hints, never symbol identities or relationship evidence.
const CONCEPT_TERMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/忽略|白名单|嵌套规则|gitignore/iu, 'ignore git'],
  [/扫描/u, 'scan'],
  [/索引/u, 'index scan'],
  [/监听|watcher/iu, 'watch'],
  [/刷新/u, 'refresh'],
  [/工具/u, 'tool'],
  [/配置/u, 'config'],
  [/加载/u, 'load'],
  [/空白|空格/u, 'whitespace'],
  [/启动/u, 'startup'],
]

/** Small deterministic term normalization; no statistical search model. */
export function contextTerms(text: string): string[] {
  const concepts = CONCEPT_TERMS.filter(([pattern]) => pattern.test(text)).map(([, terms]) => terms).join(' ')
  return [...new Set(`${concepts} ${text}`.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/)
    .filter(term => term.length >= 3 && !STOP_WORDS.has(term))
    .flatMap(term => [term, ...(term.length > 5 && term.endsWith('ing') ? [term.slice(0, -3)] : []),
      ...(term.length > 5 && term.endsWith('ed') ? [term.slice(0, -1), term.slice(0, -2)] : []),
      ...(term.length > 4 && term.endsWith('s') ? [term.slice(0, -1)] : [])]))]
}
