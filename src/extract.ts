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
import type {
  CallInfo,
  ImportBinding,
  ImportInfo,
  ScopeKind,
  SymbolInfo,
  SymbolKind,
  SymbolScopePart,
} from './types.js'

const require = createRequire(import.meta.url)
// web-tree-sitter ≥0.25 is ESM with named exports; 0.20.x was CJS
// `export = Parser`. tsup externalizes the dep, so the import shape must
// match the published ESM entry.

export type LanguageId =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'go'
  | 'rust'
  | 'java'
  | 'cpp'
  | 'c'

const WASM_DIR = path.dirname(require.resolve('tree-sitter-wasms/out/tree-sitter-typescript.wasm'))

const GRAMMAR_NAMES: Record<LanguageId, string> = {
  typescript: 'tree-sitter-typescript',
  javascript: 'tree-sitter-javascript',
  python: 'tree-sitter-python',
  go: 'tree-sitter-go',
  rust: 'tree-sitter-rust',
  java: 'tree-sitter-java',
  cpp: 'tree-sitter-cpp',
  c: 'tree-sitter-c',
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
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.c++': 'cpp',
  '.hpp': 'cpp',
  '.hxx': 'cpp',
  '.hh': 'cpp',
  '.h': 'cpp',
  '.ipp': 'cpp',
  '.tpp': 'cpp',
  '.inl': 'cpp',
  '.c': 'c',
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
  // C++ grammar (superset of C — also serves .h headers). function names
  // live inside the declarator chain, so patterns stay broad and names,
  // kinds and signatures are resolved in code (cppNameOf / kindFor /
  // signatureFor). Top-level `declaration` covers prototypes, constructors
  // and globals; field_declaration covers class-body members.
  cpp: `
    (function_definition) @function
    (class_specifier body: (_)) @class
    (struct_specifier body: (_)) @class
    (enum_specifier body: (_)) @enum
    (type_definition) @type
    (alias_declaration) @type
    (namespace_definition) @module
    (field_declaration) @field
    (declaration) @variable
  `,
  // Plain C: same core nodes minus C++-only namespace/alias forms.
  c: `
    (function_definition) @function
    (struct_specifier body: (_)) @class
    (enum_specifier body: (_)) @enum
    (type_definition) @type
    (field_declaration) @field
    (declaration) @variable
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
  module: { kind: 'module' },
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
  // C/C++: #include "local.hpp" — quoted form resolves in-repo; <system>
  // captures too but yields null and is dropped by the extractor.
  cpp: `
    (preproc_include) @import
  `,
  c: `
    (preproc_include) @import
  `,
}

// Call expressions per language. Each capture binds the CALLEE name node, so
// the extractor can build a function-level call graph (see enclosingCallable).
// Member/selector calls capture the property/field tail, which is what a
// definition lookup matches; `new X()` is a construction call.
const CALL_QUERIES: Record<LanguageId, string> = {
  typescript: `
    (call_expression function: (identifier) @call)
    (call_expression function: (member_expression property: (property_identifier) @call))
    (new_expression constructor: (identifier) @call)
  `,
  javascript: `
    (call_expression function: (identifier) @call)
    (call_expression function: (member_expression property: (property_identifier) @call))
    (new_expression constructor: (identifier) @call)
  `,
  python: `
    (call function: (identifier) @call)
    (call function: (attribute attribute: (identifier) @call))
  `,
  go: `
    (call_expression function: (identifier) @call)
    (call_expression function: (selector_expression field: (field_identifier) @call))
  `,
  rust: `
    (call_expression function: (identifier) @call)
    (call_expression function: (field_expression field: (field_identifier) @call))
    (call_expression function: (scoped_identifier name: (identifier) @call))
  `,
  java: `
    (method_invocation name: (identifier) @call)
    (object_creation_expression type: (type_identifier) @call)
  `,
  cpp: `
    (call_expression function: (identifier) @call)
    (call_expression function: (field_expression field: (field_identifier) @call))
    (call_expression function: (qualified_identifier name: (identifier) @call))
  `,
  c: `
    (call_expression function: (identifier) @call)
    (call_expression function: (field_expression field: (field_identifier) @call))
  `,
}

// Ancestor node types that own a call body, per language. Walking up from a
// call site to the nearest one yields the function whose callees they are.
const CALLABLE_NODES: Record<LanguageId, Set<string>> = {
  typescript: new Set([
    'function_declaration',
    'generator_function_declaration',
    'method_definition',
    'function_expression',
    'arrow_function',
  ]),
  javascript: new Set([
    'function_declaration',
    'generator_function_declaration',
    'method_definition',
    'function_expression',
    'arrow_function',
  ]),
  python: new Set(['function_definition']),
  go: new Set(['function_declaration', 'method_declaration', 'func_literal']),
  rust: new Set(['function_item', 'function_signature_item']),
  java: new Set(['method_declaration', 'constructor_declaration']),
  cpp: new Set(['function_definition', 'lambda_expression']),
  c: new Set(['function_definition']),
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
      new Query(lang, CALL_QUERIES[id]).delete()
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
/** RFC 3986-strict component encoding for symbol ids (encodes `! ' ( ) * ~`). */
export function encodeSymbolComponent(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*~]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

/** A captured declaration retained until stable ids can be assigned. */
export interface SymbolDraft {
  symbol: Omit<SymbolInfo, 'id' | 'scope' | 'ordinal' | 'file'>
  node: Node
}

export interface ExtractedFile {
  symbols: SymbolInfo[]
  /** Derived compatibility view of {@link importDetails} specifiers. */
  imports: string[]
  /** Structured import/include/use sites with name bindings. */
  importDetails: ImportInfo[]
  /** Call sites, ordered by line: callee name + enclosing function. */
  calls: CallInfo[]
}

export async function extractAll(
  code: string,
  id: LanguageId,
  file = '',
): Promise<ExtractedFile> {
  const lang = await getLanguage(id)
  const parser = await getParser()
  parser.setLanguage(lang)
  const tree = parser.parse(code)
  if (!tree) throw new Error(`tree-sitter parse returned null for a ${id} source`)
  try {
    const drafts: SymbolDraft[] = []
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
        if (def.kind === 'variable' && !isModuleLevelVariable(id, node)) continue
        const name = nameOf(id, node)
        if (!name) continue
        drafts.push({
          symbol: {
            name,
            kind: kindFor(id, node, def.kind),
            line: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            exported: isExported(id, node),
            signature: signatureFor(id, node),
          },
          node,
        })
      }
    } finally {
      symbolQuery.delete()
    }

    const dedupedDrafts = dedupeDrafts(drafts)
    const symbols = assignSymbolIds(file, dedupedDrafts, id)
    const symbolByNodeId = new Map<number, SymbolInfo>()
    dedupedDrafts.forEach((draft, index) => symbolByNodeId.set(draft.node.id, symbols[index]))

    const importDetails: ImportInfo[] = []
    const importQuery = new Query(lang, IMPORT_QUERIES[id])
    try {
      for (const cap of importQuery.captures(tree.rootNode)) {
        for (const info of importInfoFor(id, cap.node)) importDetails.push(info)
      }
    } finally {
      importQuery.delete()
    }
    const imports = importDetails.map((info) => info.specifier)

    const calls: CallInfo[] = []
    const callQuery = new Query(lang, CALL_QUERIES[id])
    try {
      const seen = new Set<string>()
      for (const cap of callQuery.captures(tree.rootNode)) {
        const name = cap.node.text.trim()
        if (!name) continue
        const line = cap.node.startPosition.row + 1
        const callable = enclosingCallableNode(id, cap.node)
        const from = callable ? callableNameOf(id, callable) : ''
        const fromId = callable ? nearestDraftId(callable, symbolByNodeId) : null
        const key = `${from}|${name}|${line}`
        if (seen.has(key)) continue
        seen.add(key)
        calls.push({ name, line, from, fromId, qualifier: qualifierOf(cap.node) })
      }
    } finally {
      callQuery.delete()
    }
    calls.sort((a, b) => a.line - b.line || a.name.localeCompare(b.name))

    symbols.sort(
      (a, b) =>
        a.line - b.line ||
        a.endLine - b.endLine ||
        a.kind.localeCompare(b.kind) ||
        a.name.localeCompare(b.name),
    )
    return { symbols, imports, importDetails, calls }
  } finally {
    tree.delete()
  }
}

