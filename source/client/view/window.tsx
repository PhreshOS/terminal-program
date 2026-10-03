import { besideThisWindow, useService } from "@client/core/services"
import { ask, followSessions, type SessionEntry } from "@client/core/terminal-server"
import usePromise from "@libs/react-promise"
import { context } from "@phreshos/client"
import { useWindowState } from "@phreshos/react"
import { Badge, Button, DropdownMenu, Menu, Tabs, Window, useAppearance, useThemedValue } from "@phreshos/react-ui"
import { FolderOpen, Plus, Server, SquareTerminal, X } from "@phreshos/react-ui/icons"
import { useEffect, useRef, useState } from "react"
import icon from "@/icon.png"
import { filesService } from "@shared/service"
import Screen from "./screen"

/**
 * Every tab asks for this width, as in a browser, whatever its title. The tabs share the room in equal
 * columns, so when they do not all fit, each narrows to its column, evenly, rather than overlapping.
 */
const tabWidth = { width: "10.5rem", maxWidth: "100%", justifyContent: "flex-start" }

/** The size a new session starts at, before its window fits it to the screen. */
const startingSize = { cols: 100, rows: 30 }

/**
 * The Terminal as a window. Its tabs are the sessions attached to it; closing a tab ends that
 * session. Closing the window ends none of them: they run on, detached, and the "+" menu offers
 * them to any window. A new window starts with a new session, and closing its last tab closes it.
 */
export default function TerminalWindow({ window: me }: Readonly<{ window: string }>) {
    const initial = usePromise(() => ask<readonly SessionEntry[]>("sessions.list"), [])
    const [followed, setFollowed] = useState<readonly SessionEntry[] | null>(null)
    useEffect(() => followSessions(setFollowed), [])
    const sessions = followed ?? initial.solve ?? null

    const mine = sessions?.filter(session => session.window === me) ?? []
    const detached = sessions?.filter(session => session.window === null) ?? []
    const [chosen, setChosen] = useState<string | null>(null)
    const current = mine.find(session => session.session === chosen) ?? mine.at(-1) ?? null

    const start = usePromise(async (cwd?: string) => {
        const created = await ask<SessionEntry>("session.create", { window: me, ...startingSize, ...(cwd ? { cwd } : {}) })
        setChosen(created.session)
    })
    const take = usePromise(async (session: string) => {
        await ask("session.attach", { session, window: me })
        setChosen(session)
    })

    // A new window starts with a session of its own, in the folder it was opened for, if any; once it
    // has had sessions, losing the last closes it.
    const started = useRef(false)
    useEffect(() => {
        if (sessions === null) return
        if (mine.length > 0) { started.current = true; return }
        if (!started.current) {
            started.current = true
            void context.options("cwd").then(cwd => start.safeExecute(cwd ?? undefined))
        }
        else void context.process().then(process => process.exit())
    }, [sessions, mine.length])

    const files = useService(filesService)
    const window = useWindowState(context.window)
    const toggleMaximize = async () => context.window.maximize(!await context.window.maximized())

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
                <NewSession detached={detached} onNew={() => void start.safeExecute()} onTake={session => void take.safeExecute(session)} />
            </Window.Header.Center>
            <Window.Header.Actions>
                {/* Shown while a Program offers the "files" Service, such as Files. */}
                {files && <Window.Header.Action iconOnly aria-label="Show the session's folder in Files" disabled={!current}
                    onPress={() => current && void besideThisWindow().then(position => files.ask("path.show", { path: current.cwd, ...(position ? { position } : {}) }))}><FolderOpen /></Window.Header.Action>}
                <Window.Header.Minimize preventFocusOnPress={false} onPress={() => void context.window.minimize()} />
                <Window.Header.Maximize />
                <Window.Header.Close preventFocusOnPress={false} onPress={() => void context.process().then(process => process.exit())} />
            </Window.Header.Actions>
        </Window.Header>
        {current ? <Screen key={current.session} session={current.session} window={me} /> : <div className="screen-empty" />}
        {current && <StatusLine session={current} />}
    </div>
}

/** Starts a session on this machine, or brings a running one into this window. */
function NewSession({ detached, onNew, onTake }: Readonly<{ detached: readonly SessionEntry[], onNew: () => void, onTake: (session: string) => void }>) {
    return <DropdownMenu>
        <DropdownMenu.Trigger iconOnly depth="none" size="small" aria-label="New session"><Plus /></DropdownMenu.Trigger>
        <DropdownMenu.Content>
            <Menu aria-label="New session" size="small" onAction={key => key === "new" ? onNew() : onTake(String(key))}>
                <Menu.Item id="new" textValue="This machine" style={{ paddingBlock: "0.25rem", gap: "0.75rem" }}>
                    <Server /><span className="entry-text">This machine<small>a new shell</small></span>
                </Menu.Item>
                {detached.length > 0 && <Menu.Separator />}
                {detached.map(session => <Menu.Item key={session.session} id={session.session} textValue={session.title} style={{ paddingBlock: "0.25rem", gap: "0.75rem" }}>
                    <SquareTerminal /><span className="entry-text">{session.title}<small>running, in no window</small></span>
                </Menu.Item>)}
            </Menu>
        </DropdownMenu.Content>
    </DropdownMenu>
}

/** What the current session is, and that it outlives this window. */
function StatusLine({ session }: Readonly<{ session: SessionEntry }>) {
    return <div className="status-line">
        <span className="status-part"><Server size={13} />This machine</span>
        <span className="status-part">{session.shell.split("/").at(-1)} · {session.cols}×{session.rows}</span>
        <span className="status-spacer" />
        <Badge size="small">Keeps running when the window closes</Badge>
        <span className="status-part">{session.state === "running" ? `running ${session.title}` : "ready"}</span>
    </div>
}

function StateDot({ session }: Readonly<{ session: SessionEntry }>) {
    const colors = useThemedValue(useAppearance().colors)
    return <span className="dot" style={{ background: session.state === "running" ? colors.success : colors.warning }} aria-label={session.state} />
}
