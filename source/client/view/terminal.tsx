import Session from "@client/core/session"
import { FitAddon } from "@xterm/addon-fit"
import { Terminal as Xterm } from "@xterm/xterm"
import { useEffect, useRef } from "react"
import "@xterm/xterm/css/xterm.css"

export default function Terminal({ session, foreground }: Readonly<{ session: Session, foreground: string }>) {
  const container = useRef<HTMLDivElement>(null)
  const instance = useRef<Xterm>(null)

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
        background: transparent,
        foreground,
        cursor: foreground,
        cursorAccent: "#000000",
        selectionBackground: "#ffffff44",
        black: "#1f2430",
        red: "#e35d6a",
        green: "#65b584",
        yellow: "#d6ad5c",
        blue: "#5d8ee3",
        magenta: "#aa7ed1",
        cyan: "#55aeb8",
        white: "#d8dee9",
        brightBlack: "#68707d",
        brightRed: "#f07178",
        brightGreen: "#8bd49c",
        brightYellow: "#ffb454",
        brightBlue: "#59c2ff",
        brightMagenta: "#d2a6ff",
        brightCyan: "#95e6cb",
        brightWhite: "#f3f4f5"
      }
    })
    const fit = new FitAddon()
    instance.current = terminal
    terminal.loadAddon(fit)
    terminal.open(element)
    void loadWebgl(terminal, renderer.signal, () => fit.fit())
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
    const observer = new ResizeObserver(() => fit.fit())
    observer.observe(element)
    fit.fit()
    terminal.focus()

    return () => {
      instance.current = null
      renderer.abort()
      observer.disconnect()
      stopResize.dispose()
      stopInput.dispose()
      stopSession()
      terminal.dispose()
    }
  }, [session])

  useEffect(() => {
    const terminal = instance.current
    if (!terminal) return
    terminal.options.theme = { ...terminal.options.theme, foreground, cursor: foreground }
  }, [foreground])

  return <main
    className="terminal-body"
    ref={container}
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
