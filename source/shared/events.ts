/** The event that carries one session's output: a window follows only the session it shows. */
export function outputEvent(session: string) {
    return `output.${session}`
}
