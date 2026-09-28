import { useEffect, useRef, useState } from 'react'
import { Terminal as TerminalIcon, RotateCcw } from 'lucide-react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { openTerminal, type TerminalConnection } from '@/api/colab'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { isTouchDevice } from '@/lib/platform'

type State = 'connecting' | 'open' | 'closed'

type Modifier = 'ctrl' | 'alt'

/** Keys a phone keyboard lacks, as the bytes a terminal expects. */
const KEYS: { label: string; aria: string; data?: string; modifier?: Modifier }[] = [
  { label: 'esc', aria: 'Escape', data: '\x1b' },
  { label: 'tab', aria: 'Tab', data: '\t' },
  { label: 'ctrl', aria: 'Control', modifier: 'ctrl' },
  { label: 'alt', aria: 'Alt', modifier: 'alt' },
  { label: '←', aria: 'Left', data: '\x1b[D' },
  { label: '↓', aria: 'Down', data: '\x1b[B' },
  { label: '↑', aria: 'Up', data: '\x1b[A' },
  { label: '→', aria: 'Right', data: '\x1b[C' },
  { label: '|', aria: 'Pipe', data: '|' },
  { label: '/', aria: 'Slash', data: '/' },
  { label: '-', aria: 'Dash', data: '-' },
  { label: '~', aria: 'Tilde', data: '~' },
]

/**
 * Apply sticky modifiers to typed input: Ctrl turns a letter (or one of
 * `@[\\]^_`) into its control character, Alt prefixes Escape.
 */
export function applyModifiers(data: string, modifiers: Set<Modifier>): string {
  let out = data
  if (modifiers.has('ctrl') && out.length === 1) {
    const code = out.toUpperCase().charCodeAt(0)
    if (code >= 64 && code <= 95) out = String.fromCharCode(code - 64)
    else if (out === '?') out = '\x7f'
  }
  if (modifiers.has('alt')) out = `\x1b${out}`
  return out
}

/**
 * A real shell on the runtime — VS Code's `colab.openTerminal` / the CLI's
 * `colab console`. Keystrokes and resizes travel as the upstream
 * `{data}` / `{cols, rows}` frames through the engine to the VM's
 * `/colab/tty`.
 */
export function TerminalPanel({ sessionName }: { sessionName: string | null }) {
  const host = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<State>('connecting')
  const [attempt, setAttempt] = useState(0)
  const [modifiers, setModifierState] = useState<Set<Modifier>>(new Set())
  // The terminal's input handler reads the latest modifiers without re-subscribing.
  const modifiersRef = useRef<Set<Modifier>>(new Set())
  const setModifiers = (next: Set<Modifier>) => {
    modifiersRef.current = next
    setModifierState(next)
  }
  const sendRef = useRef<(data: string) => void>(() => {})
  const [touch] = useState(isTouchDevice)

  useEffect(() => {
    if (!sessionName || !host.current) return
    const narrow = window.matchMedia?.('(max-width: 639px)').matches ?? false
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: narrow ? 12 : 13,
      theme: { background: '#141414', foreground: '#f2efe8', cursor: '#f2efe8' },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host.current)
    fit.fit()

    let connection: TerminalConnection | null = null
    let disposed = false
    const send = (frame: object) => connection?.send(frame)

    setState('connecting')
    term.writeln(`Connecting to ${sessionName}…`)
    openTerminal(sessionName, {
      onData: (data) => {
        if (!disposed) term.write(data)
      },
      onClose: (reason) => {
        if (disposed) return
        setState('closed')
        term.writeln(`\r\n\x1b[2m[${reason ? `disconnected: ${reason}` : 'disconnected'}]\x1b[0m`)
      },
    })
      .then((opened) => {
        if (disposed) {
          opened.close()
          return
        }
        connection = opened
        setState('open')
        send({ cols: term.cols, rows: term.rows })
        term.focus()
      })
      .catch((error: unknown) => {
        setState('closed')
        term.writeln(
          `\r\n${error instanceof Error ? error.message : 'Could not open the terminal.'}`,
        )
      })

    // Typed input (and the key bar) honour the sticky Ctrl / Alt keys.
    const type = (data: string) => {
      const active = modifiersRef.current
      send({ data: applyModifiers(data, active) })
      if (active.size) setModifiers(new Set())
    }
    sendRef.current = type
    const input = term.onData(type)
    const resize = term.onResize(({ cols, rows }) => send({ cols, rows }))
    const observer = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        // Hidden or zero-sized container.
      }
    })
    observer.observe(host.current)

    return () => {
      disposed = true
      observer.disconnect()
      input.dispose()
      resize.dispose()
      connection?.close()
      term.dispose()
    }
  }, [sessionName, attempt])

  if (!sessionName) {
    return (
      <section className="rounded-[24px] border border-line bg-paper p-8 text-center">
        <TerminalIcon className="mx-auto size-6 text-graphite" />
        <p className="mt-3 text-sm text-graphite">Select a runtime to open a terminal on it.</p>
      </section>
    )
  }

  return (
    <section aria-label="Terminal" className="rounded-[24px] border border-ink bg-paper p-4 md:p-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={cn(
              'size-2 rounded-full',
              state === 'open'
                ? 'bg-mint'
                : state === 'connecting'
                  ? 'bg-sunshine'
                  : 'bg-graphite/40',
            )}
          />
          <p className="font-medium">Terminal</p>
          <span className="truncate text-xs text-graphite">{sessionName}</span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={state === 'connecting'}
          onClick={() => setAttempt((value) => value + 1)}
        >
          <RotateCcw className="size-4" /> Reconnect
        </Button>
      </div>
      <div
        ref={host}
        className="h-[50dvh] min-h-64 overflow-hidden rounded-2xl bg-[#141414] p-2 sm:h-[28rem]"
        onClick={(event) =>
          (event.currentTarget.querySelector('textarea') as HTMLElement | null)?.focus()
        }
      />
      {/* Touch screens: the keys a phone keyboard lacks. Buttons keep the
          focus (and the keyboard) on the terminal. */}
      <div
        role="toolbar"
        aria-label="Terminal keys"
        className={cn(
          'scrollbar-thin mt-3 flex gap-1.5 overflow-x-auto pb-1',
          // Phones and portrait tablets always; wider screens only with touch.
          !touch && 'lg:hidden',
        )}
      >
        {KEYS.map((key) => {
          const active = key.modifier ? modifiers.has(key.modifier) : false
          return (
            <button
              key={key.aria}
              type="button"
              aria-label={key.aria}
              aria-pressed={key.modifier ? active : undefined}
              disabled={state !== 'open'}
              // Mouse: keep the focus on the terminal. Touch: a prevented
              // pointerdown would swallow the tap in WebKit, so the terminal
              // takes the focus back after the key instead.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                if (key.modifier) {
                  const next = new Set(modifiers)
                  if (active) next.delete(key.modifier)
                  else next.add(key.modifier)
                  setModifiers(next)
                } else if (key.data) {
                  sendRef.current(key.data)
                }
                host.current?.querySelector<HTMLElement>('.xterm-helper-textarea')?.focus()
              }}
              className={cn(
                'h-10 min-w-11 shrink-0 cursor-pointer rounded-xl border px-3 font-mono text-sm transition-colors disabled:opacity-40',
                active
                  ? 'border-ink bg-sunshine text-on-sunshine'
                  : 'border-line bg-paper-soft active:bg-line',
              )}
            >
              {key.label}
            </button>
          )
        })}
      </div>
    </section>
  )
}
