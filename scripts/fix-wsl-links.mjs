#!/usr/bin/env node
/**
 * fix-wsl-links — repair pnpm symlinks broken by WSL→Windows installs.
 *
 * Running `pnpm install` from WSL against a checkout on /mnt/c lays down
 * Linux-style symlinks that Windows cannot traverse (EACCES / "cannot find
 * package"). This script walks node_modules, finds every such dead link,
 * and re-points it at its real target inside .pnpm as a Windows junction.
 *
 * Run from Windows-side Node (the dsh-bundled node.exe works):
 *
 *   node.exe scripts\fix-wsl-links.mjs [root]
 *
 * `root` defaults to the repo this script lives in. Pass a dsh profile
 * directory (…\.dsh\profiles\web) to fix a plugin install instead.
 */

import { existsSync, readdirSync, readlinkSync, realpathSync, rmSync, symlinkSync, lstatSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const root = path.resolve(process.argv[2] ?? defaultRoot)
const nm = path.join(root, 'node_modules')
const pnpm = path.join(nm, '.pnpm')

if (!existsSync(nm)) {
  console.error(`no node_modules under ${root} — run pnpm install first`)
  process.exit(1)
}
if (process.platform === 'win32' && !existsSync(pnpm)) {
  console.error(`no .pnpm store under ${nm} — nothing to re-link against`)
  process.exit(1)
}

let fixed = 0
let checked = 0

/** True for a link entry whose target Windows Node cannot resolve. */
function broken(link) {
  try {
    realpathSync(link)
    return false
  } catch {
    return true
  }
}

/** Replace `link` with a junction to `target`; report and count. */
function junction(link, target) {
  rmSync(link, { force: true, recursive: true })
  try {
    symlinkSync(target, link, 'junction')
  } catch {
    try {
      rmSync(link, { force: true, recursive: true })
    } catch {}
    console.error(`  FAIL ${rel(link)} → ${target}`)
    return
  }
  fixed++
  console.log(`  fixed ${rel(link)}`)
}

function rel(p) {
  return path.relative(root, p) || p
}

/** Resolve the canonical store dir for a package: .pnpm/<+name>@<ver>/node_modules</name>. */
function storeDir(pkgName, versionHint) {
  const storeName = pkgName.replace('/', '+')
  if (versionHint) {
    const direct = path.join(pnpm, `${storeName}@${versionHint}`)
    if (existsSync(direct)) return direct
  }
  const prefix = `${storeName}@`
  const hit = readdirSync(pnpm).find(
    (d) => d.startsWith(prefix) && existsSync(path.join(pnpm, d, 'node_modules', pkgName)),
  )
  return hit ? path.join(pnpm, hit) : null
}

/** Fix every dead scoped/unscoped link directly under one node_modules. */
function fixLevel(levelNm, scope = null) {
  for (const entry of readdirSync(levelNm)) {
    const link = path.join(levelNm, entry)
    let st
    try {
      st = lstatSync(link)
    } catch {
      continue
    }
    if (!st.isSymbolicLink()) {
      if (st.isDirectory() && entry.startsWith('@')) fixLevel(link, entry)
      continue
    }
    checked++
    if (!broken(link)) continue

    const target = readlinkSync(link)
    const pkgName = scope ? `${scope}/${entry}` : entry
    const storeName = pkgName.replace('/', '+')

    // pnpm layout: <link> → .pnpm/<pkg>@<ver[_peer]>…/node_modules/<pkg>.
    // Re-derive that dir; the old target string is Linux-shaped and useless.
    const base = target.split('node_modules/')[0]?.split('/').pop() ?? ''
    const versionHint = base.startsWith(`${storeName}@`) ? base : null
    const store = storeDir(pkgName, versionHint)
    let resolved = store ? path.join(store, 'node_modules', pkgName) : null

    // Scoped aliases link a nested path (e.g. @standard-schema/spec lives in
    // the @standard-schema+spec store); fall back to matching by the target's
    // node_modules tail — or, when the target names no node_modules at all
    // (dangling junk), by the package name itself.
    if (!resolved) {
      const tail = target.includes('node_modules/')
        ? target.split('node_modules/').pop()
        : pkgName
      for (const dir of readdirSync(pnpm)) {
        const candidate = path.join(pnpm, dir, 'node_modules', tail)
        if (existsSync(candidate)) {
          resolved = candidate
          break
        }
      }
    }

    if (resolved && existsSync(resolved)) {
      junction(link, resolved)
      continue
    }

    // Non-store link (workspace `link:` deps, profile installs): re-point at
    // the original Windows path when that still exists.
    const asWin = target.replaceAll('/', '\\')
    if (existsSync(asWin)) {
      junction(link, asWin)
      continue
    }
    console.error(`  no target for ${rel(link)} (${target}) — remove or reinstall`)
  }
}

if (existsSync(pnpm)) {
  for (const dir of readdirSync(pnpm)) {
    const levelNm = path.join(pnpm, dir, 'node_modules')
    if (existsSync(levelNm)) fixLevel(levelNm)
  }
}
fixLevel(nm)

console.log(`\n${root}`)
console.log(`links checked: ${checked}, fixed: ${fixed}`)
process.exit(fixed > 0 ? 0 : 0)
