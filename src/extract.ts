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
import { type Node, Language, Parser, Query } from 'web-tree-sitter'
import type { SymbolInfo, SymbolKind } from './types.js'

const require = createRequire(import.meta.url)
// web-tree-sitter ≥0.25 is ESM with named exports; 0.20.x was CJS
// `export = Parser`. tsup externalizes the dep, so the import shape must
// match the published ESM entry.

export type LanguageId = 'typescript' | 'javascript' | 'python' | 'go' | 'rust' | 'java'

const WASM_DIR = path.dirname(require.resolve('tree-sitter-wasms/out/tree-sitter-typescript.wasm'))

const GRAMMAR_NAMES: Record<LanguageId, string> = {
  typescript: 'tree-sitter-typescript',
  javascript: 'tree-sitter-javascript',
  python: 'tree-sitter-python',
  go: 'tree-sitter-go',
  rust: 'tree-sitter-rust',
  java: 'tree-sitter-java',
}

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
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
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
  go: `
    (function_declaration) @function
    (method_declaration) @method
    (type_spec) @type
  `,
  rust: `
    (function_item) @function
    (function_signature_item) @method
    (struct_item) @class
    (enum_item) @enum
    (trait_item) @interface
  `,
  java: `
    (class_declaration) @class
    (interface_declaration) @interface
    (enum_declaration) @enum
    (method_declaration) @method
    (constructor_declaration) @method
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

// Import statements per language. Whole statements are captured; the module
// specifier is read from node fields in code (string quoting, dotted vs
// relative vs URL-style syntax differ per grammar). CommonJS require() is out
// of scope — the ES import surface covers the modern plugin ecosystem.
const IMPORT_QUERIES: Record<LanguageId, string> = {
  typescript: `
    (import_statement) @import
    (export_statement) @reexport
  `,
  javascript: `
    (import_statement) @import
    (export_statement) @reexport
  `,
  python: `
    (import_from_statement) @import
    (import_statement) @import
  `,
  go: `
    (import_spec) @import
  `,
  rust: `
    (use_declaration) @use
  `,
  java: `
    (import_declaration) @import
  `,
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

const languageCache = new Map<LanguageId, Promise<Language>>()

function getLanguage(id: LanguageId): Promise<Language> {
  let entry = languageCache.get(id)
  if (!entry) {
    entry = getParser().then(async () => {
      const grammarPath = path.join(WASM_DIR, `${GRAMMAR_NAMES[id]}.wasm`)
      const bytes = await readFile(grammarPath)
      const lang = await Language.load(bytes)
      // Precompile queries per language to catch authoring errors early.
      // (0.25 deprecates lang.query(); use the Query constructor.)
      new Query(lang, QUERIES[id]).delete()
      new Query(lang, IMPORT_QUERIES[id]).delete()
      return lang
    })
    languageCache.set(id, entry)
  }
  return entry
}

/**
 * Extract symbols and raw import specifiers from source text of the given
 * language, from a single parse. Returns rows ordered by file line. Never
 * throws for parse errors — a failed parse yields empty lists (the caller
 * logs and continues).
 */
export interface ExtractedFile {
  symbols: SymbolInfo[]
  /** Raw module specifiers, e.g. './util', 'node:fs', './utils' (py). */
  imports: string[]
}

export async function extractAll(code: string, id: LanguageId): Promise<ExtractedFile> {
  const lang = await getLanguage(id)
  const parser = await getParser()
  parser.setLanguage(lang)
  const tree = parser.parse(code)
  if (!tree) throw new Error(`tree-sitter parse returned null for a ${id} source`)
  try {
    const symbols: SymbolInfo[] = []
    const symbolQuery = new Query(lang, QUERIES[id])
    try {
      const captures = symbolQuery.captures(tree.rootNode)
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
        symbols.push({
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
      symbolQuery.delete()
    }

    const imports: string[] = []
    const importQuery = new Query(lang, IMPORT_QUERIES[id])
    try {
      for (const cap of importQuery.captures(tree.rootNode)) {
        const spec = specifierOf(id, cap.node)
        if (spec) imports.push(spec)
      }
    } finally {
      importQuery.delete()
    }

    symbols.sort((a, b) => a.line - b.line)
    return { symbols, imports }
  } finally {
    tree.delete()
  }
}

/** Symbols only — see extractAll for the combined parse. */
export async function extractSymbols(code: string, id: LanguageId): Promise<SymbolInfo[]> {
  return (await extractAll(code, id)).symbols
}

/** The declared name of a declaration node, via its `name` field. */
function nameOf(node: Node): string {
  const field = node.childForFieldName?.('name')
  if (field) return field.text.trim()
  // e.g. an anonymous default export — skip those.
  return ''
}

/** Read the raw module specifier out of a captured import statement. */
function specifierOf(id: LanguageId, node: Node): string | null {
  switch (node.type) {
    case 'import_statement':
      // ts/js: `import … from './x'` (source); python: `import a.b` (name)
      if (id === 'python') return dottedToPath(node.childForFieldName('name')?.text)
      return stripQuotes(node.childForFieldName('source')?.text)
    case 'export_statement':
      // ts/js re-export: `export … from './x'`; plain exports have no source
      return stripQuotes(node.childForFieldName('source')?.text)
    case 'import_from_statement': {
      // python: `from .utils import x` / `from mypkg.core import Thing`
      const raw = node.childForFieldName('module_name')?.text
      if (raw == null) return null
      return raw.startsWith('.') ? pythonRelative(raw) : dottedToPath(raw)
    }
    case 'import_spec': // go: `import "example.com/foo/util"`
      return stripQuotes(node.childForFieldName('path')?.text)
    case 'use_declaration': // rust: `use crate::a::b::{c, d}`
      return rustUsePath(node.childForFieldName('argument')?.text)
    case 'import_declaration': // java: `import com.example.Thing;`
      return dottedToPath(node.namedChildren[0]?.text)
    default:
      return null
  }
}

/**
 * Rust use paths: 'crate::a::b' is root-relative, 'super::x' is parent-module
 * ('../x'), 'self::x' is current ('./x'); everything else (std, external
 * crates) stays root-relative and simply won't resolve in-repo. Use-lists
 * ('a::b::{c,d}') contribute their base path.
 */
function rustUsePath(text: string | undefined | null): string | null {
  if (!text) return null
  const base = text.split('{')[0].trim()
  if (!base) return null
  const parts = base.split('::').filter(Boolean)
  if (parts[0] === 'crate') parts.shift()
  return parts.map((p) => (p === 'super' ? '..' : p === 'self' ? '.' : p)).join('/')
}

function stripQuotes(text: string | undefined | null): string | null {
  if (text == null || text.length < 2) return null
  const first = text[0]
  const last = text[text.length - 1]
  if ((first === "'" && last === "'") || (first === '"' && last === '"')) {
    return text.slice(1, -1)
  }
  return null
}

/** 'os.path' → 'os/path' — dotted module path to repo-relative-ish path. */
function dottedToPath(text: string | undefined | null): string | null {
  if (!text) return null
  return text.trim().replace(/\./g, '/')
}

/** '.utils' → './utils', '..pkg.mod' → '../pkg/mod' — python relative import. */
function pythonRelative(raw: string): string {
  const dots = raw.match(/^\.+/)?.[0].length ?? 0
  const rest = raw.slice(dots).replace(/\./g, '/')
  const prefix = dots === 1 ? './' : '../'.repeat(dots - 1)
  return prefix + rest
}

/** Best-effort declaration signature: `name` + parameter list, if any. */
function signatureFor(node: Node): string {
  const name = nameOf(node)
  // Field first (go method_declaration has both a receiver and a parameters
  // parameter_list — the field picks the right one), type fallback otherwise.
  const params =
    node.childForFieldName?.('parameters') ??
    node.namedChildren.find(
      (c) =>
        c?.type === 'formal_parameters' ||
        c?.type === 'method_parameters' ||
        c?.type === 'parameters' ||
        c?.type === 'parameter_list',
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
function isModuleLevelVariable(node: Node): boolean {
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
function isExported(id: LanguageId, node: Node): boolean {
  if (id === 'python') {
    // Python has no export syntax: a def/class directly under the module is
    // importable, anything nested (methods, inner functions) is not a
    // module-level symbol.
    return node.parent?.type === 'module'
  }
  if (id === 'go') {
    // Go exports by capitalisation, not by keyword.
    const name = nameOf(node)
    return !!name && /^[A-Z]/.test(name)
  }
  if (id === 'rust') {
    // `pub` = exported; `pub(crate)` & friends are crate-local, not public.
    return node.namedChildren.some(
      (c) => c?.type === 'visibility_modifier' && c.text === 'pub',
    )
  }
  if (id === 'java') {
    // Interface members are implicitly public.
    if (node.parent?.type === 'interface_body') return true
    return node.namedChildren.some((c) => c?.type === 'modifiers' && /\bpublic\b/.test(c?.text ?? ''))
  }
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === 'export_statement') return true
    if (parent.type === 'statement_block' || parent.type === 'class_body') return false
    if (parent.type === 'program') return false
  }
  return false
}

/**
 * Language quirks the query syntax can't express:
 * - python: no distinct method node — a def directly in a class body is one
 * - go: a type_spec is a class (struct) or interface by its type child
 * - rust: function_item directly in an impl body is a method
 */
function kindFor(id: LanguageId, node: Node, kind: SymbolKind): SymbolKind {
  if (id === 'python' && kind === 'function') {
    const inClassBody = node.parent?.type === 'block' && node.parent?.parent?.type === 'class_definition'
    if (inClassBody) return 'method'
  }
  if (id === 'go' && node.type === 'type_spec') {
    const type = node.childForFieldName('type')?.type
    if (type === 'struct_type') return 'class'
    if (type === 'interface_type') return 'interface'
    return 'type'
  }
  if (id === 'rust' && node.type === 'function_item') {
    const inImpl = node.parent?.type === 'declaration_list' && node.parent?.parent?.type === 'impl_item'
    if (inImpl) return 'method'
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