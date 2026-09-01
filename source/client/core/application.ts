import { context } from "@phreshos/client"
import type { Server } from "@phreshos/client"
import type { TerminalEvents } from "@server/core/application"
import type { OutputChunk, SessionDescription, SessionSignal, SessionSnapshot } from "@server/core/session"
import { terminalServerName, terminalSessionOption } from "@server/core/terminal"
import Session from "./session"

type Acknowledgment = Readonly<{ accepted: true }>
type TerminalOutput = OutputChunk & Readonly<{ session: string }>
type ChangeWaiter = Readonly<{
  resolve(description: SessionDescription): void
  reject(error: unknown): void
  timer: ReturnType<typeof setTimeout>
}>

function terminalServer(server: Server): Server<TerminalEvents> {
  return server as unknown as Server<TerminalEvents>
}

export default class Application {
  private readonly cleanups: Array<() => void> = []
  private readonly pending = new Map<string, TerminalOutput[]>()
  private readonly changeWaiters = new Map<string, ChangeWaiter>()
  private server: Server<TerminalEvents> | null = null
  private terminal: Session | null = null
  private target: string | null = null
  private opening: Promise<Session> | null = null
  private disposed = false

  public start() {
    if (this.disposed) throw new Error("The Terminal Client application is closed")
    if (this.terminal) return Promise.resolve(this.terminal)
    if (this.opening) return this.opening

    const opening = this.open().catch(error => {
      this.disconnect()
      throw error
    }).finally(() => {
      if (this.opening === opening) this.opening = null
    })
    this.opening = opening
    return opening
  }

  public dispose() {
    if (this.disposed) return
    this.disposed = true
    this.disconnect()
  }

  private async open() {
    const program = await context.program()
    const process = await program.process.findOrCreate({
      name: terminalServerName,
      server: true,
      client: false
    })
    const server = terminalServer(process.server)
    this.server = server
    this.cleanups.push(
      server.subscribe("session.changed", value => this.changed(value)),
      server.subscribe("session.removed", value => this.removed(value)),
      server.subscribe("terminal.output", value => this.output(value))
    )
    await server.waitReady(30_000)

    const assigned = await context.option(terminalSessionOption)
    const identity = assigned ? await this.attach(server, assigned) : await this.create(server)

    this.target = identity
    const snapshot = await this.snapshot(identity)
    if (this.disposed) throw new Error("The Terminal Client application closed while connecting")
    const terminal = new Session(snapshot, this.boundary(identity))
    this.terminal = terminal
    for (const chunk of this.pending.get(identity) ?? []) terminal.receive(chunk)
    this.pending.delete(identity)
    return terminal
  }

  private async attach(server: Server<TerminalEvents>, session: string) {
    const acknowledgment = await server.ask<Acknowledgment>("session.attach", { session })
    this.assertAcknowledgment(acknowledgment)
    return session
  }

  private async create(server: Server<TerminalEvents>) {
    const request = crypto.randomUUID()
    const publication = this.waitForChange(request)
    const command = server.ask<Acknowledgment>("session.create", {
      request,
      lifecycle: "client",
      cols: 80,
      rows: 24
    }).then(acknowledgment => this.assertAcknowledgment(acknowledgment))

    try {
      return (await Promise.race([publication, command.then(() => publication)])).session
    } catch (error) {
      this.rejectChange(request, error)
      throw error
    }
  }

  private boundary(session: string) {
    return {
      snapshot: () => this.snapshot(session),
      write: async (data: string) => { await this.ask("session.write", { session, data }) },
      resize: async (cols: number, rows: number) => { await this.ask("session.resize", { session, cols, rows }) },
      signal: async (signal: SessionSignal) => { await this.ask("session.signal", { session, signal }) },
      close: async () => { await this.ask("session.close", { session }) }
    }
  }

  private snapshot(session: string) {
    return this.ask<SessionSnapshot>("session.snapshot", { session })
  }

  private ask<Answer = Acknowledgment>(event: string, payload: unknown) {
    if (!this.server) throw new Error("The Terminal Server is not connected")
    return this.server.ask<Answer>(event, payload)
  }

  private changed(value: unknown) {
    const change = value as { session?: Partial<SessionDescription>, request?: unknown } | null
    const description = change?.session
    if (!description) return
    if (typeof description.session !== "string") return
    if (typeof change.request === "string") this.resolveChange(change.request, description as SessionDescription)
    if (this.terminal?.identity === description.session) this.terminal.synchronize(description as SessionDescription)
  }

  private removed(value: unknown) {
    const session = (value as { session?: unknown } | null)?.session
    if (typeof session !== "string") return
    this.pending.delete(session)
    if (this.terminal?.identity === session) this.terminal.remove()
  }

  private output(value: unknown) {
    const output = value as Partial<TerminalOutput>
    if (typeof output.session !== "string" || typeof output.sequence !== "number" || typeof output.data !== "string") return
    if (this.terminal?.identity === output.session) {
      this.terminal.receive(output as TerminalOutput)
      return
    }
    if (this.terminal || this.target !== output.session) return

    const pending = this.pending.get(output.session) ?? []
    pending.push(output as TerminalOutput)
    if (pending.length > 512) pending.splice(0, pending.length - 512)
    this.pending.set(output.session, pending)
  }

  private disconnect() {
    for (const cleanup of this.cleanups.splice(0)) cleanup()
    this.pending.clear()
    this.terminal = null
    this.target = null
    this.server = null
    for (const request of [...this.changeWaiters.keys()]) {
      this.rejectChange(request, new Error("The Terminal Server connection closed"))
    }
  }

  private waitForChange(request: string) {
    return new Promise<SessionDescription>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.changeWaiters.delete(request)
        reject(new Error("The Terminal Server did not publish the created session in time"))
      }, 10_000)
      this.changeWaiters.set(request, { resolve, reject, timer })
    })
  }

  private resolveChange(request: string, description: SessionDescription) {
    const waiter = this.changeWaiters.get(request)
    if (!waiter) return
    clearTimeout(waiter.timer)
    this.changeWaiters.delete(request)
    waiter.resolve(description)
  }

  private rejectChange(request: string, error: unknown) {
    const waiter = this.changeWaiters.get(request)
    if (!waiter) return
    clearTimeout(waiter.timer)
    this.changeWaiters.delete(request)
    waiter.reject(error)
  }

  private assertAcknowledgment(value: Acknowledgment) {
    if (value?.accepted !== true) throw new Error("The Terminal Server returned an invalid acknowledgment")
  }
}
