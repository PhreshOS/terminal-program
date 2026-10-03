import { ask, followOutput, type Output, type Snapshot } from "@client/core/terminal-server"
import { Surface, useAppearance, useColor, useThemedValue } from "@phreshos/react-ui"
import { FitAddon } from "@xterm/addon-fit"
import { WebglAddon } from "@xterm/addon-webgl"
import { Terminal, type ITheme } from "@xterm/xterm"
import "@xterm/xterm/css/xterm.css"
import { useEffect, useRef } from "react"

/** How often a window tells the Server how far it has drawn. */
const acknowledgeEvery = 100

/**
 * The scrollbar takes no room and does not show: the wheel and the trackpad scroll the terminal, as
 * in the earlier Terminal. xterm keeps a column beside the rows for its scrollbar, as wide as its
 * overview ruler, and a full-screen program such as an editor leaves that column unpainted; one pixel
 * keeps the rows reaching the edge.
 */
const scrollbarRoom = 1

/**
 * One session drawn as a terminal, on a well recessed into the window. It follows the session's
 * output from the moment it starts, takes the screen as it is, numbered, and continues from it; it
 * tells the Server how much it has drawn, so a shell writing faster than the screen draws waits for
 * it. A gap in the numbers takes the screen again.
 */
export default function Screen({ session, window }: Readonly<{ session: string, window: string }>) {
    const element = useRef<HTMLDivElement>(null)
    const terminal = useRef<Terminal | null>(null)
    const theme = useTheme()
    const themeOf = useRef(theme)

    // The theme follows the Appearance without starting the session over. This effect comes first, so
    // a terminal made below starts with the theme of the moment.
    useEffect(() => {
        themeOf.current = theme
        if (terminal.current) terminal.current.options.theme = theme
    }, [theme])

    useEffect(() => {
        const host = element.current!
        const xterm = new Terminal({
            cursorBlink: true,
            overviewRuler: { width: scrollbarRoom },
            fontFamily: '"SF Mono", "JetBrains Mono", "Cascadia Code", ui-monospace, monospace',
            fontSize: 13,
            lineHeight: 1.25,
            scrollback: 10_000,
            allowTransparency: true,
            theme: themeOf.current
        })
        terminal.current = xterm
        const fit = new FitAddon()
        xterm.loadAddon(fit)
        xterm.open(host)
        const stopRenderer = loadWebgl(xterm)

        let active = true
        let applied = -1
        let drawn = 0
        let acknowledged = 0
        let acknowledgeTimer: ReturnType<typeof setTimeout> | undefined
        let waiting: Output[] | null = []
        let stopOutput: (() => void) | undefined

        const acknowledge = () => {
            acknowledgeTimer = undefined
            if (!active || drawn === acknowledged) return
            acknowledged = drawn
            void ask("session.acknowledge", { session, window, characters: drawn }).catch(() => undefined)
        }
        const draw = (output: Output) => {
            if (output.sequence <= applied) return
            if (output.sequence !== applied + 1) { void take(); return }
            applied = output.sequence
            xterm.write(output.data, () => {
                drawn += output.data.length
                acknowledgeTimer ??= setTimeout(acknowledge, acknowledgeEvery)
            })
        }
        // The screen as it is now, then whatever arrived meanwhile after it.
        const take = async () => {
            waiting = waiting ?? []
            const snapshot = await ask<Snapshot>("session.watch", { session, window })
            if (!active) return
            drawn = 0
            acknowledged = 0
            xterm.reset()
            // The screen was kept at its own size; drawn at that size, its lines fall where they were.
            xterm.resize(snapshot.cols, snapshot.rows)
            xterm.write(snapshot.data)
            applied = snapshot.sequence
            const arrived = waiting
            waiting = null
            for (const output of arrived) draw(output)
        }

        void (async () => {
            stopOutput = await followOutput(session, output => { if (waiting) waiting.push(output); else draw(output) })
            if (!active) { stopOutput(); return }
            await take()
            fit.fit()
        })().catch(error => xterm.write(`\r\n\x1b[31m${messageOf(error)}\x1b[0m\r\n`))

        const input = xterm.onData(data => { void ask("session.write", { session, data }).catch(error => xterm.write(`\r\n\x1b[31m${messageOf(error)}\x1b[0m\r\n`)) })
        const resized = xterm.onResize(({ cols, rows }) => { void ask("session.resize", { session, cols, rows }).catch(() => undefined) })
        const observer = new ResizeObserver(() => fit.fit())
        observer.observe(host)
        // Typing goes to the session shown, as a page takes focus once its tab is chosen. It waits a
        // frame: a tab chosen with the pointer is still being pressed when this session appears, and
        // focus moved during that press would read as keyboard focus and ring the tab.
        const focusing = requestAnimationFrame(() => { if (active) xterm.focus() })

        return () => {
            active = false
            cancelAnimationFrame(focusing)
            clearTimeout(acknowledgeTimer)
            observer.disconnect()
            input.dispose()
            resized.dispose()
            stopOutput?.()
            void ask("session.unwatch", { session, window }).catch(() => undefined)
            stopRenderer()
            xterm.dispose()
            if (terminal.current === xterm) terminal.current = null
        }
    }, [session, window])

    return <Surface depth="recessed" className="screen" onClick={() => terminal.current?.focus()}>
        <div ref={element} className="screen-terminal" />
    </Surface>
}

/**
 * The terminal's colors, from the Appearance: its text, its accent for the cursor and the selection,
 * and its named colors for the sixteen a shell uses. xterm reads only concrete colors, so the dimmed
 * ones are the Appearance's own concrete levels rather than mixes.
 */
function useTheme(): ITheme {
    const colors = useThemedValue(useAppearance().colors)
    const muted = useColor("foreground").soft
    const selection = useColor("primary").soft
    return {
        background: "rgba(0, 0, 0, 0)",
        // The column beside the rows is xterm's overview ruler; it draws no border.
        overviewRulerBorder: "rgba(0, 0, 0, 0)",
        foreground: colors.foreground,
        cursor: colors.primary,
        cursorAccent: colors.background,
        selectionBackground: selection,
        black: muted,
        red: colors.danger,
        green: colors.success,
        yellow: colors.warning,
        blue: colors.secondary,
        magenta: colors.primary,
        cyan: colors.info,
        white: colors.foreground,
        brightBlack: muted,
        brightRed: colors.danger,
        brightGreen: colors.success,
        brightYellow: colors.warning,
        brightBlue: colors.secondary,
        brightMagenta: colors.primary,
        brightCyan: colors.info,
        brightWhite: colors.foreground
    }
}

/** Draws with WebGL where the browser offers it, and falls back to the default renderer if its context is lost. */
function loadWebgl(xterm: Terminal) {
    let webgl: WebglAddon | undefined
    try {
        webgl = new WebglAddon()
        webgl.onContextLoss(() => { webgl?.dispose(); webgl = undefined })
        xterm.loadAddon(webgl)
    }
    catch {
        webgl = undefined
    }
    return () => webgl?.dispose()
}

function messageOf(error: unknown) {
    return error instanceof Error ? error.message : "The terminal could not reach its session"
}
