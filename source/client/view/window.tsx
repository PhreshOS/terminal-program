import { folderAddress, folderOf } from "@client/core/opening"
import { ask, followSessions, type SessionEntry } from "@client/core/terminal-server"
import usePromise from "@libs/react-promise"
import { context, system } from "@phreshos/client"
import { useWindowState } from "@phreshos/react"
import { Button, Tabs, Window, useAppearance, useThemedValue } from "@phreshos/react-ui"
import { FolderOpen, Plus, Server, X } from "@phreshos/react-ui/icons"
import { useEffect, useRef, useState } from "react"
import icon from "@/icon.png"
import { useFirstArrival } from "./readiness"
import Screen from "./screen"

/**
 * Every tab asks for this width, as in a browser, whatever its title. The tabs share the room in equal
 * columns, so when they do not all fit, each narrows to its column, evenly, rather than overlapping.
 */
const tabWidth = { width: "10.5rem", maxWidth: "100%", justifyContent: "flex-start" }

/** The size a new session starts at, before its window fits it to the screen. */
const startingSize = { cols: 100, rows: 30 }

/**
 * The Terminal as a window. Its tabs are its own sessions: "+" starts one, closing a tab ends it, and
 * closing the window ends them all. A new window starts with a new session, and closing its last tab
 * closes it.
 */
export default function TerminalWindow({ window: me }: Readonly<{ window: string }>) {
    const initial = usePromise(() => ask<readonly SessionEntry[]>("sessions.list"), [])
    const [followed, setFollowed] = useState<readonly SessionEntry[] | null>(null)
    useEffect(() => followSessions(setFollowed), [])
    const sessions = followed ?? initial.solve ?? null

    const mine = sessions?.filter(session => session.window === me) ?? []
    const [chosen, setChosen] = useState<string | null>(null)
    const current = mine.find(session => session.session === chosen) ?? mine.at(-1) ?? null

    const start = usePromise(async (cwd?: string) => {
        const created = await ask<SessionEntry>("session.create", { window: me, ...startingSize, ...(cwd ? { cwd } : {}) })
        setChosen(created.session)
    })

    // A new window starts with a session of its own, in the folder it was opened for, if any: by its
    // options, or by a terminal: address it was opened with. Once it has had sessions, losing the last
    // closes it.
    const started = useRef(false)
    useEffect(() => {
        if (sessions === null) return
        if (mine.length > 0) { started.current = true; return }
        if (!started.current) {
            started.current = true
            void Promise.all([context.options("cwd"), context.opened()]).then(([cwd, opened]) => start.safeExecute(cwd ?? folderOf(opened)))
        }
        else void context.process().then(process => process.exit())
    }, [sessions, mine.length])

    const window = useWindowState(context.window)
    const toggleMaximize = async () => context.window.maximize(!await context.window.maximized())

    // The window's initial state is its sessions and the first screen drawn; a problem reaching the
    // Server is shown as it is. Screens drawn later, for another tab, appear in place.
    const [drawn, setDrawn] = useState(false)
    useFirstArrival(initial.exception !== undefined || (sessions !== null && drawn))

    if (initial.exception) return <div className="problem">
        <p>The Terminal could not reach its Server.</p>
        <Button onPress={() => initial.execute()}>Try again</Button>
    </div>
    if (sessions === null) return null

    return <div className="terminal-window">
        <Window.Header
            active={window?.front ?? true}
            beginMoveGesture={start => context.presentation.beginMoveGesture(start)}
            maximized={window?.maximized ?? false}
            onMaximize={() => void toggleMaximize()}
        >
            <Window.Header.Identity icon={icon} />
            {/* The center holds the controls only; the empty header around them still moves the window. */}
            <Window.Header.Center style={{ flex: "0 1 auto", gap: "0.25rem", minWidth: 0 }}>
                {mine.length > 0 && <Tabs value={current?.session} onChange={setChosen} size="small" style={{ minWidth: 0 }}>
                    <Tabs.List aria-label="Sessions">
                        {mine.map(session => <Tabs.Tab key={session.session} id={session.session} style={tabWidth}>
                            <span className="tab"><StateDot session={session} /><span className="tab-title">{session.title}</span>
                                <span role="button" aria-label={`End ${session.title}`} title="End this session" className="tab-close"
                                    onPointerDown={event => event.stopPropagation()} onClick={() => void ask("session.close", { session: session.session }).catch(() => undefined)}><X size={12} /></span>
                            </span>
                        </Tabs.Tab>)}
                    </Tabs.List>
                </Tabs>}
                <Button iconOnly depth="none" size="small" aria-label="New session" onPress={() => void start.safeExecute()}><Plus /></Button>
            </Window.Header.Center>
            <Window.Header.Actions>
                {/* The folder opens with whatever the owner opens folders with, such as Files. */}
                <Window.Header.Action iconOnly aria-label="Show the session's folder" disabled={!current}
                    onPress={() => current && void system.open({ type: "inode/directory", uri: folderAddress(current.cwd) }).catch(() => undefined)}><FolderOpen /></Window.Header.Action>
                <Window.Header.Minimize preventFocusOnPress={false} onPress={() => void context.window.minimize()} />
                <Window.Header.Maximize />
                <Window.Header.Close preventFocusOnPress={false} onPress={() => void context.process().then(process => process.exit())} />
            </Window.Header.Actions>
        </Window.Header>
        {current ? <Screen key={current.session} session={current.session} window={me} onDrawn={() => setDrawn(true)} /> : <div className="screen-empty" />}
        {current && <StatusLine session={current} />}
    </div>
}

/** What the current session is. */
function StatusLine({ session }: Readonly<{ session: SessionEntry }>) {
    return <div className="status-line">
        <span className="status-part"><Server size={13} />This machine</span>
        <span className="status-part">{session.shell.split("/").at(-1)} · {session.cols}×{session.rows}</span>
        <span className="status-spacer" />
        <span className="status-part">{session.state === "running" ? `running ${session.title}` : "ready"}</span>
    </div>
}

function StateDot({ session }: Readonly<{ session: SessionEntry }>) {
    const colors = useThemedValue(useAppearance().colors)
    return <span className="dot" style={{ background: session.state === "running" ? colors.success : colors.warning }} aria-label={session.state} />
}
