import Session, { type Output, type SessionDescription } from "./session"

/** A session and the window it belongs to. */
export type SessionEntry = SessionDescription & Readonly<{ window: string }>

/** What the sessions know of windows, from wherever windows live. */
export type Windows = Readonly<{
    /** Calls `ended` with each window that ends, from now on. */
    followEnds(ended: (window: string) => void): void
    /** Whether a window is still open. */
    exists(window: string): Promise<boolean>
    /** Closes a window. */
    close(window: string): Promise<void>
}>

export type SessionsEvent =
    | Readonly<{ type: "changed" }>
    | Readonly<{ type: "output", session: string, output: Output }>

/**
 * Every session on this machine. Each belongs to the window that started it and ends with it: whoever
 * wants a shell to keep running keeps its window open. A window begins with a session of its own, and
 * closes once its last one ends. Those are the window's, decided here once, however many Desktops
 * show it.
 */
export default class Sessions {
    private readonly sessions = new Map<string, Session>()
    private readonly windowOf = new Map<string, string>()
    /** The open windows that have had a session: losing their last one closes them. */
    private readonly begun = new Set<string>()
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

    /** A window began: it starts with a session of its own, once. */
    public async begin(window: string, options: Readonly<{ cols: number, rows: number, cwd?: string }>) {
        if (this.begun.has(window)) return
        await this.create(window, options)
    }

    /** Starts a session that belongs to a window. */
    public async create(window: string, options: Readonly<{ cols: number, rows: number, cwd?: string }>) {
        this.begun.add(window)
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

    /**
     * Moves a session to a place among its window's sessions, counted from 0; past the last, it goes
     * last. Every window and agent then lists them in that order.
     */
    public move(identity: string, index: number) {
        this.get(identity)
        const window = this.windowOf.get(identity)!
        const order = [...this.sessions.keys()]
        const mine = order.filter(other => this.windowOf.get(other) === window)
        // Only the order within its window counts: already at that place, nothing moves.
        if (mine.indexOf(identity) === Math.min(index, mine.length - 1)) return
        const others = order.filter(other => other !== identity)
        const theirs = mine.filter(other => other !== identity)
        // It goes before the one now at its new place, or after its window's last session.
        const before = theirs[index]
        const at = before !== undefined ? others.indexOf(before) : others.indexOf(theirs.at(-1)!) + 1
        const moved = [...others.slice(0, at), identity, ...others.slice(at)]
        const sessions = new Map(moved.map(other => [other, this.sessions.get(other)!]))
        this.sessions.clear()
        for (const [key, session] of sessions) this.sessions.set(key, session)
        this.emit({ type: "changed" })
    }

    /** A window ended: so do its sessions. */
    private windowEnded(window: string) {
        this.begun.delete(window)
        for (const [identity, owner] of this.windowOf) if (owner === window) this.sessions.get(identity)?.close()
    }

    private remove(identity: string) {
        const window = this.windowOf.get(identity)
        this.sessions.delete(identity)
        this.windowOf.delete(identity)
        this.emit({ type: "changed" })
        // Its last session ended while the window stays open: the window closes too.
        if (window === undefined || !this.begun.has(window) || [...this.windowOf.values()].includes(window)) return
        this.begun.delete(window)
        void this.windows.close(window).catch(() => undefined)
    }

    private entry(session: Session): SessionEntry {
        return Object.freeze({ ...session.description(), window: this.windowOf.get(session.identity)! })
    }

    private emit(event: SessionsEvent) {
        for (const listener of this.listeners) listener(event)
    }
}
