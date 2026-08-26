import { SerializeAddon } from "@xterm/addon-serialize"
import { Terminal, type ITerminalAddon } from "@xterm/headless"
import type { IPty } from "node-pty"
import * as pty from "node-pty"
import { homedir } from "node:os"
import { randomUUID } from "node:crypto"

export const terminalScrollback = 10_000
const maximumBufferedBytes = 1024 * 1024

export type SessionLifecycle = "client" | "explicit"
export type SessionSignal = "SIGINT" | "SIGTERM" | "SIGHUP" | "SIGKILL"

export type SessionDescription = Readonly<{
  session: string
  lifecycle: SessionLifecycle
  client: string | null
  status: "running"
  shell: string
  cwd: string
  cols: number
  rows: number
  process: number
  sequence: number
  createdAt: string
}>

export type OutputChunk = Readonly<{
  sequence: number
  data: string
}>

export type SessionSnapshot = Readonly<{
  session: SessionDescription
  sequence: number
  cols: number
  rows: number
  data: string
}>

export type SessionRead = Readonly<{
  session: SessionDescription
  output: readonly OutputChunk[]
  truncated: boolean
  hasMore: boolean
}>

export type SessionOptions = Readonly<{
  lifecycle: SessionLifecycle
  owner?: string
  shell?: string
  cwd?: string
  cols: number
  rows: number
}>

export type SessionEvent =
  | Readonly<{ type: "change", session: SessionDescription }>
  | Readonly<{ type: "output", session: string, sequence: number, data: string }>
  | Readonly<{ type: "exit", session: string }>

export default class Session {
  public readonly identity = randomUUID()
  public readonly lifecycle: SessionLifecycle
  public readonly owner: string | undefined
  public readonly createdAt = new Date()
  public readonly shell: string
  public readonly cwd: string
  private readonly terminal: Terminal
  private readonly serializer = new SerializeAddon()
  private readonly pty: IPty
  private readonly output: Array<OutputChunk & { bytes: number }> = []
  private readonly listeners = new Set<(event: SessionEvent) => void>()
  private bufferedBytes = 0
  private sequence = 0
  private rendered = Promise.resolve()
  private closed = false

  public constructor(options: SessionOptions) {
    this.lifecycle = options.lifecycle
    this.owner = options.owner
    this.shell = options.shell ?? defaultShell()
    this.cwd = options.cwd ?? homedir()

    this.terminal = new Terminal({
      cols: options.cols,
      rows: options.rows,
      scrollback: terminalScrollback,
      allowProposedApi: true
    })
    this.terminal.loadAddon(this.serializer as unknown as ITerminalAddon)
    this.pty = pty.spawn(this.shell, [], {
      name: "xterm-256color",
      cols: options.cols,
      rows: options.rows,
      cwd: this.cwd,
      env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" },
      encoding: "utf8"
    })

    this.pty.onData(data => this.receive(data))
    this.pty.onExit(() => this.exit())
  }

  public subscribe(listener: (event: SessionEvent) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  public description(): SessionDescription {
    return Object.freeze({
      session: this.identity,
      lifecycle: this.lifecycle,
      client: this.lifecycle === "client" ? this.owner ?? null : null,
      status: "running",
      shell: this.shell,
      cwd: this.cwd,
      cols: this.pty.cols,
      rows: this.pty.rows,
      process: this.pty.pid,
      sequence: this.sequence,
      createdAt: this.createdAt.toISOString()
    })
  }

  public write(data: string) {
    this.open()
    this.pty.write(data)
  }

  public resize(cols: number, rows: number) {
    this.open()
    if (cols === this.pty.cols && rows === this.pty.rows) return
    this.terminal.resize(cols, rows)
    this.pty.resize(cols, rows)
    this.emit({ type: "change", session: this.description() })
  }

  public signal(signal: SessionSignal) {
    this.open()
    this.pty.kill(signal)
  }

  public close() {
    if (this.closed) return
    this.closed = true
    this.pty.kill()
    this.dispose()
  }

  public async snapshot(): Promise<SessionSnapshot> {
    this.open()
    await this.rendered
    return Object.freeze({
      session: this.description(),
      sequence: this.sequence,
      cols: this.pty.cols,
      rows: this.pty.rows,
      data: this.serializer.serialize({ scrollback: terminalScrollback })
    })
  }

  public read(after: number, limit: number): SessionRead {
    this.open()
    const available = this.output.filter(chunk => chunk.sequence > after)
    const output = available.slice(0, limit).map(({ sequence, data }) => ({ sequence, data }))
    const first = this.output[0]?.sequence
    return Object.freeze({
      session: this.description(),
      output,
      truncated: first !== undefined && after < first - 1,
      hasMore: available.length > output.length
    })
  }

  private receive(data: string) {
    if (this.closed) return
    const sequence = ++this.sequence
    const bytes = Buffer.byteLength(data)
    this.output.push({ sequence, data, bytes })
    this.bufferedBytes += bytes

    while (this.bufferedBytes > maximumBufferedBytes && this.output.length > 1) {
      const removed = this.output.shift()
      if (removed) this.bufferedBytes -= removed.bytes
    }

    this.rendered = this.rendered.then(() => new Promise<void>(resolve => this.terminal.write(data, resolve)))
    this.emit({ type: "output", session: this.identity, sequence, data })
  }

  private exit() {
    if (this.closed) return
    this.closed = true
    this.dispose()
    this.emit({ type: "exit", session: this.identity })
  }

  private dispose() {
    this.serializer.dispose()
    this.terminal.dispose()
  }

  private emit(event: SessionEvent) {
    for (const listener of this.listeners) listener(event)
  }

  private open() {
    if (this.closed) throw new Error(`Terminal session "${this.identity}" is closed`)
  }

}

function defaultShell() {
  if (process.env.SHELL) return process.env.SHELL
  return process.platform === "win32" ? "powershell.exe" : "/bin/sh"
}
