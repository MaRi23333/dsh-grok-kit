//
// Merged from the former standalone plugin `dsh-grok-imagine-ui` (v0.1.0),
// including its two production fixes:
//   - render grok_imagine_edit alongside grok_imagine (REVERT-edit-tool-support.md)
//   - never return null for save_path calls: fall back to a text card
//     (FIX-null-render-save-path.md)
//

/** Session image viewer for grok_imagine / grok_imagine_edit results. */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'

const TOOL_NAME = 'grok_imagine'
/** This view renders both text-to-image and image-to-image; the latter is registered as grok_imagine_edit. */
const TOOL_NAMES = new Set(['grok_imagine', 'grok_imagine_edit'])
/**
 * Codex-line image tool. Not rendered here (dsh-codex-connect draws its own
 * cards); only counted at the turn tail for the purple/green source legend.
 */
const CODEX_TOOL_NAMES = new Set(['codex_connect_image_generate'])

// ---------------------------------------------------------------------------
// Block shapes (loose on purpose: the host owns the real definitions)
// ---------------------------------------------------------------------------

interface ContentPart {
  type?: string
  text?: string
  attachment?: unknown
}

export interface ToolCallBlock {
  kind?: string
  phase?: string
  call?: { name?: string; argsRaw?: string }
  argsRaw?: string
  content?: ContentPart[]
  isError?: boolean
  callId?: string
  seq?: number
  subCalls?: unknown[]
}

interface ExternalStore<T> {
  subscribe: (onChange: () => void) => () => void
  getSnapshot: () => T
}

interface SessionBinding {
  session?: {
    readAttachment?: (attachmentId: string) => Promise<{
      ok: boolean
      value?: { attachment: { attachmentId: string; mediaType: string }; data: Uint8Array }
    }>
    prompt?: (parts: Array<{ type: string; text: string }>, mode: string) => Promise<{ ok: boolean }>
    cancel?: () => Promise<{ ok: boolean }>
  }
}

interface SessionsService {
  binding: (sessionId: string) => SessionBinding | undefined
}

interface ChatNodes {
  turnDataSource: (turn: unknown, kind: string) => ExternalStore<ToolCallBlock[]>
}

interface ChatState {
  nodes: ChatNodes
}

interface UseChat {
  (selector: (chat: ChatState) => ExternalStore<ToolCallBlock[]>): ExternalStore<ToolCallBlock[]>
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toolNameOf(block: unknown): string {
  if (isObject(block) && 'kind' in block && isObject(block.call)) {
    const name = block.call.name
    if (typeof name === 'string' && TOOL_NAMES.has(name)) return name
  }
  return TOOL_NAME
}

function argsOf(block: unknown): Record<string, unknown> | undefined {
  if (!isObject(block)) return undefined
  const raw = 'kind' in block && isObject(block.call)
    ? block.call.argsRaw
    : block.phase === 'start' ? block.argsRaw : undefined
  if (typeof raw !== 'string' || raw === '') return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    return isObject(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

/** Edit results have no "regenerate" semantics; re-edit the same input image instead. */
function regenerateText(toolName: string, prompt: string, args: Record<string, unknown> | undefined): string {
  if (toolName !== 'grok_imagine_edit') return `请用 grok_imagine 按以下提示词重新生成一张图，不要改写提示词：\n${prompt}`
  const source = args?.image
  const hint = typeof source === 'string' && source.length > 0 && source.length <= 400 ? `输入图沿用：${source}` : '输入图沿用上一条 grok_imagine_edit 调用的那张图'
  return `请用 grok_imagine_edit 编辑这张图，${hint}。不要改写提示词：\n${prompt}`
}

const IMAGE_MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const MIN_ZOOM = 1
const MAX_ZOOM = 4
const ZOOM_STEP = 0.5

const actionStyle: CSSProperties = {
  justifySelf: 'start',
  minHeight: 28,
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 7,
  padding: '3px 10px',
  background: 'transparent',
  color: 'var(--dsw-alias-label-primary)',
  font: 'inherit',
  cursor: 'pointer',
}

const detailStyle: CSSProperties = {
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: 13,
  lineHeight: '18px',
}

const shellStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'flex-start',
  gap: 14,
  minWidth: 0,
  padding: 12,
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 10,
  background: 'var(--dsw-alias-bg-module-platform)',
  color: 'var(--dsw-alias-label-primary)',
}

/**
 * Source badge. Grok and Codex image cards look alike in a session, so the
 * card must identify itself: this view renders the Grok line (purple dot);
 * the Codex line is rendered by dsh-codex-connect (green dot is reserved).
 */
const SOURCE_TONES = { grok: '#7c3aed', codex: '#10a37f' }
const SOURCE_LABEL = 'Grok Imagine'

function sourceBadge(label: string, tone: string): ReactNode {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <i aria-hidden style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: tone }} />
      <strong style={{ fontSize: 13, fontWeight: 600 }}>{label}</strong>
    </span>
  )
}

