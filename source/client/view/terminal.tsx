import Session from "@client/core/session"
import { WebglAddon } from "@xterm/addon-webgl"
import { Terminal as Xterm } from "@xterm/xterm"
import { useEffect, useRef } from "react"
import "@xterm/xterm/css/xterm.css"
import fitTerminal from "./fit-terminal"

function loadPreferredRenderer(terminal: Xterm) {
  let webgl: WebglAddon | undefined
  let stopContextLoss: { dispose(): void } | undefined

  const dispose = () => {
    stopContextLoss?.dispose()
    stopContextLoss = undefined
    webgl?.dispose()
    webgl = undefined
  }

  try {
    webgl = new WebglAddon()
    stopContextLoss = webgl.onContextLoss(dispose)
    terminal.loadAddon(webgl)
  }
  catch {
    dispose()
  }

  return dispose
}

export default function Terminal({ session, inverted, onReady, visible }: Readonly<{
  session: Session
  inverted: boolean
  onReady: () => void
  visible: boolean
}>) {
  const container = useRef<HTMLDivElement>(null)
  const instance = useRef<Xterm | null>(null)

  useEffect(() => {
    if (visible) instance.current?.focus()
  }, [visible])

  useEffect(() => {
    const element = container.current
    if (!element) return
    const transparent = "rgb(0, 0, 0, 0)"

    const terminal = new Xterm({
      cursorBlink: true,
      cursorStyle: "block",
      fontFamily: '"SFMono-Regular", "Cascadia Code", "Liberation Mono", monospace',
      fontSize: 13,
      lineHeight: 1.25,
      scrollback: 10_000,
      allowTransparency: true,
      theme: {
        background: transparent
      }
    })
    instance.current = terminal
    let active = true
    let initialParsed = false
    let initialRendered = false
    const stopInitialRender = terminal.onRender(() => {
      if (!active || !initialParsed || initialRendered) return
      initialRendered = true
      onReady()
    })
    terminal.open(element)
    const stopRenderer = loadPreferredRenderer(terminal)
    const fit = () => fitTerminal(terminal)
    terminal.element?.querySelectorAll<HTMLElement>(".xterm-viewport, .composition-view")
      .forEach(layer => { layer.style.backgroundColor = transparent })

    const stopSession = session.subscribe(update => {
      if (update.type === "snapshot") {
        terminal.reset()
        terminal.write(update.data, () => {
          if (!active) return
          // The initial snapshot must be parsed and painted before revealing the terminal.
          initialParsed = true
          terminal.refresh(0, terminal.rows - 1)
        })
      }
      if (update.type === "output") terminal.write(update.data)
      if (update.type === "change" && session.isRemoved) terminal.write("\r\n\x1b[90mSession ended.\x1b[0m\r\n")
      if (update.type === "failure") terminal.write(`\r\n\x1b[31m${message(update.error)}\x1b[0m\r\n`)
    })
    const stopInput = terminal.onData(data => {
      void session.write(data).catch(error => terminal.write(`\r\n\x1b[31m${message(error)}\x1b[0m\r\n`))
    })
    const stopResize = terminal.onResize(size => {
      void session.resize(size.cols, size.rows).catch(error => terminal.write(`\r\n\x1b[31m${message(error)}\x1b[0m\r\n`))
    })
    const observer = new ResizeObserver(fit)
    observer.observe(element)
    fit()

    return () => {
      active = false
      observer.disconnect()
      stopInitialRender.dispose()
      stopResize.dispose()
      stopInput.dispose()
      stopSession()
      stopRenderer()
      terminal.dispose()
      if (instance.current === terminal) instance.current = null
    }
  }, [onReady, session])

  return <main
    className="terminal-body"
    ref={container}
    style={{ filter: inverted ? "invert(100%)" : undefined }}
    onClick={() => container.current?.querySelector("textarea")?.focus()}
  />
}

function message(value: unknown) {
  return value instanceof Error ? value.message : "The terminal operation failed"
}
