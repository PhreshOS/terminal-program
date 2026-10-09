import type { OpenTarget } from "@phreshos/core"

/** What opens a shell at a folder: a `terminal:` address, as a link is an `https:` one. */
export const terminalType = "x-scheme-handler/terminal"

/** The folder a `terminal:` address names, or `undefined` for anything else. */
export function folderOf(opened: OpenTarget | null) {
    if (opened?.type !== terminalType) return undefined
    return decodeURIComponent(new URL(opened.uri).pathname) || undefined
}

/** A folder as a `file:` address, which whatever the owner opens folders with understands. */
export function folderAddress(path: string) {
    return `file://${path.split("/").map(encodeURIComponent).join("/")}`
}
