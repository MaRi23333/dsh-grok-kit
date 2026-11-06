import type { Context } from '@deepseek-ai/cordis'
import { GrokSettingsIcon } from './nav-icon-view.tsx'

// Backport the DSH 0.2.2 contract to the older development-only slot types.
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'settings.section.icon': {
      kind: 'list'
      scope: 'root'
      owner: { size: number; active: boolean }
    }
  }
}

export function registerSettingsNavIcon(ctx: Pick<Context, 'slots'>): void {
  ctx.slots.inject('settings.section.icon', () => ctx.slots.register({
    name: 'settings.section.icon',
    id: 'xai-oauth',
    inject: () => ({}),
  }, GrokSettingsIcon))
}
