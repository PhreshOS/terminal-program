import { folderAddress } from "@shared/opening"
import { ask, followSessions, type SessionEntry } from "@client/core/terminal-server"
import { openOver } from "@client/core/over"
import usePromise from "@libs/react-promise"
import { context } from "@phreshos/client"
import { usePresentationState, useWindowState } from "@phreshos/react"
import { Button, DocumentTabs, Window, useAppearance, useThemedValue } from "@phreshos/react-ui"
import { FolderOpen, Server } from "@phreshos/react-ui/icons"
import { useEffect, useState } from "react"
import icon from "@/icon.png"
import { useFirstArrival } from "./readiness"
import Screen from "./screen"

/** The size a new session starts at, before its window fits it to the screen. */
const startingSize = { cols: 100, rows: 30 }

/** Where a window remembers the tab shown last, on whichever Desktop showed it. */
const shownTab = "tab.shown"

/**
 * The Terminal as a window. Its tabs are its own sessions: "+" starts one, closing a tab ends it, and
 * closing the window ends them all. The Terminal Server starts a new window's first session and closes
 * the window with its last, once for every Desktop that shows it. Their order is the Server's, so every
 * window and agent sees the order they are moved to.
 */
export default function TerminalWindow({ window: me }: Readonly<{ window: string }>) {
    const initial = usePromise(() => ask<readonly SessionEntry[]>("sessions.list"), [])
    const [followed, setFollowed] = useState<readonly SessionEntry[] | null>(null)
    useEffect(() => followSessions(setFollowed), [])
    const sessions = followed ?? initial.solve ?? null

    const mine = sessions?.filter(session => session.window === me) ?? []
    const [chosen, setChosen] = useState<string | null>(null)
    // Which tab is shown is each Desktop's own, and is not followed between them. The last one shown
    // anywhere is remembered in this window's memory, so the window, loaded again, starts on it.
    const [remembered, setRemembered] = useState<string | null | undefined>(undefined)
    useEffect(() => { void context.memory.get<string>(shownTab).then(shown => setRemembered(shown ?? null), () => setRemembered(null)) }, [])
    const current = mine.find(session => session.session === (chosen ?? remembered)) ?? mine.at(-1) ?? null
    // Written only once read, so a window loading does not overwrite what it is about to start from.
    useEffect(() => {
        if (current && remembered !== undefined) void context.memory.set(shownTab, current.session).catch(() => undefined)
    }, [current?.session, remembered])

    const start = usePromise(async () => {
        const created = await ask<SessionEntry>("session.create", { window: me, ...startingSize })
        setChosen(created.session)
    })

    const window = useWindowState(context.window)
    // Focused as the Desktop showing it decides; it may focus another Window than the System's front one.
    const drawing = usePresentationState(context.presentation)
    const toggleMaximize = async () => context.window.maximize(!await context.window.maximized())

    // The window's initial state is its sessions and the first screen drawn; a problem reaching the
    // Server is shown as it is. Screens drawn later, for another tab, appear in place.
    const [drawn, setDrawn] = useState(false)
    useFirstArrival(initial.exception !== undefined || (sessions !== null && remembered !== undefined && drawn))

    if (initial.exception) return <div className="problem">
        <p>The Terminal could not reach its Server.</p>
        <Button onPress={() => initial.execute()}>Try again</Button>
    </div>
    if (sessions === null) return null

    return <div className="terminal-window">
        <Window.Header
            active={drawing?.focused ?? true}
            beginMoveGesture={context.presentation.beginMoveGesture}
            maximized={window?.maximized ?? false}
            onMaximize={() => void toggleMaximize()}
        >
            <Window.Header.Identity icon={icon} />
            {/* The center holds the controls only; the empty header around them still moves the window. */}
            <Window.Header.Center style={{ flex: "0 1 auto", minWidth: 0 }}>
                {/* The sessions are the Server's: ending and moving them asks it, and its new list redraws them. */}
                <DocumentTabs aria-label="Sessions" size="small" value={current?.session ?? null} onChange={setChosen} addLabel="New session"
                    onClose={session => void ask("session.close", { session }).catch(() => undefined)}
                    onMove={(session, index) => void ask("session.move", { session, index }).catch(() => undefined)}
                    onAdd={() => void start.safeExecute()}>
                    {mine.map(session => <DocumentTabs.Tab key={session.session} id={session.session} title={session.title} icon={<StateDot session={session} />} />)}
                </DocumentTabs>
            </Window.Header.Center>
            <Window.Header.Actions>
                {/* The folder opens over this Window, with whatever the owner opens folders with, such as Files. */}
                <Window.Header.Action iconOnly aria-label="Show the session's folder" disabled={!current}
                    onPress={() => current && void openOver({ type: "inode/directory", uri: folderAddress(current.cwd) }).catch(() => undefined)}><FolderOpen /></Window.Header.Action>
                <Window.Header.Minimize preventFocusOnPress={false} onPress={() => void context.window.minimize()} />
                <Window.Header.Maximize />
                <Window.Header.Close preventFocusOnPress={false} onPress={() => void context.process().then(process => process.exit())} />
            </Window.Header.Actions>
        </Window.Header>
        {current && remembered !== undefined ? <Screen key={current.session} session={current.session} window={me} onDrawn={() => setDrawn(true)} /> : <div className="screen-empty" />}
        {current && <StatusLine session={current} />}
    </div>
}

/** What the current session is. */
function StatusLine({ session }: Readonly<{ session: SessionEntry }>) {
    return <div className="status-line">
        <span className="status-part"><Server size={13} />This machine</span>
        <span className="status-part">{session.shell.split(/[\\/]/).at(-1)} · {session.cols}×{session.rows}</span>
        <span className="status-spacer" />
        <span className="status-part">{session.state === "running" ? `running ${session.title}` : "ready"}</span>
    </div>
}

function StateDot({ session }: Readonly<{ session: SessionEntry }>) {
    const colors = useThemedValue(useAppearance().colors)
    return <span className="dot" style={{ background: session.state === "running" ? colors.success : colors.warning }} aria-label={session.state} />
}