/**
 * Drop duplicate captures of the *same* AST node only. Keying by
 * `kind|name|line` would also collapse two distinct same-named declarations
 * sharing a line (`class A { run() {} } class B { run() {} }`); identity
 * keeps them so `assignOrdinals` can separate them by source order.
 */
function dedupeDrafts(drafts: SymbolDraft[]): SymbolDraft[] {
  const sorted = [...drafts].sort(
    (a, b) => a.symbol.line - b.symbol.line || a.node.startIndex - b.node.startIndex,
  )
  const seen = new Set<number>()
  const out: SymbolDraft[] = []
  for (const draft of sorted) {
    if (seen.has(draft.node.id)) continue
    seen.add(draft.node.id)
    out.push(draft)
  }
  return out
}

/** One scope owner descriptor produced by a language-specific helper. */
interface OwnerDesc {
  kind: ScopeKind
  name: string
}

/** A scope node: a captured declaration or a synthetic owner, by index. */
interface ScopeEntry {
  kind: ScopeKind
  name: string
  startIndex: number
  endIndex: number
  /** Index of the parent entry; -1 = module root. */
  parent: number
  ordinal: number
  scopeKey: string
  /** Draft index for captured declarations; -1 for synthetic owners. */
  draftIndex: number
}

const MATCHABLE_OWNER_KINDS: ReadonlySet<ScopeKind> = new Set([
  'class',
  'interface',
  'trait',
  'module',
  'namespace',
  'impl',
])

