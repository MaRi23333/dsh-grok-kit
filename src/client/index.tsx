//

// Derived from dsh-xai (https://github.com/MirDie/dsh-xai), Apache-2.0.

// Modified for dsh-grok-kit — see NOTICE for the full attribution.

//

/** Browser half: xAI Grok account management inside dsh Settings. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { XaiSettings } from './XaiSettings.tsx'
import type { XaiOAuthSettingsInjected } from './XaiSettings.tsx'
import { en, zh } from './locales.ts'
import type { XaiOAuthSettingsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.xai-oauth': XaiOAuthSettingsKey
  }
}

export const name = 'dsh-grok-kit-client'
export const inject = ['slots', 'locale']

export function apply(ctx: ClientContext): void {
  const namespace = 'settings.xai-oauth'
  ctx.effect(() => {
    try {
      return ctx.locale.register(namespace, { zh, en })
    } catch (error) {
      // Another bundle (e.g. an old dsh-xai) already registered this namespace;
      // reuse its copy rather than failing the client boot.
      console.warn('dsh-grok-kit: settings locale namespace already registered; reusing the existing copy.', error)
      return () => undefined
    }
  }, 'dsh-grok-kit: settings copy')
  const t = ctx.locale.bind(namespace) as XaiOAuthSettingsInjected['t']
  ctx.slots.inject('settings.section', () => {
    const existing = ctx.slots.entries('settings.section').some(entry => (entry as { id?: string }).id === 'xai-oauth')
    if (existing) {
      console.warn('dsh-grok-kit: settings section slot already registered; keeping the existing entry.')
      return () => undefined
    }
    return ctx.slots.register({
      name: 'settings.section',
      id: 'xai-oauth',
      order: 16,
      label: () => t('nav'),
      inject: (): XaiOAuthSettingsInjected => ({ t }),
    }, XaiSettings)
  })
}
