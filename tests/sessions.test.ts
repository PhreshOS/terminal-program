import { afterEach, expect, test } from "vitest"
import Session, { type Output } from "@server/core/session"
import Sessions, { type Windows } from "@server/core/sessions"

const opened: Array<{ close(): void }> = []
afterEach(() => { for (const item of opened.splice(0)) item.close() })

function until(condition: () => boolean, timeout = 5000) {
    return new Promise<void>((resolve, reject) => {
        const began = Date.now()
        const check = () => condition() ? resolve() : Date.now() - began > timeout ? reject(new Error("timed out")) : setTimeout(check, 20)
        check()
    })
}

/** Windows that end only when the test says so. */
function fakeWindows(open: Set<string>) {
    let ended: (window: string) => void = () => undefined
    const windows: Windows = {
        followEnds(follow) { ended = follow },
        async exists(window) { return open.has(window) }
    }
    return { windows, end(window: string) { open.delete(window); ended(window) } }
}

test("a session's output leaves in numbered batches, and its snapshot is the screen as it is", async () => {
    const session = new Session({ cols: 80, rows: 24, shell: "/bin/sh" })
    opened.push(session)
    const outputs: Output[] = []
    session.subscribe(event => { if (event.type === "output") outputs.push(event.output) })
    session.write("printf 'one\\ntwo\\nthree\\n'\r")
    await until(() => outputs.map(output => output.data).join("").includes("three"))
    // Batched: the shell's many small writes arrive as few messages, numbered one after another.
    expect(outputs.map(output => output.sequence)).toEqual(outputs.map((_, index) => index + 1))
    const snapshot = await session.snapshot()
    expect(snapshot.sequence).toBe(outputs.at(-1)!.sequence)
    expect(await session.text()).toContain("two")
})

test("a watcher that lags far behind pauses the shell until it catches up", async () => {
    const session = new Session({ cols: 80, rows: 24, shell: "/bin/sh" })
    opened.push(session)
    let produced = 0
    session.subscribe(event => { if (event.type === "output") produced += event.output.data.length })
    session.watch("window")
    session.write("yes 0123456789012345678901234567890123456789\r")
    await until(() => (session as unknown as { paused: boolean }).paused, 10_000)
    const atPause = produced
    await new Promise(resolve => setTimeout(resolve, 300))
    // Paused: almost nothing more arrives while the watcher has not drawn it.
    expect(produced - atPause).toBeLessThan(256 * 1024)
    session.acknowledge("window", produced)
    await until(() => !(session as unknown as { paused: boolean }).paused)
    session.write("\x03")
})

test("a window's end detaches its sessions, and another window can take them", async () => {
    const open = new Set(["first", "second"])
    const { windows, end } = fakeWindows(open)
    const sessions = new Sessions(windows)
    const created = await sessions.create("first", { cols: 80, rows: 24 })
    opened.push({ close: () => { try { sessions.close(created.session) } catch { /* already ended */ } } })
    expect(sessions.list()[0].window).toBe("first")
    end("first")
    expect(sessions.list()[0].window).toBeNull()
    await sessions.attach(created.session, "second")
    expect(sessions.list()[0].window).toBe("second")
})

test("a session attached to a window that already ended runs on, detached", async () => {
    const { windows } = fakeWindows(new Set())
    const sessions = new Sessions(windows)
    const created = await sessions.create("gone", { cols: 80, rows: 24 })
    opened.push({ close: () => { try { sessions.close(created.session) } catch { /* already ended */ } } })
    expect(sessions.list()[0].window).toBeNull()
})

test("an ended session leaves the list", async () => {
    const sessions = new Sessions(fakeWindows(new Set(["window"])).windows)
    const created = await sessions.create("window", { cols: 80, rows: 24 })
    sessions.close(created.session)
    await until(() => sessions.list().length === 0)
    expect(() => sessions.get(created.session)).toThrow()
})