/** Map a captured symbol kind onto the scope vocabulary used in symbol ids. */
function scopeKindOf(language: LanguageId, kind: SymbolKind): ScopeKind {
  switch (kind) {
    case 'class':
      return 'class'
    case 'interface':
      return language === 'rust' ? 'trait' : 'interface'
    case 'function':
      return 'function'
    case 'method':
      return 'method'
    case 'module':
      return language === 'cpp' ? 'namespace' : 'module'
    default:
      return 'owner'
  }
}

function segmentOf(entry: ScopeEntry): string {
  return `${entry.kind}:${encodeSymbolComponent(entry.name)}@${entry.ordinal}`
}

/**
 * Assign stable qualified ids, owner scopes and sibling ordinals to captured
 * declarations. Ordinals are 1-based within a `(parent scope, kind, name)`
 * group, ordered by source position, so ids survive blank-line/comment/body
 * edits but not reordering or inserting an earlier duplicate.
 */
export function assignSymbolIds(
  file: string,
  drafts: readonly SymbolDraft[],
  language: LanguageId,
): SymbolInfo[] {
  const entries: ScopeEntry[] = drafts.map((draft, index) => ({
    kind: scopeKindOf(language, draft.symbol.kind),
    name: draft.symbol.name,
    startIndex: draft.node.startIndex,
    endIndex: draft.node.endIndex,
    parent: -1,
    ordinal: 1,
    scopeKey: '',
    draftIndex: index,
  }))
  const entryByNodeId = new Map<number, number>()
  drafts.forEach((draft, index) => entryByNodeId.set(draft.node.id, index))
  const entriesByName = new Map<string, number[]>()
  entries.forEach((entry, index) => {
    const list = entriesByName.get(entry.name)
    if (list) list.push(index)
    else entriesByName.set(entry.name, [index])
  })

  const syntheticByKey = new Map<string, number>()

  const resolveOwner = (desc: OwnerDesc, parent: number, selfIndex: number): number => {
    const matches = entriesByName.get(desc.name)
    // Only an owner already scoped under the same parent may absorb this
    // segment — a global name match would attach `b::Widget::draw` to the
    // first `Widget` in the file. `owner` is a wildcard kind: the qualified
    // segment does not know whether it names a class or a namespace.
    const typed = matches?.find((index) => {
      if (index === selfIndex) return false
      const entry = entries[index]!
      if (!MATCHABLE_OWNER_KINDS.has(entry.kind)) return false
      if (entry.parent !== parent) return false
      return desc.kind === 'owner' || entry.kind === desc.kind
    })
    if (typed !== undefined) return typed
    const key = `${parent}\u0000${desc.kind}\u0000${desc.name}`
    const existing = syntheticByKey.get(key)
    if (existing !== undefined) return existing
    const index = entries.length
    entries.push({
      kind: desc.kind,
      name: desc.name,
      startIndex: Number.MAX_SAFE_INTEGER,
      endIndex: Number.MAX_SAFE_INTEGER,
      parent,
      ordinal: 1,
      scopeKey: '',
      draftIndex: -1,
    })
    syntheticByKey.set(key, index)
    return index
  }

  drafts.forEach((draft, index) => {
    let parent = -1
    for (let node = draft.node.parent; node; node = node.parent) {
      const owner = entryByNodeId.get(node.id)
      if (owner !== undefined) {
        parent = owner
        break
      }
    }
    for (const desc of ownerScopeOf(language, draft.node)) {
      parent = resolveOwner(desc, parent, index)
    }
    entries[index]!.parent = parent
  })

  assignOrdinals(entries)

  return drafts.map((draft, index) => {
    const entry = entries[index]!
    const chain: ScopeEntry[] = []
    for (let node: ScopeEntry | undefined = entries[entry.parent]; node; node = entries[node.parent]) {
      chain.push(node)
    }
    chain.reverse()
    const scope: SymbolScopePart[] = chain.map((node) => ({
      kind: node.kind,
      name: node.name,
      ordinal: node.ordinal,
    }))
    const segments = [...chain.map(segmentOf), segmentOf(entry)]
    return {
      ...draft.symbol,
      file,
      id: `sym:v1:${encodeSymbolComponent(file)}#${segments.join('/')}`,
      scope,
      ordinal: entry.ordinal,
    }
  })
}

