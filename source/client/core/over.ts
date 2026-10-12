import { context, system } from "@phreshos/client"
import type { OpenTarget } from "@phreshos/core"

/**
 * Opens something directly over this Window, at its place, where the Program that opens it does not
 * say where its Windows open.
 */
export async function openOver(target: OpenTarget) {
    return system.open(target, { position: await context.window.position() })
}
