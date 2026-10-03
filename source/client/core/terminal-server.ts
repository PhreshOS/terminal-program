import { context } from "@phreshos/client"
import type { Process, ServerEndpoint } from "@phreshos/core"
import type { Snapshot, Output } from "@server/core/session"
import type { SessionEntry } from "@server/core/sessions"
import { outputEvent } from "@shared/events"
import { terminalService } from "@shared/service"

export type { Output, SessionEntry, Snapshot }

type Shared = Readonly<{ process: Process, server: ServerEndpoint }>

let shared: Promise<Shared> | undefined

const listFollowers = new Set<(sessions: readonly SessionEntry[]) => void>()

/**
 * The one Terminal Server every window uses, the "terminal" Service. It starts with the System; a
 * window that finds it gone starts it again.
 */
function server() {
    shared ??= (async () => {
        const program = await context.program()
        const process = await program.findOrCreateProcess(terminalService)
        await process.server.waitReady()
        process.server.subscribe("sessions.changed", payload => { for (const follow of listFollowers) follow(payload as readonly SessionEntry[]) })
        return { process, server: process.server }
    })().catch(error => { shared = undefined; throw error })
    return shared
}

/** Asks the Terminal Server; when its Process has ended since, finds or starts it again and asks once more. */
export async function ask<Result>(event: string, payload?: unknown): Promise<Result> {
    for (let attempt = 0; ; attempt++) {
        const current = await server()
        try {
            return await current.server.timeout(15_000).ask<Result>(event, payload)
        }
        catch (error) {
            const ended = await current.process.exited().catch(() => true)
            if (attempt > 0 || !ended) throw error
            shared = undefined
        }
    }
}

/** Follows the list of sessions as it changes. */
export function followSessions(follow: (sessions: readonly SessionEntry[]) => void) {
    listFollowers.add(follow)
    void server().catch(() => undefined)
    return () => { listFollowers.delete(follow) }
}

/**
 * Follows one session's output; only the session a window shows is followed. It resolves once the
 * subscription is in place, so a snapshot asked for afterwards misses nothing that follows it.
 */
export async function followOutput(session: string, follow: (output: Output) => void) {
    const current = await server()
    return current.server.subscribe(outputEvent(session), payload => follow(payload as Output))
}

/** This window's own identity, which the Server knows it by. */
export const windowIdentity = context.process().then(process => process.identity)