/** BFS by depth so a parent's scopeKey is known before its children group. */
function assignOrdinals(entries: ScopeEntry[]): void {
  const depthCache = new Map<number, number>()
  const depthOf = (index: number): number => {
    const cached = depthCache.get(index)
    if (cached !== undefined) return cached
    const parent = entries[index]!.parent
    const value = parent >= 0 ? depthOf(parent) + 1 : 0
    depthCache.set(index, value)
    return value
  }

  const byDepth = new Map<number, number[]>()
  let maxDepth = 0
  for (let index = 0; index < entries.length; index++) {
    const depth = depthOf(index)
    maxDepth = Math.max(maxDepth, depth)
    const list = byDepth.get(depth)
    if (list) list.push(index)
    else byDepth.set(depth, [index])
  }

  for (let depth = 0; depth <= maxDepth; depth++) {
    const groups = new Map<string, number[]>()
    for (const index of byDepth.get(depth) ?? []) {
      const entry = entries[index]!
      const parentKey = entry.parent >= 0 ? entries[entry.parent]!.scopeKey : ''
      const key = `${parentKey}\u0000${entry.kind}\u0000${entry.name}`
      const list = groups.get(key)
      if (list) list.push(index)
      else groups.set(key, [index])
    }
    for (const group of groups.values()) {
      group.sort((a, b) => {
        const left = entries[a]!
        const right = entries[b]!
        return (
          left.startIndex - right.startIndex ||
          left.endIndex - right.endIndex ||
          left.kind.localeCompare(right.kind) ||
          left.name.localeCompare(right.name)
        )
      })
      group.forEach((index, position) => {
        const entry = entries[index]!
        entry.ordinal = position + 1
        const segment = segmentOf(entry)
        entry.scopeKey =
          entry.parent >= 0 ? `${entries[entry.parent]!.scopeKey}/${segment}` : segment
      })
    }
  }
}

/** Owners not represented by lexical ancestry (receiver/impl/qualified names). */
function ownerScopeOf(language: LanguageId, node: Node): OwnerDesc[] {
  if (language === 'go') return goReceiverOwners(node)
  if (language === 'rust') return rustImplOwners(node)
  if (language === 'cpp' || language === 'c') return cppQualifiedOwners(node)
  return []
}

function goReceiverOwners(node: Node): OwnerDesc[] {
  if (node.type !== 'method_declaration') return []
  const receiver = node.childForFieldName('receiver')
  const type = receiver ? findDescendant(receiver, 'type_identifier') : null
  return type ? [{ kind: 'class', name: type.text.trim() }] : []
}

function rustImplOwners(node: Node): OwnerDesc[] {
  if (node.type !== 'function_item' && node.type !== 'function_signature_item') return []
  let impl: Node | null = null
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === 'impl_item') {
      impl = parent
      break
    }
    if (parent.type === 'trait_item' || CALLABLE_NODES.rust.has(parent.type)) return []
  }
  if (!impl) return []
  const type = impl.childForFieldName('type')
  const targetName = type ? findDescendant(type, 'type_identifier')?.text.trim() : undefined
  const traitName = impl.childForFieldName('trait')?.text.trim()
  // Keep the impl as its own scope segment: distinct trait impls for one type
  // are separate scopes. Carry `Trait for Type` so `impl A for Config` and
  // `impl B for Config` do not collide; a bare type name covers inherent impls.
  const name = targetName && traitName ? `${traitName} for ${targetName}` : (targetName ?? traitName)
  return name ? [{ kind: 'impl', name }] : []
}

function cppQualifiedOwners(node: Node): OwnerDesc[] {
  const declarator = cppDeclaratorQid(node)
  if (!declarator) return []
  return cppQualifiedSegments(declarator)
    .slice(0, -1)
    .map((name) => ({ kind: 'owner' as ScopeKind, name }))
}