/** Title row: source badge + action (已生成 / 已编辑 / 正在生成). */
function grokTitle(verb: string): ReactNode {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
      {sourceBadge(SOURCE_LABEL, SOURCE_TONES.grok)}
      <span style={{ fontSize: 13, color: 'var(--dsw-alias-label-secondary)' }}>{verb}</span>
    </span>
  )
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

interface ImageRef {
  attachmentId: string
  mediaType: string
  bytes: number
  width: number
  height: number
  name?: string
}

function imageRef(value: unknown): ImageRef | undefined {
  if (!isObject(value)) return undefined
  if (typeof value.attachmentId !== 'string' || value.attachmentId === '') return undefined
  if (typeof value.mediaType !== 'string' || !IMAGE_MEDIA_TYPES.has(value.mediaType)) return undefined
  if (!positiveInteger(value.bytes) || !positiveInteger(value.width) || !positiveInteger(value.height)) return undefined
  return {
    attachmentId: value.attachmentId,
    mediaType: value.mediaType,
    bytes: value.bytes as number,
    width: value.width as number,
    height: value.height as number,
    ...typeof value.name === 'string' ? { name: value.name } : {},
  }
}

function imageAttachments(block: unknown): ImageRef[] {
  if (!isObject(block) || !('kind' in block) || !Array.isArray(block.content)) return []
  const images: ImageRef[] = []
  for (const part of block.content as ContentPart[]) {
    if (!isObject(part) || part.type !== 'image') continue
    const ref = imageRef(part.attachment)
    if (ref === undefined) return []
    images.push(ref)
  }
  return images
}

function promptOf(block: unknown): string {
  if (!isObject(block)) return ''
  const raw = 'kind' in block && isObject(block.call)
    ? block.call.argsRaw
    : block.phase === 'start' ? block.argsRaw : undefined
  if (typeof raw !== 'string' || raw === '') return ''
  try {
    const parsed: unknown = JSON.parse(raw)
    return isObject(parsed) && typeof parsed.prompt === 'string' ? parsed.prompt.trim() : ''
  } catch {
    return ''
  }
}

/**
 * Text of the result block.
 * Calls with a save_path produce no session attachment (the image went
 * straight to disk), so the result block carries text only — returning null
 * here would make the whole tool call vanish from the conversation.
 */
function textOf(block: unknown): string {
  if (!isObject(block) || !('kind' in block) || !Array.isArray(block.content)) return ''
  const parts: string[] = []
  for (const part of block.content as ContentPart[]) {
    if (!isObject(part)) continue
    if (part.type === 'text' && typeof part.text === 'string' && part.text.trim() !== '') parts.push(part.text.trim())
  }
  return parts.join('\n\n')
}

function formatBytes(bytes: number): string {
  if (bytes < 1e3) return `${String(bytes)} B`
  if (bytes < 1e6) return `${(bytes / 1e3).toFixed(bytes < 1e4 ? 1 : 0)} KB`
  return `${(bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0)} MB`
}

