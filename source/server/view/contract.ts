import { z } from "zod"

const identity = z.string().min(1).max(100)
const folder = z.string().startsWith("/")

/** A place on the Desktop's plane: pixels, or a share of the view such as "50% - 200". */
const value = z.union([z.number(), z.string().min(1).max(100)])
const size = { cols: z.number().int().min(2).max(1000), rows: z.number().int().min(1).max(500) }

/** What windows, agents, and other Programs may ask the Terminal Server, and the shape of each question. */
export const contract = {
    open: z.object({ cwd: folder, position: z.object({ x: value, y: value }).optional() }),
    create: z.object({ window: identity, ...size, cwd: folder.optional() }),
    attach: z.object({ session: identity, window: identity }),
    session: z.object({ session: identity }),
    write: z.object({ session: identity, data: z.string().max(1024 * 1024) }),
    resize: z.object({ session: identity, ...size }),
    watch: z.object({ session: identity, window: identity }),
    acknowledge: z.object({ session: identity, window: identity, characters: z.number().int().min(0) }),
    read: z.object({ session: identity, after: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(1000).default(200) })
}
