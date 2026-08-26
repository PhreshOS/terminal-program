import type {
  OutputChunk,
  SessionDescription,
  SessionSignal,
  SessionSnapshot
} from "@server/core/session"

const maximumTail = 512

export type TerminalUpdate =
  | Readonly<{ type: "snapshot", data: string }>
  | Readonly<{ type: "output", data: string }>
  | Readonly<{ type: "change" }>
  | Readonly<{ type: "failure", error: unknown }>

export type TerminalBoundary = Readonly<{
  snapshot(): Promise<SessionSnapshot>
  write(data: string): Promise<void>
  resize(cols: number, rows: number): Promise<void>
  signal(signal: SessionSignal): Promise<void>
  close(): Promise<void>
}>

export default class Session {
  private readonly listeners = new Set<(update: TerminalUpdate) => void>()
  private readonly tail: OutputChunk[] = []
  private state: SessionSnapshot
  private recovery: Promise<void> | null = null
  private removed = false

  public constructor(snapshot: SessionSnapshot, private readonly boundary: TerminalBoundary) {
    this.state = snapshot
  }

  public get identity() { return this.state.session.session }
  public get description(): SessionDescription { return this.state.session }
  public get isRemoved() { return this.removed }

  public subscribe(listener: (update: TerminalUpdate) => void) {
    this.listeners.add(listener)
    listener({ type: "snapshot", data: this.state.data })
    for (const chunk of this.tail) listener({ type: "output", data: chunk.data })
    return () => this.listeners.delete(listener)
  }

  public write(data: string) { return this.boundary.write(data) }
  public resize(cols: number, rows: number) { return this.boundary.resize(cols, rows) }
  public signal(signal: SessionSignal) { return this.boundary.signal(signal) }
  public close() { return this.boundary.close() }

  public synchronize(description: SessionDescription) {
    if (description.session !== this.identity || description.sequence < this.state.sequence) return
    this.state = { ...this.state, session: description }
    this.emit({ type: "change" })
  }

  public receive(chunk: OutputChunk) {
    if (this.removed || chunk.sequence <= this.state.sequence) return
    if (this.recovery || chunk.sequence !== this.state.sequence + 1) {
      this.tail.push(chunk)
      this.trimTail()
      this.recover()
      return
    }

    this.state = { ...this.state, sequence: chunk.sequence }
    this.tail.push(chunk)
    this.trimTail()
    this.emit({ type: "output", data: chunk.data })
  }

  public remove() {
    if (this.removed) return
    this.removed = true
    this.emit({ type: "change" })
  }

  private recover() {
    if (this.recovery || this.removed) return
    let succeeded = false
    const recovery = this.boundary.snapshot().then(snapshot => {
      if (this.removed) return
      succeeded = true
      this.state = snapshot
      const pending = this.tail.filter(chunk => chunk.sequence > snapshot.sequence)
      this.tail.splice(0, this.tail.length, ...pending)
      this.emit({ type: "snapshot", data: snapshot.data })

      for (const chunk of [...pending]) {
        if (chunk.sequence !== this.state.sequence + 1) continue
        this.state = { ...this.state, sequence: chunk.sequence }
        this.emit({ type: "output", data: chunk.data })
      }
    }).catch(error => {
      this.emit({ type: "failure", error })
    }).finally(() => {
      if (this.recovery === recovery) this.recovery = null
      const first = this.tail.find(chunk => chunk.sequence > this.state.sequence)
      if (succeeded && first && first.sequence !== this.state.sequence + 1) this.recover()
    })
    this.recovery = recovery
  }

  private trimTail() {
    if (this.tail.length <= maximumTail) return
    this.tail.splice(0, this.tail.length - maximumTail)
    this.recover()
  }

  private emit(update: TerminalUpdate) {
    for (const listener of this.listeners) listener(update)
  }
}
