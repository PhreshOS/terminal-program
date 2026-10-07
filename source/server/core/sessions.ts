import Session, { type Output, type SessionDescription } from "./session"

/** A session and the window it belongs to. */
export type SessionEntry = SessionDescription & Readonly<{ window: string }>

/** What the sessions know of windows, from wherever windows live. */
export type Windows = Readonly<{
    /** Calls `ended` with each window that ends, from now on. */
    followEnds(ended: (window: string) => void): void
    /** Whether a window is still open. */
    exists(window: string): Promise<boolean>
}>

export type SessionsEvent =
    | Readonly<{ type: "changed" }>
    | Readonly<{ type: "output", session: string, output: Output }>

/**
 * Every session on this machine. Each belongs to the window that started it and ends with it: whoever
 * wants a shell to keep running keeps its window open.
 */
export default class Sessions {
    private readonly sessions = new Map<string, Session>()
    private readonly windowOf = new Map<string, string>()
    private readonly listeners = new Set<(event: SessionsEvent) => void>()

    public constructor(private readonly windows: Windows) {
        windows.followEnds(window => this.windowEnded(window))
    }

    public subscribe(listener: (event: SessionsEvent) => void) {
        this.listeners.add(listener)
        return () => { this.listeners.delete(listener) }
    }

    public list(): readonly SessionEntry[] {
        return [...this.sessions.values()].map(session => this.entry(session))
    }

    /** Starts a session that belongs to a window. */
    public async create(window: string, options: Readonly<{ cols: number, rows: number, cwd?: string }>) {
        const session = new Session(options)
        this.sessions.set(session.identity, session)
        this.windowOf.set(session.identity, window)
        session.subscribe(event => {
            if (event.type === "output") this.emit({ type: "output", session: session.identity, output: event.output })
            else if (event.type === "exit") this.remove(session.identity)
            else this.emit({ type: "changed" })
        })
        const entry = this.entry(session)
        // A window that ended before its session reached it takes the session with it.
        if (!await this.windows.exists(window)) this.windowEnded(window)
        else this.emit({ type: "changed" })
        return entry
    }

    public get(identity: string) {
        const session = this.sessions.get(identity)
        if (!session) throw new Error("This session has ended, or never existed")
        return session
    }

    public close(identity: string) {
        this.get(identity).close()
    }

    /** A window ended: so do its sessions. */
    private windowEnded(window: string) {
        for (const [identity, owner] of this.windowOf) if (owner === window) this.sessions.get(identity)?.close()
    }

    private remove(identity: string) {
        this.sessions.delete(identity)
        this.windowOf.delete(identity)
        this.emit({ type: "changed" })
    }

    private entry(session: Session): SessionEntry {
        return Object.freeze({ ...session.description(), window: this.windowOf.get(session.identity)! })
    }

    private emit(event: SessionsEvent) {
        for (const listener of this.listeners) listener(event)
    }
}
