/**
 * tree-sitter symbol extraction.
 *
 * Parses a source text with a per-language grammar (web-tree-sitter WASM,
 * static grammars from tree-sitter-wasms) and returns flat SymbolInfo rows.
 *
 * NOTE on the dependency pin: web-tree-sitter must stay at ^0.20.x — newer
 * releases expect dylinked grammar wasm, while tree-sitter-wasms ships
 * static builds. Verified working pair: web-tree-sitter@0.20.8 + tree-sitter-wasms@0.1.13.
 */

import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import Parser from 'web-tree-sitter'
import type { SymbolInfo, SymbolKind } from './types.js'

const require = createRequire(import.meta.url)
// web-tree-sitter@0.20.8 is CJS `export = Parser`; default-interop gives the class directly.

export type LanguageId = 'typescript' | 'javascript' | 'python'

const WASM_DIR = path.dirname(require.resolve('tree-sitter-wasms/out/tree-sitter-typescript.wasm'))

const EXT_TO_LANG: Record<string, LanguageId> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.pyi': 'python',
}

export function languageForFile(filePath: string): LanguageId | null {
  const ext = path.extname(filePath).toLowerCase()
  return EXT_TO_LANG[ext] ?? null
}

/** Kind of a capture per query. */
type CaptureDef = { kind: SymbolKind; exported?: boolean }

// Query definitions per language. Captures bind to the DECLARATION node
// (capture OUTSIDE the pattern: `(function_declaration) @function` — the
// 0.20 query parser rejects a capture sitting directly after the node type
// inside the parens). Names/signatures/export come from node fields.
const QUERIES: Record<LanguageId, string> = {
  typescript: `
    (function_declaration) @function
    (generator_function_declaration) @function
    (method_definition) @method
    (class_declaration) @class
    (interface_declaration) @interface
    (type_alias_declaration) @type
    (enum_declaration) @enum
    (variable_declarator) @variable
    (public_field_definition) @field
    (abstract_class_declaration) @class
  `,
  // JS shares the same query surface; type-related patterns simply never match.
  javascript: `
    (function_declaration) @function
    (generator_function_declaration) @function
    (method_definition) @method
    (class_declaration) @class
    (variable_declarator) @variable
  `,
  python: `
    (function_definition) @function
    (class_definition) @class
  `,
}

const CAPTURE_KINDS: Record<string, CaptureDef> = {
  function: { kind: 'function' },
  method: { kind: 'method' },
  class: { kind: 'class' },
  interface: { kind: 'interface' },
  type: { kind: 'type' },
  enum: { kind: 'enum' },
  variable: { kind: 'variable' },
  field: { kind: 'field' },
}

let parserPromise: Promise<Parser> | null = null

async function getParser(): Promise<Parser> {
  if (!parserPromise) {
    parserPromise = (async () => {
      const wasm = path.join(path.dirname(require.resolve('web-tree-sitter')), 'tree-sitter.wasm')
      await Parser.init({ locateFile: () => wasm })
      const p = new Parser()
      return p
    })()
  }
  return parserPromise
}

const languageCache = new Map<LanguageId, Promise<Parser.Language>>()

function getLanguage(id: LanguageId): Promise<Parser.Language> {
  let entry = languageCache.get(id)
  if (!entry) {
    entry = getParser().then(async (parser) => {
      const grammarName =
        id === 'typescript'
          ? 'tree-sitter-typescript'
          : id === 'javascript'
            ? 'tree-sitter-javascript'
            : 'tree-sitter-python'
      const grammarPath = path.join(WASM_DIR, `${grammarName}.wasm`)
      const bytes = await readFile(grammarPath)
      const lang = await Parser.Language.load(bytes)
      // Precompile queries per language to catch authoring errors early.
      const q = lang.query(QUERIES[id])
      q.delete()
      return lang
    })
    languageCache.set(id, entry)
  }
  return entry
}

/**
 * Extract all top-level symbols from source text of the given language.
 * Returns rows ordered by file line. Never throws for parse errors — a
 * failed parse yields an empty list (the caller logs and continues).
 */
