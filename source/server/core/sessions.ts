import Session, { type Output, type SessionDescription } from "./session"

/** Where a session is shown: the window it is attached to, or none while it runs detached. */
export type SessionEntry = SessionDescription & Readonly<{ window: string | null }>

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
 * Every session on this machine. A session belongs here, not to a window: a window shows the
 * sessions attached to it, and when it ends they keep running, detached, until a window takes them
 * again or they are ended.
 */
export default class Sessions {
    private readonly sessions = new Map<string, Session>()
    private readonly attached = new Map<string, string | null>()
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

    /** Starts a session attached to a window. */
    public async create(window: string, options: Readonly<{ cols: number, rows: number, cwd?: string }>) {
        const session = new Session(options)
        this.sessions.set(session.identity, session)
        this.attached.set(session.identity, window)
        session.subscribe(event => {
            if (event.type === "output") this.emit({ type: "output", session: session.identity, output: event.output })
            else if (event.type === "exit") this.remove(session.identity)
            else this.emit({ type: "changed" })
        })
        await this.settle(window)
        this.emit({ type: "changed" })
        return this.entry(session)
    }

    /** Shows a session in a window; it leaves whichever window showed it before. */
    public async attach(identity: string, window: string) {
        const session = this.get(identity)
        const before = this.attached.get(identity)
        if (before && before !== window) session.unwatch(before)
        this.attached.set(identity, window)
        await this.settle(window)
        this.emit({ type: "changed" })
        return this.entry(session)
    }

    /** The session keeps running with no window showing it. */
    public detach(identity: string) {
        this.get(identity).unwatch(this.attached.get(identity) ?? "")
        this.attached.set(identity, null)
        this.emit({ type: "changed" })
    }

    public get(identity: string) {
        const session = this.sessions.get(identity)
        if (!session) throw new Error("This session has ended, or never existed")
        return session
    }

    public close(identity: string) {
        this.get(identity).close()
    }

    /** A window ended: its sessions run on, detached. */
    private windowEnded(window: string) {
        let changed = false
        for (const [identity, shown] of this.attached) {
            if (shown !== window) continue
            this.sessions.get(identity)?.unwatch(window)
            this.attached.set(identity, null)
            changed = true
        }
        if (changed) this.emit({ type: "changed" })
    }

    /** A window that ended before its session reached it leaves the session detached at once. */
    private async settle(window: string) {
        if (!await this.windows.exists(window)) this.windowEnded(window)
    }

    private remove(identity: string) {
        this.sessions.delete(identity)
        this.attached.delete(identity)
        this.emit({ type: "changed" })
    }

    private entry(session: Session): SessionEntry {
        return Object.freeze({ ...session.description(), window: this.attached.get(session.identity) ?? null })
    }

    private emit(event: SessionsEvent) {
        for (const listener of this.listeners) listener(event)
    }
}
