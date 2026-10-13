/**
 * The Terminal Server is the "terminal" Service: the one Process that holds every session, reached by
 * this name from the Terminal's own windows and from other Programs that work with its sessions.
 * It starts with the System, so other Programs find it present.
 */
export const terminalService = { name: "terminal", server: true, client: false } as const
