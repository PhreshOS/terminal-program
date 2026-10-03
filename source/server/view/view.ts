import { context } from "@phreshos/server"
import Sessions, { type Windows } from "@server/core/sessions"
import { outputEvent } from "@shared/events"
import { terminalService } from "@shared/service"
import { contract } from "./contract"

/**
 * The Terminal Server: every session, for every window and for agents. It answers questions about
 * sessions and announces two things: that the list changed, and each session's output, under that
 * session's own event, so a window receives only what it shows.
 */
export default async function view() {
    const program = await context.program()
    await startWithTheSystem(program)

    // A window is a Process of this Program; it has ended once its Process has.
    const windows: Windows = {
        followEnds(ended) { program.subscribe("processExit", event => ended(event.process.identity)) },
        async exists(window) { return await program.findProcess(window) !== null }
    }

    const sessions = new Sessions(windows)

    sessions.subscribe(event => {
        if (event.type === "changed") void context.publish("sessions.changed", sessions.list())
        else void context.publish(outputEvent(event.session), event.output)
    })

    context.answer("sessions.list", () => sessions.list())

    // Another Program, or anyone, opens a folder in the Terminal: a new window, whose first session
    // starts there. It stands where the asker places it, such as beside the window it was asked from.
    context.answer("session.open", async ({ payload }) => {
        const { cwd, position } = contract.open.parse(payload)
        await program.createProcess({ server: false, client: position ? { position } : true, options: { cwd } })
    })

    context.answer("session.create", ({ payload }) => {
        const { window, ...options } = contract.create.parse(payload)
        return sessions.create(window, options)
    })

    context.answer("session.attach", ({ payload }) => {
        const { session, window } = contract.attach.parse(payload)
        return sessions.attach(session, window)
    })

    context.answer("session.detach", ({ payload }) => sessions.detach(contract.session.parse(payload).session))

    context.answer("session.close", ({ payload }) => sessions.close(contract.session.parse(payload).session))

    context.answer("session.write", ({ payload }) => {
        const { session, data } = contract.write.parse(payload)
        sessions.get(session).write(data)
    })

    context.answer("session.resize", ({ payload }) => {
        const { session, cols, rows } = contract.resize.parse(payload)
        sessions.get(session).resize(cols, rows)
    })

    // A window shows a session: from here on its drawing counts toward the shell's pace, and it
    // receives the screen as it is, numbered, to continue from with the output that follows.
    context.answer("session.watch", ({ payload }) => {
        const { session, window } = contract.watch.parse(payload)
        const current = sessions.get(session)
        current.watch(window)
        return current.snapshot()
    })

    context.answer("session.unwatch", ({ payload }) => {
        const { session, window } = contract.watch.parse(payload)
        sessions.get(session).unwatch(window)
    })

    context.answer("session.acknowledge", ({ payload }) => {
        const { session, window, characters } = contract.acknowledge.parse(payload)
        sessions.get(session).acknowledge(window, characters)
    })

    // For agents and others who read a session rather than show it.
    context.answer("session.text", async ({ payload }) => sessions.get(contract.session.parse(payload).session).text())

    context.answer("session.read", ({ payload }) => {
        const { session, after, limit } = contract.read.parse(payload)
        return sessions.get(session).read(after, limit)
    })
}

/** Remembered once the Terminal has recorded its start with the System. */
const startupRecorded = "startup.recorded"

/**
 * The Service starts with the System, so other Programs find it present. The Terminal records that
 * once; an owner who removes the record keeps it removed.
 */
async function startWithTheSystem(program: Awaited<ReturnType<typeof context.program>>) {
    if (await program.store.get<boolean>(startupRecorded)) return
    await program.startup.set(terminalService)
    await program.store.set(startupRecorded, true)
}
