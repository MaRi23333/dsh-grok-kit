/** Scoped settings styling; host tokens keep both desktop themes in sync. */
const styles = `
.grok-settings {
  --gk-text: var(--dsw-alias-label-primary, #171717);
  --gk-muted: var(--dsw-alias-label-secondary, #62666b);
  --gk-soft: var(--dsw-alias-bg-layer-1, #f3f3f3);
  --gk-line: var(--dsw-alias-border-l2, #dedede);
  --gk-surface: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-base, #fff));
  --gk-strong: var(--dsw-alias-label-primary, #171717);
  --gk-on-strong: var(--dsw-alias-bg-layer-2, #fff);
  --gk-success: color-mix(in srgb, var(--dsw-alias-state-success-primary, #16834b) 80%, var(--gk-text));
  --gk-danger: var(--dsw-alias-state-error-primary, #c53532);
  container: grok-settings / inline-size;
  color: var(--gk-text); font-size: 14px; line-height: 1.6;
  width: 100%; max-width: 720px; min-width: 0;
  display: flex; flex-direction: column; gap: 24px;
  overflow-wrap: anywhere;
}
.grok-settings *, .grok-settings *::before, .grok-settings *::after { box-sizing: border-box; }
.grok-settings :where(h2,h3,h4,p) { margin: 0; }
.grok-settings button, .grok-settings input, .grok-settings select { font: inherit; }
.grok-settings :where(input,select,summary,button) { scroll-margin-block: 130px; }
.grok-settings :where(button,input,select,summary,a):focus-visible { outline: 2px solid var(--gk-text); outline-offset: 4px; }
.grok-settings .gk-feature :where(button,input,select,summary,a):focus-visible { outline-color: #f7f7f8; }
.grok-settings button:disabled, .grok-settings input:disabled, .grok-settings select:disabled { opacity: .46; cursor: not-allowed; }
.grok-settings a { color: inherit; text-underline-offset: 4px; }
.grok-settings .gk-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
.grok-settings .gk-header { display: flex; flex-direction: column; gap: 16px; padding: 18px 0 14px; border-bottom: 1px solid var(--gk-line); }
.grok-settings .gk-brand-row { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px 20px; }
.grok-settings .gk-wordmark { display: inline-flex; align-items: center; gap: 12px; font: 750 30px/1 Arial, sans-serif; letter-spacing: -1.6px; }
.grok-settings .gk-wordmark small { border-left: 1px solid currentColor; padding: 3px 0 3px 12px; font: 500 11px/1.2 ui-monospace, Consolas, monospace; letter-spacing: 2px; }
.grok-settings .gk-status { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 7px; font-size: 12px; }
.grok-settings .gk-status--success { color: var(--gk-success); }
.grok-settings .gk-nav { display: flex; flex-wrap: wrap; gap: 4px; }
.grok-settings .gk-nav button { position: relative; border: 0; background: transparent; color: var(--gk-muted); border-radius: 999px; padding: 7px 13px; cursor: pointer; font-size: 13px; min-height: 34px; }
.grok-settings .gk-nav button:hover { background: var(--gk-soft); color: var(--gk-text); }
.grok-settings .gk-nav button[aria-current=page] { background: var(--gk-strong); color: var(--gk-on-strong); font-weight: 600; }
.grok-settings .gk-nav-dirty { position: absolute; top: 6px; right: 7px; width: 4px; height: 4px; border-radius: 50%; background: currentColor; }
.grok-settings .gk-page { display: flex; flex-direction: column; gap: 22px; min-width: 0; }
.grok-settings .gk-eyebrow { font: 500 10px/1.5 ui-monospace, Consolas, monospace; letter-spacing: 1.7px; color: var(--gk-muted); }
.grok-settings .gk-hint { font-size: 12px; line-height: 1.65; color: var(--gk-muted); }
.grok-settings .gk-title { font-size: 15px; font-weight: 600; line-height: 1.5; }
.grok-settings .gk-panel { padding: 20px; border: 1px solid var(--gk-line); border-radius: 14px; background: var(--gk-surface); min-width: 0; }
.grok-settings .gk-stack { display: flex; flex-direction: column; gap: 14px; }
.grok-settings .gk-feature { padding: 22px; border-radius: 14px; background: #111214; color: #f7f7f8; }
.grok-settings .gk-feature .gk-hint { color: inherit; opacity: .75; }
.grok-settings .gk-feature .gk-tag { border-color: currentColor; opacity: .7; }
.grok-settings .gk-feature .gk-setting + .gk-setting { border-color: color-mix(in srgb,currentColor 20%,transparent); }
.grok-settings .gk-setting { display: flex; flex-direction: column; gap: 7px; }
.grok-settings .gk-setting + .gk-setting { margin-top: 18px; padding-top: 18px; border-top: 1px solid var(--gk-line); }
.grok-settings .gk-setting-label { display: flex; align-items: center; justify-content: space-between; gap: 18px; cursor: pointer; }
.grok-settings .gk-setting-label > span { min-width: 0; display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; }
.grok-settings .gk-setting-label b { font-size: 15px; font-weight: 600; }
.grok-settings .gk-tag { display: inline-block; padding: 0 6px; border: 1px solid var(--gk-line); border-radius: 4px; font-size: 10px; line-height: 18px; font-weight: 400; }
.grok-settings input.gk-switch { appearance: none; -webkit-appearance: none; flex: 0 0 36px; width: 36px; height: 22px; border: 1px solid var(--gk-line); border-radius: 20px; margin: 0; background: var(--gk-soft); color: var(--gk-text); cursor: pointer; position: relative; }
.grok-settings input.gk-switch::before { content: ''; width: 14px; height: 14px; border-radius: 50%; position: absolute; top: 3px; left: 3px; background: var(--gk-muted); }
.grok-settings input.gk-switch:checked { background: var(--gk-strong); border-color: var(--gk-strong); }
.grok-settings input.gk-switch:checked::before { background: var(--gk-on-strong); transform: translateX(14px); }
.grok-settings .gk-feature input.gk-switch { background: transparent; border-color: color-mix(in srgb,currentColor 50%,transparent); color: inherit; }
.grok-settings .gk-feature input.gk-switch::before { background: currentColor; opacity: .65; }
.grok-settings .gk-feature input.gk-switch:checked { background: #f7f7f8; border-color: #f7f7f8; }
.grok-settings .gk-feature input.gk-switch:checked::before { background: #111214; opacity: 1; }
.grok-settings .gk-button { display: inline-flex; justify-content: center; align-items: center; gap: 6px; border: 1px solid var(--gk-line); border-radius: 999px; background: transparent; color: var(--gk-text); padding: 7px 15px; min-height: 36px; font-size: 12px; line-height: 1.5; cursor: pointer; text-align: center; }
.grok-settings .gk-button:hover:not(:disabled) { background: var(--gk-soft); }
.grok-settings .gk-button--primary { background: var(--gk-strong); color: var(--gk-on-strong); border-color: var(--gk-strong); }
.grok-settings .gk-button--primary:hover:not(:disabled) { background: var(--gk-strong); opacity: .85; }
.grok-settings .gk-button--danger { background: #b4232d; color: #fff; border-color: #b4232d; }
.grok-settings .gk-button--danger:hover:not(:disabled) { background: #b4232d; opacity: .85; }
.grok-settings .gk-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.grok-settings .gk-input { min-width: 0; width: 100%; border: 1px solid var(--gk-line); border-radius: 8px; background: var(--gk-soft); color: var(--gk-text); padding: 9px 11px; min-height: 38px; font-size: 13px; }
.grok-settings .gk-select { width: auto; max-width: 100%; }
.grok-settings .gk-field { display: flex; flex-direction: column; gap: 7px; font-size: 12px; color: var(--gk-muted); min-width: 0; }
.grok-settings .gk-telemetry { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); padding: 16px 0; border-top: 1px solid var(--gk-line); border-bottom: 1px solid var(--gk-line); }
.grok-settings .gk-telemetry > div { padding: 0 14px; border-left: 1px solid var(--gk-line); min-width: 0; }
.grok-settings .gk-telemetry > div:first-child { padding-left: 0; border: 0; }
.grok-settings .gk-telemetry > div:last-child { padding-right: 0; }
.grok-settings .gk-numeric { font-family: Bahnschrift, 'Arial Narrow', ui-monospace, Consolas, sans-serif; font-variant-numeric: tabular-nums; font-weight: 500; letter-spacing: -1px; }
.grok-settings .gk-reading { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px; line-height: 1.2; }
.grok-settings .gk-reading .gk-numeric { font-size: 34px; }
.grok-settings .gk-reading small { font-size: 11px; color: var(--gk-muted); }
.grok-settings .gk-telemetry-label { font-size: 10px; color: var(--gk-muted); margin-top: 6px; }
.grok-settings .gk-details { border-top: 1px solid var(--gk-line); padding-top: 12px; }
.grok-settings .gk-telemetry + .gk-details { border-top: 0; padding-top: 0; }
.grok-settings .gk-details summary { cursor: pointer; font-size: 12px; color: var(--gk-muted); width: fit-content; }
.grok-settings .gk-details[open] > summary { margin-bottom: 16px; }
.grok-settings .gk-fields { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 12px; }
.grok-settings .gk-footer { position: sticky; bottom: -24px; z-index: 2; margin: 0 0 -24px; padding: 14px 0 24px; background: var(--gk-surface); border-top: 1px solid var(--gk-line); display: flex; flex-direction: column; gap: 10px; }
.grok-settings .gk-stages { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px; font-size: 10px; color: var(--gk-muted); }
.grok-settings .gk-stages span { display: inline-flex; align-items: center; gap: 5px; }
.grok-settings .gk-stage-dot { width: 5px; height: 5px; border-radius: 50%; border: 1px solid currentColor; }
.grok-settings .gk-stage-current { color: var(--gk-text); font-weight: 600; }
.grok-settings .gk-stage-current .gk-stage-dot { background: currentColor; }
.grok-settings .gk-feedback { font-size: 12px; line-height: 1.5; }
.grok-settings .gk-error { color: var(--gk-danger); }
.grok-settings .gk-success { color: var(--gk-success); }
.grok-settings .gk-confirm { display: flex; flex-direction: column; gap: 12px; border: 1px solid var(--gk-danger); border-radius: 12px; padding: 18px; background: color-mix(in srgb,var(--gk-danger) 5%,var(--gk-surface)); }
.grok-settings .gk-empty { padding: 24px 0; font-size: 13px; color: var(--gk-muted); }
.grok-settings .gk-models { list-style: none; padding: 0; margin: 0; }
.grok-settings .gk-models li + li { border-top: 1px solid var(--gk-line); }
.grok-settings .gk-model-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 15px 0; cursor: pointer; }
.grok-settings .gk-model-row input { width: 17px; height: 17px; flex: 0 0 auto; accent-color: var(--gk-strong); }
.grok-settings .gk-model-id { display: block; font: 11px/1.6 ui-monospace, Consolas, monospace; color: var(--gk-muted); margin-top: 2px; }
.grok-settings .gk-model-count { display: flex; align-items: baseline; gap: 7px; }
.grok-settings .gk-model-count .gk-numeric { font-size: 40px; line-height: 1; }
.grok-settings .gk-code { font: 600 24px/1.4 ui-monospace, Consolas, monospace; letter-spacing: 2px; }
@container grok-settings (max-width: 460px) {
  .grok-settings .gk-nav { gap: 2px; }
  .grok-settings .gk-nav button { padding: 7px 9px; font-size: 12px; }
  .grok-settings .gk-feature, .grok-settings .gk-panel { padding: 17px; }
  .grok-settings .gk-telemetry > div { padding: 0 10px; }
  .grok-settings .gk-reading .gk-numeric { font-size: 29px; }
  .grok-settings .gk-fields { grid-template-columns: 1fr; }
}
@container grok-settings (max-width: 290px) {
  .grok-settings .gk-telemetry { grid-template-columns: 1fr; gap: 12px; }
  .grok-settings .gk-telemetry > div { padding: 0; border: 0; }
  .grok-settings .gk-setting-label { flex-wrap: wrap; }
}
@container grok-settings (max-width: 360px) {
  .grok-settings .gk-header { position: static !important; }
  .grok-settings .gk-footer { position: static; margin-bottom: 0; padding-bottom: 0; }
}
`

export function SettingsStyles() {
  return <style>{styles}</style>
}
