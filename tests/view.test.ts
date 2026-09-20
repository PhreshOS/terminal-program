import assert from "node:assert/strict"
import type { Process } from "@phreshos/core"
import { beforeEach, test, vi } from "vitest"

const boundary = vi.hoisted(() => {
  let followProcess: ((process: Process) => void) | undefined

  return {
    context: {
      answer: vi.fn(),
      client: { running: vi.fn(async () => false) },
      process: vi.fn(async () => ({ name: "terminal-server" })),
      publish: vi.fn(),
      stop: vi.fn()
    },
    system: {
      process: {
        find: vi.fn(async () => null),
        list: vi.fn(async () => []),
        subscribe: vi.fn((_event: string, listener: (process: Process) => void) => {
          followProcess = listener
          return () => undefined
        })
      }
    },
    follow(process: Process) {
      if (!followProcess) throw new Error("The Process observer is not registered")
      followProcess(process)
    }
  }
})

vi.mock("@phreshos/server", () => ({
  context: boundary.context,
  system: boundary.system
}))

import Application from "@server/core/application"
import view from "@server/view/view"

beforeEach(() => {
  vi.clearAllMocks()
})

test("a client-lifecycle Session is released when its Client Endpoint stops or its Process exits", async () => {
  let stopped: (() => void) | undefined
  let exited: (() => void) | undefined
  const releaseOwner = vi.spyOn(Application.prototype, "releaseOwner")

  await view()
  boundary.follow({
    identity: "8f0cf1df-3129-46f2-b45e-b9fc0ba68cd0",
    client: {
      lifecycle: {
        subscribe(event: string, listener: () => void) {
          assert.equal(event, "stop")
          stopped = listener
          return () => undefined
        }
      }
    },
    subscribe(event: string, listener: () => void) {
      assert.equal(event, "exit")
      exited = listener
      return () => undefined
    }
  } as unknown as Process)

  assert(stopped)
  stopped()
  assert.deepEqual(releaseOwner.mock.calls, [["8f0cf1df-3129-46f2-b45e-b9fc0ba68cd0"]])

  assert(exited)
  exited()
  assert.deepEqual(releaseOwner.mock.calls, [
    ["8f0cf1df-3129-46f2-b45e-b9fc0ba68cd0"],
    ["8f0cf1df-3129-46f2-b45e-b9fc0ba68cd0"]
  ])
})
