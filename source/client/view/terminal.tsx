import Session from "@client/core/session"
import { Terminal as Xterm } from "@xterm/xterm"
import { useEffect, useRef } from "react"
import "@xterm/xterm/css/xterm.css"
import fitTerminal from "./fit-terminal"

export default function Terminal({ session, inverted }: Readonly<{ session: Session, inverted: boolean }>) {
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = container.current
    if (!element) return
    const renderer = new AbortController()
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
    terminal.open(element)
    const fit = () => fitTerminal(terminal)
    void loadWebgl(terminal, renderer.signal, fit)
    terminal.element?.querySelectorAll<HTMLElement>(".xterm-viewport, .composition-view")
      .forEach(layer => { layer.style.backgroundColor = transparent })

    const stopSession = session.subscribe(update => {
      if (update.type === "snapshot") {
        terminal.reset()
        terminal.write(update.data)
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
    terminal.focus()

    return () => {
      renderer.abort()
      observer.disconnect()
      stopResize.dispose()
      stopInput.dispose()
      stopSession()
      terminal.dispose()
    }
  }, [session])

  return <main
    className="terminal-body"
    ref={container}
    style={{ filter: inverted ? "invert(100%)" : undefined }}
    onClick={() => container.current?.querySelector("textarea")?.focus()}
  />
}

async function loadWebgl(terminal: Xterm, signal: AbortSignal, fit: () => void) {
  try {
    const { WebglAddon } = await import("@xterm/addon-webgl")
    if (signal.aborted) return
    const webgl = new WebglAddon()
    terminal.loadAddon(webgl)
    fit()
    webgl.onContextLoss(() => {
      webgl.dispose()
      fit()
    })
  } catch {
    // xterm keeps its DOM renderer when WebGL is unavailable.
  }
}

function message(value: unknown) {
  return value instanceof Error ? value.message : "The terminal operation failed"
}
