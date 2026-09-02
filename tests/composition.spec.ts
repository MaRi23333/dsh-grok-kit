import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('bundle composition', () => {
  it('inserts the xai-oauth host plugin and a Grok default model, and never touches the web seam', async () => {
    const patch = await readFile(join(root, 'cordis.patch.yml'), 'utf8')
    expect(patch).toContain('provider: xai-oauth')
    expect(patch).toContain('model: grok-4.6')
    expect(patch).toContain('id: dsh-grok-kit')
    expect(patch).toContain('name: dsh-grok-kit')
    expect(patch).toContain('backendSearch: false')
    // The cordis insert id must differ from the route id so a profile with the
    // old dsh-xai bundle still installed cannot fail to load on duplicate ids.
    expect(patch).not.toContain('id: llm-xai-oauth')
    // The native web_search provider selection must stay untouched.
    expect(patch).not.toContain('searchProvider')
  })

  it('declares a dsh bundle and web client half without dsh-web dependency', async () => {
    const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as {
      name: string
      dsh: { bundle: { patch: string }; client: { platform: string } }
      peerDependencies: Record<string, string>
      dependencies?: Record<string, string>
    }
    expect(manifest.name).toBe('dsh-grok-kit')
    expect(manifest.dsh.bundle.patch).toBe('./cordis.patch.yml')
    expect(manifest.dsh.client.platform).toBe('web')
    expect(manifest.peerDependencies['@deepseek-ai/dsh-tools']).toBeTruthy()
    expect(manifest.peerDependencies['@deepseek-ai/dsh-web']).toBeUndefined()
    expect(manifest.peerDependencies['@earendil-works/pi-ai']).toBeTruthy()
    expect(manifest.dependencies?.['undici']).toBeTruthy()
  })
})
