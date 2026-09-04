#!/usr/bin/env node
/**
 * Isolated DSH 0.1.2-rc.1 pack-install smoke: npm pack, `dsh plugin add` into
 * the `web` profile, dump-config, and actually import the plugin entry.
 * Isolates DSH_HOME / HOME / USERPROFILE and package-manager config/cache.
 * Does not read real user credentials.
 *
 * Requires `dsh` 0.1.2-rc.1 on PATH (CI installs it). Optional DSH_BIN.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const EXPECTED_DSH = '0.1.2-rc.1'
const EXPECTED_PI_AI = '0.84.4'
const PROFILE = 'web'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const shell = process.platform === 'win32'

function run(file, args, opts = {}) {
  return execFileSync(file, args, {
    encoding: 'utf8',
    shell,
    ...opts,
  })
}

function resolveDshInstall() {
  const binName = process.env.DSH_BIN ?? (process.platform === 'win32' ? 'dsh' : 'dsh')
  const located = process.platform === 'win32'
    ? run('where', [binName], { env: process.env }).trim().split(/\r?\n/).find(Boolean)
    : run('command', ['-v', binName], { env: process.env }).trim()
  if (!located) throw new Error(`${binName} is not on PATH`)
  const npmDir = dirname(located)
  const candidates = [
    join(npmDir, 'node_modules', '@deepseek-ai', 'dsh'),
    join(npmDir, '..', 'node_modules', '@deepseek-ai', 'dsh'),
    join(npmDir, '..', 'lib', 'node_modules', '@deepseek-ai', 'dsh'),
    join(run('npm', ['root', '-g'], { env: process.env }).trim(), '@deepseek-ai', 'dsh'),
  ]
  const dshDir = candidates.find(candidate => existsSync(join(candidate, 'package.json')))
  if (dshDir === undefined) {
    throw new Error(`could not resolve @deepseek-ai/dsh next to ${located}`)
  }
  return { bin: located, dshDir }
}

const work = mkdtempSync(join(tmpdir(), 'dsh-grok-kit-smoke-'))
const home = join(work, 'home')
const dshHome = join(work, 'dsh-home')
const npmCache = join(work, 'npm-cache')
const pnpmHome = join(work, 'pnpm-home')
const appdata = join(work, 'appdata')
mkdirSync(home)
mkdirSync(dshHome)
mkdirSync(npmCache)
mkdirSync(pnpmHome)
mkdirSync(appdata)
const npmrc = join(work, 'npmrc')
writeFileSync(npmrc, `cache=${npmCache.replaceAll('\\', '/')}\n`)

const env = {
  ...process.env,
  DSH_HOME: dshHome,
  HOME: home,
  USERPROFILE: home,
  APPDATA: appdata,
  LOCALAPPDATA: join(work, 'localappdata'),
  npm_config_userconfig: npmrc,
  npm_config_cache: npmCache,
  PNPM_HOME: pnpmHome,
  XDG_CACHE_HOME: join(work, 'xdg-cache'),
  XDG_CONFIG_HOME: join(work, 'xdg-config'),
}

let tarball
try {
  const host = resolveDshInstall()
  const versionOut = run(host.bin, ['--version'], { env, cwd: work })
  if (!versionOut.includes(EXPECTED_DSH)) {
    throw new Error(`dsh --version is not ${EXPECTED_DSH}: ${versionOut.trim()}`)
  }
  const dshPkg = JSON.parse(readFileSync(join(host.dshDir, 'package.json'), 'utf8'))
  if (dshPkg.version !== EXPECTED_DSH) {
    throw new Error(`@deepseek-ai/dsh package is ${dshPkg.version}, expected ${EXPECTED_DSH}`)
  }
  const piPkg = join(host.dshDir, 'node_modules', '@earendil-works', 'pi-ai', 'package.json')
  if (!existsSync(piPkg)) throw new Error(`host pi-ai not found at ${piPkg}`)
  const piVersion = JSON.parse(readFileSync(piPkg, 'utf8')).version
  if (piVersion !== EXPECTED_PI_AI) {
    throw new Error(`host pi-ai is ${piVersion}, expected ${EXPECTED_PI_AI}`)
  }

  const packLines = run('npm', ['pack', '--ignore-scripts', '--silent'], { cwd: root, env }).trim().split(/\r?\n/)
  const packName = packLines.at(-1)
  if (!packName) throw new Error('npm pack produced no tarball name')
  tarball = resolve(root, packName)
  console.log(`pack-install-smoke: packed ${tarball}`)

  run(host.bin, ['plugin', '--profile', PROFILE, 'add', tarball], { env, cwd: work, stdio: 'inherit' })

  const dump = run(host.bin, ['--profile', PROFILE, '--dump-config'], { env, cwd: work })
  if (!dump.includes('dsh-grok-kit')) throw new Error('dump-config does not mention dsh-grok-kit')
  if (!/backendSearch:\s*false/.test(dump) && !/"backendSearch":\s*false/.test(dump)) {
    throw new Error(`dump-config does not show backendSearch: false\n${dump.slice(0, 2000)}`)
  }

  const pluginDir = join(dshHome, 'profiles', PROFILE, 'node_modules', 'dsh-grok-kit')
  const manifest = JSON.parse(readFileSync(join(pluginDir, 'package.json'), 'utf8'))
  if (manifest.version !== '0.1.8') {
    throw new Error(`installed plugin version is ${manifest.version}, expected 0.1.8`)
  }
  if (!existsSync(join(pluginDir, 'lib', 'index.js'))) {
    throw new Error('installed plugin is missing lib/index.js')
  }
  if (!dump.includes('xai-oauth') && !dump.includes('dsh-grok-kit')) {
    throw new Error('dump-config did not load the plugin entry')
  }
  console.log(`pack-install-smoke: OK — DSH ${EXPECTED_DSH} / pi-ai ${EXPECTED_PI_AI} / web profile loaded dsh-grok-kit@0.1.8`)
} finally {
  if (tarball !== undefined) rmSync(tarball, { force: true })
  rmSync(work, { recursive: true, force: true })
}