/** Descend the C/C++ declarator chain to an out-of-class `Scope::name` form. */
function cppDeclaratorQid(node: Node): Node | null {
  let current = node.childForFieldName?.('declarator')
  while (current) {
    if (current.type === 'qualified_identifier') return current
    if (!current.type.includes('declarator')) return null
    current = current.childForFieldName?.('declarator') ?? current.namedChildren[0] ?? null
  }
  return null
}

/** Flatten a (right-nested) C++ qualified identifier, outermost name first. */
function cppQualifiedSegments(qualified: Node): string[] {
  const scope = qualified.childForFieldName('scope')
  const name = qualified.childForFieldName('name')
  const head = scope ? [scope.text.trim()] : []
  const tail =
    name?.type === 'qualified_identifier'
      ? cppQualifiedSegments(name)
      : [name?.text.trim() ?? '']
  return [...head, ...tail].filter(Boolean)
}

function findDescendant(node: Node, type: string): Node | null {
  if (node.type === type) return node
  for (const child of node.namedChildren) {
    if (!child) continue
    const nested = findDescendant(child, type)
    if (nested) return nested
  }
  return null
}

function nearestDraftId(node: Node, symbols: Map<number, SymbolInfo>): string | null {
  for (let current: Node | null = node; current; current = current.parent) {
    const symbol = symbols.get(current.id)
    if (symbol) return symbol.id
  }
  return null
}

/** Symbols only — see extractAll for the combined parse. */
export async function extractSymbols(code: string, id: LanguageId): Promise<SymbolInfo[]> {
  return (await extractAll(code, id)).symbols
}

/** The declared name of a declaration node — language-aware dispatch. */
function nameOf(id: LanguageId, node: Node): string {
  if (id === 'cpp' || id === 'c') return cppNameOf(node)
  const field = node.childForFieldName?.('name')
  if (field) return field.text.trim()
  // e.g. an anonymous default export — skip those.
  return ''
}

/**
 * C/C++ declaration names hide in the declarator chain:
 * - function_definition → declarator:function_declarator → identifier |
 *   qualified_identifier (A::b) | field_identifier (in-class method)
 * - class/struct/enum specifiers and alias_declaration carry `name`
 * - type_definition → declarator:type_identifier
 * Returns '' for anonymous declarations (skipped upstream).
 */
function cppNameOf(node: Node): string {
  const nameField = node.childForFieldName?.('name')
  if (nameField) return nameField.text.trim()
  if (node.type === 'type_definition') {
    return node.childForFieldName?.('declarator')?.text.trim() ?? ''
  }
  let declarator = node.childForFieldName?.('declarator')
  if (declarator?.type === 'init_declarator') {
    declarator = declarator.childForFieldName?.('declarator')
  }
  if (declarator) {
    let current: Node | null = declarator
    while (current) {
      if (
        current.type === 'function_declarator' ||
        current.type === 'pointer_declarator' ||
        current.type === 'array_declarator' ||
        current.type === 'reference_declarator' ||
        current.type === 'parenthesized_declarator' ||
        current.type === 'init_declarator'
      ) {
        current = current.childForFieldName?.('declarator') ?? current.namedChildren[0] ?? null
        continue
      }
      if (current.type === 'qualified_identifier') {
        // app::inner::Widget::draw — the bare name is the deepest segment.
        return cppQualifiedSegments(current).at(-1) ?? ''
      }
      if (
        current.type === 'identifier' ||
        current.type === 'field_identifier' ||
        current.type === 'type_identifier'
      ) {
        return current.text.trim()
      }
      break
    }
  }
  return ''
}

/**
 * The nearest enclosing function/method node of a call site; module level
 * returns null. Anonymous function forms (arrow / function expression) are
 * owned by the variable they are assigned to (see {@link callableNameOf} and
 * {@link nearestDraftId}).
 */
function enclosingCallableNode(id: LanguageId, node: Node): Node | null {
  const callable = CALLABLE_NODES[id]
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (callable.has(parent.type)) return parent
  }
  return null
}

/** Name of the function/method owning a callable node; '' when anonymous. */
function callableNameOf(id: LanguageId, callable: Node): string {
  const named = nameOf(id, callable)
  if (named) return named
  const declaration = callable.parent
  if (declaration?.type === 'variable_declarator') {
    return declaration.childForFieldName?.('name')?.text.trim() ?? ''
  }
  return ''
}

