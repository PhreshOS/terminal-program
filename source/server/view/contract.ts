import { z } from "zod"

const identity = z.string().min(1).max(100)
/** A folder from a root of the machine: `/home/me`, or `C:\Users\me` and `\\server\share` on Windows. */
const folder = z.string().max(4096).regex(/^(?:\/|[A-Za-z]:[\\/]|\\\\)/, "A folder must start from a root of this machine")

/** A place on the Desktop's plane: pixels, or a share of the view such as "50% - 200". */
const value = z.union([z.number(), z.string().min(1).max(100)])
const size = { cols: z.number().int().min(2).max(1000), rows: z.number().int().min(1).max(500) }

/** What windows, agents, and other Programs may ask the Terminal Server, and the shape of each question. */
export const contract = {
    open: z.object({ cwd: folder, position: z.object({ x: value, y: value }).optional() }),
    create: z.object({ window: identity, ...size, cwd: folder.optional() }),
    session: z.object({ session: identity }),
    move: z.object({ session: identity, index: z.number().int().min(0).max(10_000) }),
    write: z.object({ session: identity, data: z.string().max(1024 * 1024) }),
    resize: z.object({ session: identity, ...size }),
    watch: z.object({ session: identity, window: identity }),
    acknowledge: z.object({ session: identity, window: identity, characters: z.number().int().min(0) }),
    read: z.object({ session: identity, after: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(1000).default(200) })
}
