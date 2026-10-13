/**
 * The Terminal Server: the one Process, named "terminal", that holds every session. The Terminal's own
 * windows find it by this name; its Server holds the "terminal" Service, as the definition declares,
 * which is how other Programs reach it. It starts with the System, so other Programs find it present.
 */
export const terminalLaunch = { name: "terminal", server: true, client: false } as const
