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

test("each output batch carries the size it was written at, and a resize ends the batch before it", async () => {
    const session = new Session({ cols: 100, rows: 30, shell: "/bin/sh" })
    opened.push(session)
    const outputs: Output[] = []
    session.subscribe(event => { if (event.type === "output") outputs.push(event.output) })
    session.write("echo before\r")
    await until(() => outputs.map(output => output.data).join("").includes("before"))
    session.resize(60, 20)
    session.write("echo after\r")
    await until(() => outputs.map(output => output.data).join("").includes("after\r\n"))
    const at = (text: string) => outputs.find(output => output.data.includes(text))!
    expect([at("before").cols, at("before").rows]).toEqual([100, 30])
    expect([at("after\r\n").cols, at("after\r\n").rows]).toEqual([60, 20])
    // What was read back keeps its size too.
    expect(session.read(0, 100).output.every(output => output.cols > 0 && output.rows > 0)).toBe(true)
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

test("a window's end ends its sessions, and only its own", async () => {
    const open = new Set(["first", "second"])
    const { windows, end } = fakeWindows(open)
    const sessions = new Sessions(windows)
    const first = await sessions.create("first", { cols: 80, rows: 24 })
    const second = await sessions.create("second", { cols: 80, rows: 24 })
    opened.push({ close: () => { try { sessions.close(second.session) } catch { /* already ended */ } } })
    end("first")
    await until(() => sessions.list().length === 1)
    expect(sessions.list()[0].session).toBe(second.session)
    expect(() => sessions.get(first.session)).toThrow()
})

test("a session started for a window that already ended ends at once", async () => {
    const { windows } = fakeWindows(new Set())
    const sessions = new Sessions(windows)
    await sessions.create("gone", { cols: 80, rows: 24 })
    await until(() => sessions.list().length === 0)
})

test("an ended session leaves the list", async () => {
    const sessions = new Sessions(fakeWindows(new Set(["window"])).windows)
    const created = await sessions.create("window", { cols: 80, rows: 24 })
    sessions.close(created.session)
    await until(() => sessions.list().length === 0)
    expect(() => sessions.get(created.session)).toThrow()
})