export async function extractSymbols(code: string, id: LanguageId): Promise<SymbolInfo[]> {
  const lang = await getLanguage(id)
  const parser = await getParser()
  parser.setLanguage(lang)
  const tree = parser.parse(code)
  try {
    const query = lang.query(QUERIES[id])
    const rows: SymbolInfo[] = []
    try {
      const captures = query.captures(tree.rootNode)
      for (const cap of captures) {
        const def = CAPTURE_KINDS[cap.name]
        if (!def) continue
        const node = cap.node
        // tree-sitter queries match at any depth; without this check the
        // variable_declarator pattern would also capture function-body
        // locals — pure index noise.
        if (def.kind === 'variable' && !isModuleLevelVariable(node)) continue
        const name = nameOf(node)
        if (!name) continue
        rows.push({
          name,
          kind: kindFor(id, node, def.kind),
          file: '', // set by the caller (extractor is file-agnostic)
          line: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          exported: isExported(id, node),
          signature: signatureFor(node),
        })
      }
    } finally {
      query.delete()
    }
    rows.sort((a, b) => a.line - b.line)
    return rows
  } finally {
    tree.delete()
  }
}

/** The declared name of a declaration node, via its `name` field. */
function nameOf(node: Parser.SyntaxNode): string {
  const field = node.childForFieldName?.('name')
  if (field) return field.text.trim()
  // e.g. an anonymous default export — skip those.
  return ''
}

/** Best-effort declaration signature: `name` + parameter list, if any. */
function signatureFor(node: Parser.SyntaxNode): string {
  const name = nameOf(node)
  const params = node.namedChildren.find(
    (c) =>
      c.type === 'formal_parameters' || c.type === 'method_parameters' || c.type === 'parameters',
  )
  if (params) {
    return `${name}${collapseSpace(params.text)}`
  }
  const first = node.namedChildren[0]
  return first ? collapseSpace(first.text) : name
}

/**
 * Signatures must stay one line: repo-map rows are budgeted per line, and a
 * multi-line parameter list would both wrap the format and burn chars.
 */
function collapseSpace(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\( /g, '(')
    .replace(/ \)/g, ')')
    .replace(/ ,/g, ',')
    .replace(/,\)/g, ')')
    .trim()
}

/**
 * A variable is indexable only at module level: its declaration must sit
 * directly inside the program (or the export_statement wrapping it). Anything
 * deeper — function bodies, blocks, for-of heads — is a local with no
 * navigation value.
 */
function isModuleLevelVariable(node: Parser.SyntaxNode): boolean {
  const declaration = node.parent // variable_declaration | lexical_declaration
  const container = declaration?.parent // program | export_statement | …
  return container?.type === 'program' || container?.type === 'export_statement'
}

/**
 * A symbol is exported when walking up from it reaches an export_statement
 * before any function or class body — only module-level declarations count.
 * A method inside `export class` must NOT inherit the class's export, and a
 * function nested inside an exported function is not exported either.
 */
function isExported(id: LanguageId, node: Parser.SyntaxNode): boolean {
  if (id === 'python') {
    // Python has no export syntax: a def/class directly under the module is
    // importable, anything nested (methods, inner functions) is not a
    // module-level symbol.
    return node.parent?.type === 'module'
  }
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === 'export_statement') return true
    if (parent.type === 'statement_block' || parent.type === 'class_body') return false
    if (parent.type === 'program') return false
  }
  return false
}

/**
 * Python has no distinct method node: a function_definition sitting directly
 * in a class body block is a method. Everything else keeps the query's kind.
 */
function kindFor(id: LanguageId, node: Parser.SyntaxNode, kind: SymbolKind): SymbolKind {
  if (id === 'python' && kind === 'function') {
    const inClassBody = node.parent?.type === 'block' && node.parent?.parent?.type === 'class_definition'
    if (inClassBody) return 'method'
  }
  return kind
}

/** Compile a symbol query for a code sample (used by tests). */
export async function parseFileToSymbols(
  filePath: string,
  repoRoot: string,
  code?: string,
): Promise<SymbolInfo[]> {
  const lang = languageForFile(filePath)
  if (!lang) return []
  const text = code ?? (await readFile(filePath, 'utf8'))
  const rows = await extractSymbols(text, lang)
  const rel = path.relative(repoRoot, filePath).split(path.sep).join('/')
  return rows.map((r) => ({ ...r, file: rel }))
}