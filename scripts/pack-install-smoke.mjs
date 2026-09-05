#!/usr/bin/env node
/**
 * Isolated DSH 0.1.2-rc.1 pack-install smoke: npm pack, `dsh plugin add` into
 * the `web` profile, booted `--help`, and the plugin entry.
 * Isolates DSH_HOME / HOME / USERPROFILE and package-manager config/cache.
 * Does not read real user credentials.
 *
 * Requires `dsh` 0.1.2-rc.1 on PATH (CI installs it). Optional DSH_BIN.
 */
import { execFileSync } from 'node:child_process'
import { accessSync, constants, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path'
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

function resolveOnPath(name) {
  const pathEntries = (process.env.PATH ?? '').split(delimiter)
  const extensions = process.platform === 'win32'
    ? (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
    : ['']
  const names = extensions.some(extension => name.toLowerCase().endsWith(extension.toLowerCase()))
    ? [name]
    : extensions.map(extension => `${name}${extension}`)
  const candidates = isAbsolute(name)
    ? names
    : pathEntries.map(directory => directory || '.').flatMap(directory => names.map(candidate => join(directory, candidate)))
  return candidates.find(candidate => {
    try {
      accessSync(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK)
      return true
    } catch {
      return false
    }
  })
}

function resolveDshInstall() {
  const binName = process.env.DSH_BIN ?? (process.platform === 'win32' ? 'dsh' : 'dsh')
  const located = resolveOnPath(binName)
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

  const help = run(host.bin, ['--profile', PROFILE, '--help'], {
    env,
    cwd: work,
    timeout: 30_000,
  })
  if (!help.includes('Usage: dsh --profile web') && !help.includes('Serve the DeepSeek Harness browser UI.')) {
    throw new Error(`booted web profile help did not contain a stable web marker\n${help.slice(0, 2000)}`)
  }

  const pluginDir = join(dshHome, 'profiles', PROFILE, 'node_modules', 'dsh-grok-kit')
  const manifest = JSON.parse(readFileSync(join(pluginDir, 'package.json'), 'utf8'))
  if (manifest.version !== '0.1.9') {
    throw new Error(`installed plugin version is ${manifest.version}, expected 0.1.9`)
  }
  if (!existsSync(join(pluginDir, 'lib', 'index.js'))) {
    throw new Error('installed plugin is missing lib/index.js')
  }
  console.log(`pack-install-smoke: OK — DSH ${EXPECTED_DSH} / pi-ai ${EXPECTED_PI_AI} / booted web profile loaded dsh-grok-kit@0.1.9`)
} finally {
  if (tarball !== undefined) rmSync(tarball, { force: true })
  rmSync(work, { recursive: true, force: true })
}