function formatMediaType(mediaType: string): string {
  return mediaType === 'image/jpeg' ? 'JPEG' : mediaType.slice(6).toUpperCase()
}

function extensionFor(mediaType: string): string {
  switch (mediaType) {
    case 'image/jpeg': return 'jpg'
    case 'image/webp': return 'webp'
    case 'image/gif': return 'gif'
    default: return 'png'
  }
}

function triggerDownload(url: string, name: string): void {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.rel = 'noopener'
  document.body.append(anchor)
  try {
    anchor.click()
  } finally {
    anchor.remove()
  }
}

// ---------------------------------------------------------------------------
// Image loading (blob URLs per session, cached and revoked)
// ---------------------------------------------------------------------------

function useImageLoader(sessionId: string | undefined, sessions: SessionsService | undefined) {
  const urls = useRef(new Map<string, { sessionId: string; url: string }>())
  const pending = useRef(new Map<string, Promise<string>>())
  const activeSession = useRef(sessionId)
  const disposed = useRef(false)
  activeSession.current = sessionId
  useEffect(() => () => {
    disposed.current = true
    for (const entry of urls.current.values()) URL.revokeObjectURL(entry.url)
    urls.current.clear()
  }, [])
  useEffect(() => () => {
    for (const [key, entry] of urls.current) {
      if (entry.sessionId !== sessionId) continue
      URL.revokeObjectURL(entry.url)
      urls.current.delete(key)
    }
  }, [sessionId])
  return useCallback(async (attachment: ImageRef): Promise<string> => {
    if (typeof sessionId !== 'string' || sessionId === '' || typeof sessions?.binding !== 'function') throw new Error('Image session is unavailable')
    const key = `${sessionId}\0${attachment.attachmentId}`
    const cached = urls.current.get(key)
    if (cached !== undefined) return cached.url
    const inflight = pending.current.get(key)
    if (inflight !== undefined) return inflight
    const request = (async () => {
      const result = await sessions.binding(sessionId)?.session?.readAttachment?.(attachment.attachmentId)
      if (result?.ok !== true || result.value?.attachment.attachmentId !== attachment.attachmentId) throw new Error('Image attachment could not be read')
      if (disposed.current || activeSession.current !== sessionId) throw new Error('Image view is no longer active')
      const bytes = result.value.data.slice().buffer
      const url = URL.createObjectURL(new Blob([bytes], { type: result.value.attachment.mediaType }))
      urls.current.set(key, { sessionId, url })
      return url
    })().finally(() => {
      pending.current.delete(key)
    })
    pending.current.set(key, request)
    return request
  }, [sessionId, sessions])
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function ImagineLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const dragStart = useRef<{ pointerId: number; clientX: number; clientY: number; scrollLeft: number; scrollTop: number } | null>(null)
  const [zoom, setZoom] = useState(MIN_ZOOM)
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    const node = dialog.current
    if (node === null) return
    if (typeof node.showModal === 'function' && !node.open) node.showModal()
    const onCancel = (event: Event) => {
      event.preventDefault()
      onClose()
    }
    node.addEventListener('cancel', onCancel)
    return () => {
      node.removeEventListener('cancel', onCancel)
      if (node.open) node.close()
    }
  }, [onClose])
  useEffect(() => {
    if (zoom !== MIN_ZOOM || viewport.current === null) return
    viewport.current.scrollLeft = 0
    viewport.current.scrollTop = 0
  }, [zoom])
  const button: CSSProperties = {
    minWidth: 32,
    height: 32,
    padding: '0 8px',
    border: '1px solid rgba(255,255,255,0.35)',
    borderRadius: 7,
    background: 'rgba(0,0,0,0.35)',
    color: '#fff',
    font: 'inherit',
    cursor: 'pointer',
  }
  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      style={{ padding: 0, border: 'none', background: 'transparent', maxWidth: '96vw', maxHeight: '96vh' }}
    >
      <div style={{ position: 'relative', width: 'min(96vw, 1200px)', height: 'min(90vh, 800px)', background: '#111', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 1, display: 'flex', alignItems: 'center', gap: 6, padding: 4, borderRadius: 9, background: 'rgba(0,0,0,0.55)', color: '#fff' }}>
          <button type="button" style={button} disabled={zoom === MIN_ZOOM} onClick={() => setZoom(value => Math.max(MIN_ZOOM, value - ZOOM_STEP))}>−</button>
          <span>{`${Math.round(zoom * 100)}%`}</span>
          <button type="button" style={button} disabled={zoom === MAX_ZOOM} onClick={() => setZoom(value => Math.min(MAX_ZOOM, value + ZOOM_STEP))}>+</button>
          <button type="button" style={button} disabled={zoom === MIN_ZOOM} onClick={() => setZoom(MIN_ZOOM)}>重置</button>
        </div>
        <button
          type="button"
          aria-label="关闭"
          onClick={onClose}
          style={{ ...button, position: 'absolute', top: 8, right: 8, zIndex: 1, width: 32, padding: 0 }}
        >
          ×
        </button>
        <div
          ref={viewport}
          onPointerDown={event => {
            if (zoom === MIN_ZOOM || event.button !== 0) return
            dragStart.current = {
              pointerId: event.pointerId,
              clientX: event.clientX,
              clientY: event.clientY,
              scrollLeft: event.currentTarget.scrollLeft,
              scrollTop: event.currentTarget.scrollTop,
            }
            event.currentTarget.setPointerCapture?.(event.pointerId)
            setDragging(true)
          }}
          onPointerMove={event => {
            const start = dragStart.current
            if (start === null || start.pointerId !== event.pointerId) return
            event.currentTarget.scrollLeft = start.scrollLeft - (event.clientX - start.clientX)
            event.currentTarget.scrollTop = start.scrollTop - (event.clientY - start.clientY)
            event.preventDefault()
          }}
          onPointerUp={event => {
            if (dragStart.current?.pointerId !== event.pointerId) return
            dragStart.current = null
            if (event.currentTarget.hasPointerCapture?.(event.pointerId) === true) event.currentTarget.releasePointerCapture(event.pointerId)
            setDragging(false)
          }}
          onPointerCancel={() => {
            dragStart.current = null
            setDragging(false)
          }}
          style={{ width: '100%', height: '100%', overflow: 'auto', cursor: zoom === MIN_ZOOM ? 'zoom-in' : dragging ? 'grabbing' : 'grab' }}
        >
          <div style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}>
            <img src={src} alt={alt} draggable={false} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
        </div>
      </div>
    </dialog>
  )
}

