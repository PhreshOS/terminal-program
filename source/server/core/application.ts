import Session, {
  type OutputChunk,
  type SessionDescription,
  type SessionLifecycle,
  type SessionOptions,
  type SessionRead,
  type SessionSignal,
  type SessionSnapshot
} from "./session"

const maximumSessions = 64

export type ApplicationEvent =
  | Readonly<{ type: "session.changed", payload: SessionChange }>
  | Readonly<{ type: "session.removed", payload: Readonly<{ session: string, client: string | null }> }>
  | Readonly<{ type: "terminal.output", payload: OutputChunk & Readonly<{ session: string }> }>

export type SessionPage = Readonly<{
  sessions: readonly SessionDescription[]
  nextCursor: string | null
}>

export type SessionChange = Readonly<{
  session: SessionDescription
  request?: string
}>

export default class Application {
  private readonly sessions = new Map<string, Session>()
  private readonly cleanups = new Map<string, () => void>()
  private readonly listeners = new Set<(event: ApplicationEvent) => void>()

  public subscribe(listener: (event: ApplicationEvent) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  public create(options: SessionOptions, request?: string) {
    if (options.lifecycle === "client" && !options.owner) throw new Error("A client session requires a Client owner")

    if (options.lifecycle === "client") {
      const existing = [...this.sessions.values()].find(session => (
        session.lifecycle === "client" && session.owner === options.owner
      ))
      if (existing) {
        this.changed(existing.description(), request)
        return existing
      }
    }

    if (this.sessions.size >= maximumSessions) throw new Error(`Terminal supports at most ${maximumSessions} live sessions`)

    const session = new Session(options)
    this.sessions.set(session.identity, session)
    this.cleanups.set(session.identity, session.subscribe(event => {
      if (event.type === "change") this.changed(event.session)
      if (event.type === "output") this.emit({
        type: "terminal.output",
        payload: { session: event.session, sequence: event.sequence, data: event.data }
      })
      if (event.type === "exit") this.remove(event.session, false)
    }))
    this.changed(session.description(), request)
    return session
  }

  public attach(sessionIdentity: string, owner: string) {
    const session = this.session(sessionIdentity)
    if (session.lifecycle === "client" && session.owner !== owner) {
      throw new Error("A client terminal session belongs to another Client")
    }
    this.changed(session.description())
    return session
  }

  public list(options: {
    limit: number
    cursor?: string
    lifecycle?: SessionLifecycle
    client?: string
  }): SessionPage {
    let sessions = [...this.sessions.values()]
      .filter(session => !options.lifecycle || session.lifecycle === options.lifecycle)
      .filter(session => !options.client || (session.lifecycle === "client" && session.owner === options.client))
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || right.identity.localeCompare(left.identity))

    if (options.cursor) {
      const index = sessions.findIndex(session => cursor(session) === options.cursor)
      sessions = index < 0 ? [] : sessions.slice(index + 1)
    }

    const page = sessions.slice(0, options.limit)
    return Object.freeze({
      sessions: page.map(session => session.description()),
      nextCursor: sessions.length > page.length && page.length ? cursor(page[page.length - 1]) : null
    })
  }

  public read(session: string, after: number, limit: number): SessionRead {
    return this.session(session).read(after, limit)
  }

  public snapshot(session: string): Promise<SessionSnapshot> {
    return this.session(session).snapshot()
  }

  public write(session: string, data: string) {
    this.session(session).write(data)
  }

  public resize(session: string, cols: number, rows: number) {
    this.session(session).resize(cols, rows)
  }

  public signal(session: string, signal: SessionSignal) {
    this.session(session).signal(signal)
  }

  public close(session: string) {
    this.remove(session, true)
  }

  public releaseOwner(owner: string) {
    for (const session of [...this.sessions.values()]) {
      if (session.lifecycle === "client" && session.owner === owner) this.remove(session.identity, true)
    }
  }

  public dispose() {
    for (const session of [...this.sessions.keys()]) this.remove(session, true)
    this.listeners.clear()
  }

  private session(identity: string) {
    const session = this.sessions.get(identity)
    if (!session) throw new Error(`Unknown terminal session "${identity}"`)
    return session
  }

  private remove(identity: string, close: boolean) {
    const session = this.sessions.get(identity)
    if (!session) return
    const client = session.description().client
    this.sessions.delete(identity)
    this.cleanups.get(identity)?.()
    this.cleanups.delete(identity)
    if (close) session.close()
    this.emit({ type: "session.removed", payload: { session: identity, client } })
  }

  private emit(event: ApplicationEvent) {
    for (const listener of this.listeners) listener(event)
  }

  private changed(session: SessionDescription, request?: string) {
    this.emit({ type: "session.changed", payload: { session, ...request && { request } } })
  }
}

function cursor(session: Session) {
  return `${session.createdAt.toISOString()}:${session.identity}`
}
