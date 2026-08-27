import assert from "node:assert/strict"
import Application from "@server/core/application"
import Session from "@server/core/session"

const session = new Session({
  lifecycle: "explicit",
  cols: 40,
  rows: 10
})
let output = ""

const received = new Promise<void>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("The PTY did not produce output in time")), 5_000)
  const stop = session.subscribe(event => {
    if (event.type !== "output") return
    output += event.data
    if (!output.includes("PHRESH_TERMINAL_OK")) return
    clearTimeout(timer)
    stop()
    resolve()
  })
})

session.write("printf PHRESH_TERMINAL_OK\\n\r")
await received

const snapshot = await session.snapshot()
assert.equal(snapshot.session.session, session.identity)
assert.equal(snapshot.cols, 40)
assert.equal(snapshot.rows, 10)
assert(snapshot.data.includes("PHRESH_TERMINAL_OK"))

session.resize(50, 12)
assert.equal(session.description().cols, 50)
assert.equal(session.description().rows, 12)
session.close()

const application = new Application()
const changes: Array<{ session: { session: string }, request?: string }> = []
let completeRemoval: (value: { session: string, client: string | null }) => void = () => undefined
const removal = new Promise<{ session: string, client: string | null }>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("The client session did not exit in time")), 5_000)
  completeRemoval = value => {
    clearTimeout(timer)
    resolve(value)
  }
})
application.subscribe(event => {
  if (event.type === "session.changed") changes.push(event.payload)
  if (event.type === "session.removed") completeRemoval(event.payload)
})

const first = application.create({
  lifecycle: "client",
  owner: "shared-client",
  cols: 40,
  rows: 10
}, "first-desktop")
const second = application.create({
  lifecycle: "client",
  owner: "shared-client",
  cols: 80,
  rows: 24
}, "second-desktop")

assert.equal(second.identity, first.identity)
assert.equal(application.list({ limit: 20 }).sessions.length, 1)
assert.equal(first.description().client, "shared-client")
assert.equal(application.list({ limit: 20, client: "shared-client" }).sessions.length, 1)
assert.equal(application.list({ limit: 20, client: "another-client" }).sessions.length, 0)
assert.equal(changes.at(-2)?.request, "first-desktop")
assert.equal(changes.at(-1)?.request, "second-desktop")
assert.equal(changes.at(-1)?.session.session, first.identity)
first.write("exit\r")
assert.deepEqual(await removal, { session: first.identity, client: "shared-client" })
application.dispose()