function ImagineFrame({ attachment, load }: { attachment: ImageRef; load: (attachment: ImageRef) => Promise<string> }) {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let live = true
    setError(false)
    setSrc(null)
    load(attachment).then(url => {
      if (live) setSrc(url)
    }).catch(() => {
      if (live) setError(true)
    })
    return () => {
      live = false
    }
  }, [attachment.attachmentId, attachment.bytes, attachment.height, attachment.mediaType, attachment.name, attachment.width, load])
  if (error) return <div style={detailStyle}>图片无法显示</div>
  if (src === null) return <div style={detailStyle}>正在加载图片…</div>
  const label = attachment.name ?? TOOL_NAME
  return (
    <>
      <button
        type="button"
        title="打开大图"
        aria-label={`打开 ${label}`}
        onClick={() => { setOpen(true) }}
        style={{
          display: 'block',
          padding: 0,
          border: '1px solid var(--dsw-alias-border-l2)',
          borderRadius: 12,
          background: 'var(--dsw-alias-bg-secondary, transparent)',
          cursor: 'zoom-in',
          overflow: 'hidden',
          maxWidth: 'min(100%, 320px)',
        }}
      >
        <img src={src} alt={label} style={{ display: 'block', width: '100%', height: 'auto', maxHeight: 320, objectFit: 'contain' }} />
      </button>
      {open ? <ImagineLightbox src={src} alt={label} onClose={() => { setOpen(false) }} /> : null}
    </>
  )
}

