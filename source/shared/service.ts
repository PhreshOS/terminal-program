/**
 * The Terminal Server is the "terminal" Service: the one Process that holds every session, reached by
 * this name from the Terminal's own windows and from other Programs, such as Files opening a folder
 * in the Terminal. It starts with the System, so other Programs find it present.
 */
export const terminalService = { name: "terminal", server: true, client: false } as const

/** The Service a Terminal window shows a folder through, offered by Files or any Program like it. */
export const filesService = "files"
