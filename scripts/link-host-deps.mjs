#!/usr/bin/env node
/**
 * Re-point the plugin's @deepseek-ai / @earendil-works runtime dependencies at
 * the host's flat module fallback ($DSH_HOME/profiles/node_modules), which the
 * dsh app maintains as one junction per package in its own resolvable closure.
 *
 * WHY: out-of-tree plugins are `pnpm link:`-installed, so Node resolves the
 * plugin's bare imports from the plugin's real directory — a `npm install`
 * inside the plugin would therefore shadow the host's dsh-* packages with the
 * (older) devDependency versions and produce a mixed version graph (the
 * `registration.adapter.prepareCall is not a function` failure). Linking the
 * runtime packages to the host keeps the plugin on the host's exact versions
 * while local typechecking still reads the host packages' shipped d.ts files.
 *
 * Run after `npm install` (or `npm ci`): `node scripts/link-host-deps.mjs`.
 * Everything else in node_modules stays a real install.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const home = process.env.DSH_HOME || join(process.env.USERPROFILE ?? process.env.HOME ?? '.', '.dsh')
const hostModules = join(home, 'profiles', 'node_modules')

const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const scopes = ['@deepseek-ai', '@earendil-works']
const names = new Set([
  ...Object.keys(manifest.peerDependencies ?? {}),
  ...Object.keys(manifest.devDependencies ?? {}),
].filter(name => scopes.some(scope => name === scope || name.startsWith(`${scope}/`))))

const missing = []
for (const name of names) {
  const [scope, base] = name.split('/')
  const own = join(root, 'node_modules', scope, base)
  const host = join(hostModules, scope, base)
  if (!existsSync(host)) {
    missing.push(name)
    continue
  }
  rmSync(own, { recursive: true, force: true })
  mkdirSync(dirname(own), { recursive: true })
  symlinkSync(host, own, 'junction')
}

if (missing.length > 0) {
  console.warn(`link-host-deps: host fallback lacks ${missing.join(', ')} — those stay on devDependency versions.`)
}
console.log(`link-host-deps: linked ${names.size - missing.length} runtime packages to ${hostModules}`)