function ActionButton({ label, onClick, disabled }: { label: string; onClick: () => Promise<unknown>; disabled?: boolean }) {
  const [state, setState] = useState<'idle' | 'pending' | 'failed'>('idle')
  const alive = useRef(true)
  useEffect(() => () => {
    alive.current = false
  }, [])
  return (
    <button
      type="button"
      style={actionStyle}
      disabled={disabled === true || state === 'pending'}
      aria-busy={state === 'pending'}
      onClick={() => {
        if (state === 'pending' || disabled === true) return
        setState('pending')
        Promise.resolve(onClick()).then(() => {
          if (alive.current) setState('idle')
        }).catch(() => {
          if (alive.current) setState('failed')
        })
      }}
    >
      {state === 'pending' ? '处理中…' : state === 'failed' ? '失败' : label}
    </button>
  )
}

interface CardProps {
  block: unknown
  sessionId: string | undefined
  sessions: SessionsService | undefined
}

function ImagineResultCard({ block, sessionId, sessions }: CardProps) {
  const load = useImageLoader(sessionId, sessions)
  const images = imageAttachments(block)
  const prompt = promptOf(block)
  const resultText = textOf(block)
  const hasImages = images.length > 0
  const title = toolNameOf(block) === 'grok_imagine_edit' ? '已编辑' : '已生成'
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  useEffect(() => {
    if (copyState === 'idle') return
    const timer = window.setTimeout(() => { setCopyState('idle') }, 2000)
    return () => { window.clearTimeout(timer) }
  }, [copyState])
  if (!hasImages && resultText === '') return null
  const canPrompt = prompt !== '' && typeof sessionId === 'string' && typeof sessions?.binding === 'function'
  return (
    <section aria-label="grok_imagine" data-testid="grok-imagine-result" style={shellStyle}>
      {hasImages ? (
        <div style={{ display: 'grid', gap: 10, flex: '1 1 240px', maxWidth: 320, minWidth: 0 }}>
          {grokTitle(title)}
          <div data-testid="grok-imagine-gallery" style={{ display: 'grid', gap: 10 }}>
            {images.map((attachment, index) => <ImagineFrame key={`${attachment.attachmentId}:${index}`} attachment={attachment} load={load} />)}
          </div>
        </div>
      ) : null}
      <div style={{ display: 'grid', gap: 10, flex: '2 1 280px', minWidth: 0 }}>
        {hasImages ? null : grokTitle(title)}
        {!hasImages && resultText !== '' ? (
          <section aria-label="执行结果" style={{ display: 'grid', gap: 8 }}>
            <strong style={{ fontSize: 13, fontWeight: 600 }}>图片未进会话，已直接落盘</strong>
            <pre
              style={{
                boxSizing: 'border-box',
                width: '100%',
                maxHeight: 140,
                margin: 0,
                overflowY: 'auto',
                padding: '10px 12px',
                border: '1px solid var(--dsw-alias-border-l2)',
                borderRadius: 8,
                background: 'var(--dsw-alias-bg-base)',
                color: 'var(--dsw-alias-label-secondary)',
                fontFamily: 'var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)',
                fontSize: 12,
                lineHeight: '18px',
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
              }}
            >
              {resultText}
            </pre>
          </section>
        ) : null}
        {prompt ? (
          <section aria-label="提示词" style={{ display: 'grid', gap: 8 }}>
            <strong style={{ fontSize: 13, fontWeight: 600 }}>提示词</strong>
            <pre
              style={{
                boxSizing: 'border-box',
                width: '100%',
                maxHeight: 96,
                margin: 0,
                overflowY: 'auto',
                padding: '10px 12px',
                border: '1px solid var(--dsw-alias-border-l2)',
                borderRadius: 8,
                background: 'var(--dsw-alias-bg-base)',
                color: 'var(--dsw-alias-label-secondary)',
                fontFamily: 'var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)',
                fontSize: 12,
                lineHeight: '18px',
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
              }}
            >
              {prompt}
            </pre>
          </section>
        ) : null}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {prompt ? (
            <ActionButton
              label={copyState === 'copied' ? '已复制' : copyState === 'failed' ? '复制失败' : '复制提示词'}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(prompt)
                  setCopyState('copied')
                } catch (error) {
                  setCopyState('failed')
                  throw error
                }
              }}
            />
          ) : null}
          {images.map((image, index) => (
            <ActionButton
              key={`${image.attachmentId}:download`}
              label={images.length === 1 ? '下载' : `下载 ${index + 1}`}
              onClick={async () => {
                triggerDownload(await load(image), image.name ?? `grok-imagine.${extensionFor(image.mediaType)}`)
              }}
            />
          ))}
          {images.map((image, index) => (
            <ActionButton
              key={`${image.attachmentId}:copy`}
              label={images.length === 1 ? '复制图片' : `复制图片 ${index + 1}`}
              onClick={async () => {
                const blob = await (await fetch(await load(image))).blob()
                await navigator.clipboard.write([new ClipboardItem({ [blob.type || image.mediaType]: blob })])
              }}
            />
          ))}
          {canPrompt ? (
            <ActionButton
              label="重新生成"
              onClick={async () => {
                const accepted = await sessions!.binding(sessionId!)?.session?.prompt?.([{
                  type: 'text',
                  text: regenerateText(toolNameOf(block), prompt, argsOf(block)),
                }], 'queue')
                if (accepted?.ok !== true) throw new Error('regenerate failed')
              }}
            />
          ) : null}
        </div>
        {hasImages ? (
          <details>
            <summary style={{ cursor: 'pointer', color: 'var(--dsw-alias-label-secondary)', fontSize: 13 }}>图片详情</summary>
            <div style={{ ...detailStyle, display: 'grid', gap: 4, marginTop: 6 }}>
              {images.map((image, index) => (
                <span key={image.attachmentId}>
                  {image.name ?? `图片 ${index + 1}`} · {formatMediaType(image.mediaType)} · {image.width}×{image.height} · {formatBytes(image.bytes)}
                </span>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </section>
  )
}

function GeneratingCard({ sessionId, sessions, prompt }: { sessionId: string | undefined; sessions: SessionsService | undefined; prompt: string }) {
  return (
    <section aria-label="正在生成图片…" style={shellStyle}>
      {grokTitle('正在生成图片…')}
      {prompt ? <div style={detailStyle}>{prompt}</div> : null}
      <progress style={{ width: '100%', height: 4 }} />
      {typeof sessionId === 'string' && typeof sessions?.binding === 'function' ? (
        <ActionButton
          label="取消"
          onClick={async () => {
            const accepted = await sessions.binding(sessionId)?.session?.cancel?.()
            if (accepted?.ok === false) throw new Error('cancel failed')
          }}
        />
      ) : null}
    </section>
  )
}

function GrokImagineToolView(props: CardProps) {
  const settled = isObject(props.block) && 'kind' in (props.block as Record<string, unknown>)
  if (!settled) {
    return <GeneratingCard sessionId={props.sessionId} sessions={props.sessions} prompt={promptOf(props.block)} />
  }
  if ((props.block as ToolCallBlock).isError === true) {
    return (
      <section aria-label="图片生成失败" style={shellStyle}>
        {grokTitle('图片生成失败')}
      </section>
    )
  }
  return <ImagineResultCard block={props.block} sessionId={props.sessionId} sessions={props.sessions} />
}

// ---------------------------------------------------------------------------
// Turn-tail summary (all grok images of the turn, plus a Codex count legend)
// ---------------------------------------------------------------------------

function walkTurnImageResults(rows: unknown, closingSeq: number, names: Set<string>): ToolCallBlock[] {
  if (!Array.isArray(rows)) return []
  const images: ToolCallBlock[] = []
  for (const row of rows) {
    if (!isObject(row)) continue
    const pending: unknown[] = row.root === undefined ? [] : [row.root]
    const visited = new Set<string>()
    while (pending.length > 0) {
      const block = pending.pop()
      if (block === undefined) continue
      const record = isObject(block) ? block as ToolCallBlock : undefined
      if (record === undefined) continue
      const callId = typeof record.callId === 'string' ? record.callId : ''
      if (callId !== '' && visited.has(callId)) continue
      if (callId !== '') visited.add(callId)
      const seq = typeof record.seq === 'number' ? record.seq : Number.POSITIVE_INFINITY
      const callName = record.call?.name
      if ('kind' in record && record.isError !== true && seq <= closingSeq && callName !== undefined && names.has(callName) && imageAttachments(record).length > 0) {
        images.push(record)
      }
      const children = Array.isArray(record.subCalls) ? record.subCalls : []
      for (let index = children.length - 1; index >= 0; index--) {
        if (children[index] !== undefined) pending.push(children[index])
      }
    }
  }
  return images.sort((left, right) => (left.seq ?? 0) - (right.seq ?? 0))
}

function selectTurnImagineResults(rows: unknown, closingSeq: number): ToolCallBlock[] {
  return walkTurnImageResults(rows, closingSeq, TOOL_NAMES)
}

/** Codex-line image count this turn; legend only. */
function countTurnCodexResults(rows: unknown, closingSeq: number): number {
  return walkTurnImageResults(rows, closingSeq, CODEX_TOOL_NAMES).length
}

interface TurnTailProps {
  turn?: { turn: unknown }
  seq?: number
  sessionId?: string
  sessions?: SessionsService
  useChat?: UseChat
}

function GrokImagineTurnTail(props: TurnTailProps) {
  const empty = useMemo<ExternalStore<ToolCallBlock[]>>(() => ({
    subscribe: () => () => undefined,
    getSnapshot: () => [],
  }), [])
  const source = typeof props.useChat === 'function' && props.turn !== undefined
    ? props.useChat(chat => chat.nodes.turnDataSource(props.turn!.turn, 'tool-call'))
    : empty
  const rows = useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot)
  const results = useMemo(() => selectTurnImagineResults(rows, props.seq ?? Number.POSITIVE_INFINITY), [rows, props.seq])
  const codexCount = useMemo(() => countTurnCodexResults(rows, props.seq ?? Number.POSITIVE_INFINITY), [rows, props.seq])
  if (results.length === 0) return null
  return (
    <section data-turn-image-results="grok-imagine" aria-label="grok_imagine" style={{ display: 'grid', gap: 12, minWidth: 0 }}>
      {codexCount > 0 ? (
        <div style={{ ...detailStyle, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          {sourceBadge(SOURCE_LABEL, SOURCE_TONES.grok)}
          <span>{`紫点 = 本插件渲染的 Grok Imagine 出图；本回合另有 ${String(codexCount)} 张由 Codex（GPT Image）出图，卡片样式不同、不带紫点。`}</span>
        </div>
      ) : null}
      {results.map(block => (
        <ImagineResultCard
          key={block.callId ?? String(block.seq)}
          block={block}
          sessionId={props.sessionId}
          sessions={props.sessions}
        />
      ))}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Slot wiring
// ---------------------------------------------------------------------------

/**
 * Register the toolview occupant for both grok image tools and the turn-tail
 * summary. Called from the client entry; requires the `sessions` service via
 * a child fiber so the registrations unload with it.
 */
export function applyImagineViews(ctx: Context): void {
  ctx.inject(['sessions'], scope => {
    const sessions = scope.sessions as SessionsService
    for (const key of TOOL_NAMES) {
      scope.slots.inject('tool.call.toolview', () => scope.slots.register({
        name: 'tool.call.toolview',
        key,
        inject: () => ({ sessions }),
      }, GrokImagineToolView))
    }
    scope.slots.inject('conversation.chat.turnTail', () => scope.slots.register({
      name: 'conversation.chat.turnTail',
      id: 'dsh-grok-kit-imagine',
      order: 21,
      inject: () => ({ sessions }),
    }, GrokImagineTurnTail))
  })
}
