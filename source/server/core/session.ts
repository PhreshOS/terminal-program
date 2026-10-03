import { SerializeAddon } from "@xterm/addon-serialize"
import { Terminal, type ITerminalAddon } from "@xterm/headless"
import type { IPty } from "node-pty"
import * as pty from "node-pty"
import { randomUUID } from "node:crypto"
import { homedir } from "node:os"
import { basename } from "node:path"

/** How many lines above the screen each session keeps. */
export const scrollback = 10_000

/** Output waits this long to travel with what follows it, so a burst goes as one message. */
const batchDelay = 16

/** A batch this large goes at once, without waiting. */
const batchLimit = 64 * 1024

/** How much recent output a session keeps for those who read it in parts, such as agents. */
const keptOutput = 2 * 1024 * 1024

/**
 * A watcher that has this many characters of output not yet acknowledged pauses the shell; it
 * resumes once the watcher has caught up to the lower mark. Heavy output then waits for the screen
 * instead of piling up between them.
 */
const pauseAbove = 4 * 1024 * 1024
const resumeBelow = 1024 * 1024

/** How often the session looks at what runs in front, for its title and state. */
const noticeEvery = 500

/** A watcher that acknowledges nothing for this long is dropped, so a lost window never holds the shell. */
const watcherTimeout = 10_000

export type SessionState = "running" | "idle"

export type SessionDescription = Readonly<{
    session: string
    title: string
    shell: string
    cwd: string
    cols: number
    rows: number
    state: SessionState
    createdAt: string
}>

export type Output = Readonly<{ sequence: number, data: string }>

export type Snapshot = Readonly<{ sequence: number, cols: number, rows: number, data: string }>

export type SessionEvent =
    | Readonly<{ type: "output", output: Output }>
    | Readonly<{ type: "change" }>
    | Readonly<{ type: "exit" }>

type Watcher = { sent: number, acknowledged: number, heard: number }

/**
 * One shell on this machine, running in a pseudo-terminal. A headless terminal keeps its screen
 * exactly, so whoever comes to it later gets the screen as it is. Its output leaves in batches,
 * numbered in order, and the shell waits while a watcher lags far behind.
 */
export default class Session {
    public readonly identity = randomUUID()
    public readonly shell: string
    public readonly cwd: string
    public readonly createdAt = new Date()
    private readonly pty: IPty
    private readonly screen: Terminal
    private readonly serializer = new SerializeAddon()
    private readonly listeners = new Set<(event: SessionEvent) => void>()
    private readonly kept: Array<Output & { bytes: number }> = []
    private readonly watchers = new Map<string, Watcher>()
    private keptBytes = 0
    private sequence = 0
    private pending = ""
    private flushTimer: ReturnType<typeof setTimeout> | undefined
    private noticed = 0
    private noticeTimer: ReturnType<typeof setTimeout> | undefined
    private paused = false
    private title: string
    private state: SessionState = "idle"
    private ended = false
    private written = Promise.resolve()

    public constructor(options: Readonly<{ cols: number, rows: number, cwd?: string, shell?: string }>) {
        this.shell = options.shell ?? defaultShell()
        this.cwd = options.cwd ?? homedir()
        this.title = basename(this.shell)
        this.screen = new Terminal({ cols: options.cols, rows: options.rows, scrollback, allowProposedApi: true })
        this.screen.loadAddon(this.serializer as unknown as ITerminalAddon)
        this.pty = pty.spawn(this.shell, process.platform === "win32" ? [] : ["-l"], {
            name: "xterm-256color",
            cols: options.cols,
            rows: options.rows,
            cwd: this.cwd,
            env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" },
            encoding: "utf8"
        })
        this.pty.onData(data => this.receive(data))
        this.pty.onExit(() => this.end())
    }

    public subscribe(listener: (event: SessionEvent) => void) {
        this.listeners.add(listener)
        return () => { this.listeners.delete(listener) }
    }

    public get running() { return !this.ended }

    public description(): SessionDescription {
        return Object.freeze({
            session: this.identity,
            title: this.title,
            shell: this.shell,
            cwd: this.cwd,
            cols: this.pty.cols,
            rows: this.pty.rows,
            state: this.state,
            createdAt: this.createdAt.toISOString()
        })
    }

    public write(data: string) {
        this.alive()
        this.pty.write(data)
    }

    public resize(cols: number, rows: number) {
        this.alive()
        if (cols === this.pty.cols && rows === this.pty.rows) return
        this.flush()
        this.screen.resize(cols, rows)
        this.pty.resize(cols, rows)
        this.emit({ type: "change" })
    }

    /** The screen as it is, with the number of the last output it includes. */
    public async snapshot(): Promise<Snapshot> {
        this.alive()
        this.flush()
        await this.written
        return Object.freeze({ sequence: this.sequence, cols: this.pty.cols, rows: this.pty.rows, data: this.serializer.serialize({ scrollback }) })
    }

