import assert from "node:assert/strict"
import { renderToStaticMarkup } from "react-dom/server"
import { test } from "vitest"
import Readiness, { ReadinessState, useReadiness } from "@libs/readiness"

test("Terminal initial work remains pending until each stage is ready", () => {
  const system = { message: "Opening Terminal…" }
  const desktop = { message: "Opening Desktop…" }
  const session = { message: "Connecting to Terminal…" }
  const rendering = { message: "Rendering Terminal…" }
  const initial = ReadinessState.start([system, desktop, session, rendering])

  assert.deepEqual(initial.pending, [system, desktop, session, rendering])
  assert.deepEqual(initial.ready(system).ready(desktop).ready(session).pending, [rendering])
  assert.deepEqual(initial.ready(system).ready(desktop).ready(session).ready(rendering).pending, [])
  assert.deepEqual(initial.ready(system).ready(desktop).ready(session).ready(rendering).require(session).pending, [session])

  function PendingMessage() {
    const { pending } = useReadiness<{ message: string }>()
    return <span>{pending[0]?.message}</span>
  }

  assert.match(renderToStaticMarkup(<Readiness requirements={[system]}><PendingMessage /></Readiness>), /Opening Terminal/)
})