/** Receiver/namespace text of a qualified call (`ns.foo()` -> "ns"), else null. */
function qualifierOf(node: Node): string | null {
  const parent = node.parent
  if (!parent) return null
  let receiver: Node | null | undefined
  switch (parent.type) {
    case 'member_expression':
    case 'method_invocation':
    case 'attribute':
      receiver = parent.childForFieldName('object')
      break
    case 'selector_expression':
      receiver = parent.childForFieldName('operand')
      break
    case 'field_expression':
      receiver = parent.childForFieldName('value') ?? parent.childForFieldName('argument')
      break
    case 'qualified_identifier':
    case 'scoped_identifier':
      receiver = parent.childForFieldName('scope') ?? parent.childForFieldName('path')
      break
    default:
      return null
  }
  const text = receiver?.text.replace(/\s+/g, ' ').trim()
  return text ? text : null
}

/** Structured import sites for a captured import/include/use statement. */
function importInfoFor(id: LanguageId, node: Node): ImportInfo[] {
  const line = node.startPosition.row + 1
  switch (node.type) {
    case 'import_statement':
      return id === 'python' ? pythonModuleImports(node, line) : tsJsImports(node, line)
    case 'export_statement':
      return tsJsReexport(node, line)
    case 'import_from_statement':
      return pythonFromImport(node, line)
    case 'import_spec':
      return goImport(node, line)
    case 'use_declaration':
      return rustUse(node, line)
    case 'import_declaration':
      return javaImport(node, line)
    case 'preproc_include': {
      const specifier = stripQuotes(node.childForFieldName('path')?.text)
      return specifier ? [{ specifier, line, kind: 'include', bindings: [] }] : []
    }
    default:
      return []
  }
}

function tsJsImports(node: Node, line: number): ImportInfo[] {
  const specifier = stripQuotes(node.childForFieldName('source')?.text)
  if (!specifier) return []
  return [{ specifier, line, kind: 'import', bindings: importClauseBindings(node) }]
}

function importClauseBindings(node: Node): ImportBinding[] {
  const bindings: ImportBinding[] = []
  const clause = node.namedChildren.find((child) => child?.type === 'import_clause')
  if (!clause) return bindings
  for (const child of clause.namedChildren) {
    if (!child) continue
    if (child.type === 'identifier') {
      bindings.push({ imported: 'default', local: child.text.trim(), kind: 'default' })
    } else if (child.type === 'namespace_import') {
      const local = child.namedChildren.find((c) => c?.type === 'identifier')?.text.trim()
      if (local) bindings.push({ imported: '*', local, kind: 'namespace' })
    } else if (child.type === 'named_imports') {
      for (const spec of child.namedChildren) {
        if (spec?.type !== 'import_specifier') continue
        const imported = spec.childForFieldName('name')?.text.trim()
        if (!imported) continue
        const alias = spec.childForFieldName('alias')?.text.trim()
        bindings.push({ imported, local: alias ?? imported, kind: 'named' })
      }
    }
  }
  return bindings
}

function tsJsReexport(node: Node, line: number): ImportInfo[] {
  const specifier = stripQuotes(node.childForFieldName('source')?.text)
  if (!specifier) return []
  const bindings: ImportBinding[] = []
  const clause = node.namedChildren.find((child) => child?.type === 'export_clause')
  for (const spec of clause?.namedChildren ?? []) {
    if (spec?.type !== 'export_specifier') continue
    const imported = spec.childForFieldName('name')?.text.trim()
    if (!imported) continue
    const alias = spec.childForFieldName('alias')?.text.trim()
    bindings.push({ imported, local: alias ?? imported, kind: 'named' })
  }
  const namespaceExport = node.namedChildren.find((child) => child?.type === 'namespace_export')
  const local = namespaceExport?.namedChildren.find((c) => c?.type === 'identifier')?.text.trim()
  if (local) bindings.push({ imported: '*', local, kind: 'namespace' })
  return [{ specifier, line, kind: 'reexport', bindings }]
}