    /** The screen as plain text, for whoever reads it rather than shows it. */
    public async text() {
        this.alive()
        this.flush()
        await this.written
        const buffer = this.screen.buffer.active
        const lines: string[] = []
        for (let index = 0; index < buffer.length; index++) lines.push(buffer.getLine(index)?.translateToString(true) ?? "")
        return lines.join("\n").replace(/\n+$/, "")
    }

    /** The output after a number, as far as it is kept, in parts of at most `limit` batches. */
    public read(after: number, limit: number) {
        this.alive()
        this.flush()
        const available = this.kept.filter(output => output.sequence > after)
        const first = this.kept[0]?.sequence
        return Object.freeze({
            output: available.slice(0, limit).map(({ sequence, data }) => ({ sequence, data })),
            truncated: first !== undefined && after < first - 1,
            more: available.length > limit
        })
    }

    /** A window starts showing this session; from now on, what it shows counts toward its lag. */
    public watch(watcher: string) {
        this.watchers.set(watcher, { sent: 0, acknowledged: 0, heard: Date.now() })
    }

    public unwatch(watcher: string) {
        this.watchers.delete(watcher)
        this.regulate()
    }

    /** A watcher has drawn this many characters in all since it began watching. */
    public acknowledge(watcher: string, characters: number) {
        const current = this.watchers.get(watcher)
        if (!current) return
        current.acknowledged = Math.max(current.acknowledged, characters)
        current.heard = Date.now()
        this.regulate()
    }

    public close() {
        if (this.ended) return
        this.pty.kill()
        this.end()
    }

    private receive(data: string) {
        if (this.ended) return
        this.pending += data
        if (this.pending.length >= batchLimit) this.flush()
        else this.flushTimer ??= setTimeout(() => this.flush(), batchDelay)
    }

    /** Sends what is waiting as one numbered batch, and writes it to the kept screen. */
    private flush() {
        clearTimeout(this.flushTimer)
        this.flushTimer = undefined
        if (!this.pending) return
        const data = this.pending
        this.pending = ""
        const output = { sequence: ++this.sequence, data }
        const bytes = Buffer.byteLength(data)
        this.kept.push({ ...output, bytes })
        this.keptBytes += bytes
        while (this.keptBytes > keptOutput && this.kept.length > 1) this.keptBytes -= this.kept.shift()!.bytes
        this.written = this.written.then(() => new Promise<void>(resolve => this.screen.write(data, resolve)))
        for (const watcher of this.watchers.values()) watcher.sent += data.length
        this.emit({ type: "output", output: Object.freeze(output) })
        this.regulate()
        // Looked at most every half second; a look put off is taken when the half second is up, so a
        // command that just ended shows as ended even when nothing follows its last output.
        const wait = noticeEvery - (Date.now() - this.noticed)
        if (wait <= 0) this.notice()
        else this.noticeTimer ??= setTimeout(() => { this.noticeTimer = undefined; if (!this.ended) this.notice() }, wait)
    }

    /** Pauses the shell while any watcher lags too far behind, and lets it go once all have caught up. */
    private regulate() {
        const now = Date.now()
        for (const [name, watcher] of this.watchers) if (now - watcher.heard > watcherTimeout && watcher.sent > watcher.acknowledged) this.watchers.delete(name)
        const lag = Math.max(0, ...[...this.watchers.values()].map(watcher => watcher.sent - watcher.acknowledged))
        if (!this.paused && lag > pauseAbove) { this.paused = true; this.pty.pause() }
        else if (this.paused && lag < resumeBelow) { this.paused = false; this.pty.resume() }
    }

    /** What runs in front now: the shell itself while it waits, or the command it runs. */
    private notice() {
        this.noticed = Date.now()
        let title = this.title
        try { title = basename(this.pty.process || this.shell) } catch { /* the process may be gone */ }
        const state: SessionState = title === basename(this.shell) ? "idle" : "running"
        if (title === this.title && state === this.state) return
        this.title = title
        this.state = state
        this.emit({ type: "change" })
    }

    private end() {
        if (this.ended) return
        this.flush()
        clearTimeout(this.noticeTimer)
        this.ended = true
        if (this.paused) this.pty.resume()
        this.watchers.clear()
        this.emit({ type: "exit" })
        this.listeners.clear()
        this.screen.dispose()
    }

    private alive() {
        if (this.ended) throw new Error("This session has ended")
    }

    private emit(event: SessionEvent) {
        for (const listener of this.listeners) listener(event)
    }
}

function defaultShell() {
    if (process.platform === "win32") return process.env.COMSPEC || "powershell.exe"
    return process.env.SHELL || "/bin/sh"
}
