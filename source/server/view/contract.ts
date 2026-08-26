import { z } from "zod"

const identity = z.string().uuid()
const dimension = z.number().int().min(1).max(500)

export const sessionCreate = z.strictObject({
  request: z.string().min(1).max(128),
  lifecycle: z.enum(["client", "explicit"]),
  cols: dimension.default(80),
  rows: dimension.max(300).default(24),
  cwd: z.string().min(1).max(4096).optional(),
  shell: z.string().min(1).max(4096).optional()
})

export const sessionList = z.strictObject({
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).max(256).optional(),
  lifecycle: z.enum(["client", "explicit"]).optional(),
  client: identity.optional(),
  status: z.literal("running").optional()
})

export const sessionRequest = z.strictObject({ session: identity })

export const sessionRead = sessionRequest.extend({
  after: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(512).default(128)
})

export const sessionWrite = sessionRequest.extend({
  data: z.string().max(64 * 1024)
})

export const sessionResize = sessionRequest.extend({
  cols: dimension,
  rows: dimension.max(300)
})

export const sessionSignal = sessionRequest.extend({
  signal: z.enum(["SIGINT", "SIGTERM", "SIGHUP", "SIGKILL"])
})