function pythonModuleImports(node: Node, line: number): ImportInfo[] {
  const out: ImportInfo[] = []
  for (const nameNode of node.childrenForFieldName('name')) {
    if (!nameNode) continue
    if (nameNode.type === 'aliased_import') {
      const moduleName = nameNode.childForFieldName('name')?.text.trim()
      const specifier = dottedToPath(moduleName)
      if (!specifier) continue
      const alias = nameNode.childForFieldName('alias')?.text.trim()
      out.push({
        specifier,
        line,
        kind: 'import',
        bindings: [
          { imported: moduleName ?? null, local: alias ?? moduleName ?? '', kind: 'namespace' },
        ],
      })
    } else if (nameNode.type === 'dotted_name') {
      const moduleName = nameNode.text.trim()
      const specifier = dottedToPath(moduleName)
      if (!specifier) continue
      out.push({
        specifier,
        line,
        kind: 'import',
        bindings: [{ imported: null, local: moduleName.split('.')[0] ?? moduleName, kind: 'package' }],
      })
    }
  }
  return out
}

function pythonFromImport(node: Node, line: number): ImportInfo[] {
  const raw = node.childForFieldName('module_name')?.text
  if (raw == null) return []
  const specifier = raw.startsWith('.') ? pythonRelative(raw) : dottedToPath(raw)
  if (!specifier) return []
  const moduleNode = node.childForFieldName('module_name')
  const bindings: ImportBinding[] = []
  for (const nameNode of node.namedChildren) {
    if (!nameNode || nameNode.id === moduleNode?.id) continue
    if (nameNode.type === 'aliased_import') {
      const imported = nameNode.childForFieldName('name')?.text.trim()
      if (!imported) continue
      const alias = nameNode.childForFieldName('alias')?.text.trim()
      bindings.push({ imported, local: alias ?? lastDotSegment(imported), kind: 'named' })
    } else if (nameNode.type === 'dotted_name') {
      const imported = nameNode.text.trim()
      bindings.push({ imported, local: lastDotSegment(imported), kind: 'named' })
    } else if (nameNode.type === 'wildcard_import') {
      bindings.push({ imported: '*', local: '*', kind: 'glob' })
    }
  }
  return [{ specifier, line, kind: 'import', bindings }]
}

function goImport(node: Node, line: number): ImportInfo[] {
  const specifier = stripQuotes(node.childForFieldName('path')?.text)
  if (!specifier) return []
  const nameNode = node.childForFieldName('name')
  let binding: ImportBinding
  if (!nameNode) {
    binding = { imported: null, local: lastSlashSegment(specifier), kind: 'package' }
  } else if (nameNode.type === 'dot') {
    binding = { imported: '*', local: '.', kind: 'glob' }
  } else {
    binding = { imported: null, local: nameNode.text.trim(), kind: 'package' }
  }
  return [{ specifier, line, kind: 'import', bindings: [binding] }]
}

function rustUse(node: Node, line: number): ImportInfo[] {
  const argument = node.childForFieldName('argument')
  if (!argument) return []
  const base = argument.type === 'use_as_clause' ? argument.childForFieldName('path') : argument
  const specifier = rustUsePath(base?.text ?? argument.text)
  if (!specifier) return []
  return [{ specifier, line, kind: 'use', bindings: rustBindings(argument) }]
}

function rustBindings(node: Node): ImportBinding[] {
  switch (node.type) {
    case 'scoped_identifier': {
      const imported = node.childForFieldName('name')?.text.trim()
      return imported ? [{ imported, local: imported, kind: 'named' }] : []
    }
    case 'identifier': {
      const name = node.text.trim()
      return name ? [{ imported: name, local: name, kind: 'named' }] : []
    }
    case 'use_as_clause': {
      const path = node.childForFieldName('path')
      const alias = node.childForFieldName('alias')?.text.trim()
      const imported = path ? rustLeafName(path) : null
      return imported && alias ? [{ imported, local: alias, kind: 'named' }] : []
    }
    case 'scoped_use_list': {
      const bindings: ImportBinding[] = []
      for (const item of node.childForFieldName('list')?.namedChildren ?? []) {
        if (item) bindings.push(...rustBindings(item))
      }
      return bindings
    }
    case 'use_wildcard':
      return [{ imported: '*', local: '*', kind: 'glob' }]
    default:
      return []
  }
}

function rustLeafName(node: Node): string | null {
  if (node.type === 'identifier') return node.text.trim()
  return node.childForFieldName('name')?.text.trim() ?? null
}

function javaImport(node: Node, line: number): ImportInfo[] {
  const path = node.namedChildren.find((child) => child?.type === 'scoped_identifier')
  const specifier = dottedToPath(path?.text)
  if (!specifier) return []
  const wildcard = node.namedChildren.some((child) => child?.type === 'asterisk')
  if (wildcard) {
    return [
      { specifier, line, kind: 'import', bindings: [{ imported: '*', local: '*', kind: 'glob' }] },
    ]
  }
  const imported = path?.childForFieldName('name')?.text.trim() ?? lastSlashSegment(specifier)
  const isStatic = /^import\s+static\b/.test(node.text)
  return [
    {
      specifier,
      line,
      kind: 'import',
      bindings: [{ imported, local: imported, kind: isStatic ? 'static' : 'named' }],
    },
  ]
}

function lastDotSegment(value: string): string {
  return value.split('.').pop() ?? value
}

function lastSlashSegment(value: string): string {
  return value.split('/').pop() ?? value
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
function signatureFor(id: LanguageId, node: Node): string {
  const sig = rawSignature(id, node)
  return sig.length > 80 ? `${sig.slice(0, 77)}...` : sig
}

function rawSignature(id: LanguageId, node: Node): string {
  const name = nameOf(id, node)
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
  if (id === 'cpp' || id === 'c') {
    // C/C++: the parameter list hides inside the declarator chain.
    let current = node.childForFieldName?.('declarator')
    while (current) {
      if (current.type === 'function_declarator') {
        const list = current.childForFieldName?.('parameters')
        return list ? `${name}${collapseSpace(list.text)}` : name
      }
      current = current.childForFieldName?.('declarator') ?? current.namedChildren[0] ?? null
      if (current && !current.type.includes('declarator') && current.type !== 'identifier' && current.type !== 'qualified_identifier' && current.type !== 'field_identifier') break
    }
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
function isModuleLevelVariable(id: LanguageId, node: Node): boolean {
  if (id === 'cpp' || id === 'c') {
    // A (field_)declaration is indexable at namespace/file scope or in a
    // class body — anything inside a function body is a local.
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (parent.type === 'function_definition' || parent.type === 'compound_statement') return false
      if (parent.type === 'translation_unit' || parent.type === 'declaration_list' || parent.type === 'field_declaration_list') return true
    }
    return false
  }
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
    const name = nameOf(id, node)
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
  if (id === 'cpp' || id === 'c') {
    return cppIsExported(node)
  }
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === 'export_statement') return true
    if (parent.type === 'statement_block' || parent.type === 'class_body') return false
    if (parent.type === 'program') return false
  }
  return false
}

/**
 * C/C++ export semantics:
 * - anything under `public:` in a class body is exported; `private:`/
 *   `protected:` sections are not
 * - top-level declarations are exported unless marked `static`
 * (internal-linkage). C has no access sections; C++ namespaces stay
 * transparent — a symbol under namespace X is still module-level.
 */
function cppIsExported(node: Node): boolean {
  const isStatic = node.namedChildren.some(
    (c) => c?.type === 'storage_class_specifier' && c.text === 'static',
  )
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === 'field_declaration_list') {
      const body = parent
      // Struct members default to public, class members to private (C++ rule).
      const structKind = body.parent?.type === 'struct_specifier' ? 'struct' : 'class'
      let current: string | null = structKind === 'struct' ? 'public' : 'private'
      for (let up: Node | null = node; up && up.id !== body.id; up = up.parent) {
        const next = up.parent
        if (next?.type === 'field_declaration_list') {
          const siblingIndex = next.namedChildren.findIndex((c) => c?.id === up.id)
          const accessBefore = next.namedChildren
            .slice(0, siblingIndex)
            .filter((c) => c?.type === 'access_specifier')
          if (accessBefore.length > 0) {
            current = accessBefore.at(-1)!.text.replace(':', '').trim()
          }
        }
      }
      return current === 'public' && !isStatic
    }
    if (parent.type === 'translation_unit') return !isStatic
  }
  return !isStatic
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
  if ((id === 'cpp' || id === 'c') && (kind === 'variable' || kind === 'field')) {
    // A declaration whose declarator chain holds a function_declarator is a
    // function prototype/definition — not a data member or global.
    let current = node.childForFieldName?.('declarator')
    while (current) {
      if (current.type === 'function_declarator') {
        return node.parent?.type === 'field_declaration_list' ? 'method' : 'function'
      }
      current = current.childForFieldName?.('declarator') ?? current.namedChildren[0] ?? null
    }
    return node.type === 'field_declaration' ? 'field' : 'variable'
  }
  if ((id === 'cpp' || id === 'c') && node.type === 'function_definition') {
    // A function defined directly in a class/struct body is a method.
    if (node.parent?.type === 'field_declaration_list') return 'method'
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
  const rel = path.relative(repoRoot, filePath).split(path.sep).join('/')
  const { symbols } = await extractAll(text, lang, rel)
  return symbols
}