import type { Endpoint } from "@phreshos/core"
import { current, system } from "@phreshos/server"
import Application from "@server/core/application"
import { terminalServerName } from "@server/core/terminal"
import {
  sessionCreate,
  sessionList,
  sessionRead,
  sessionRequest,
  sessionResize,
  sessionSignal,
  sessionWrite
} from "./contract"

export default async function view() {
  const process = await current.process()
  const hasClient = await current.client.exists()

  if (process.name !== terminalServerName || hasClient) {
    if (hasClient) await current.stop()
    else await process.exit()
    return
  }

  const application = new Application()
  application.subscribe(event => {
    current.publish(event.type, event.payload)
    if (event.type === "session.removed" && event.payload.client) {
      void exitClient(event.payload.client).catch(error => console.error("Terminal could not exit its associated Client", error))
    }
  })

  current.answer("session.create", async message => {
    const request = sessionCreate.parse(message.payload)
    const owner = request.lifecycle === "client" ? await clientIdentity(message.from) : undefined
    const { request: correlation, ...options } = request
    application.create({ ...options, owner }, correlation)
    return { accepted: true } as const
  })

  current.answer("session.list", message => {
    const request = sessionList.parse(message.payload ?? {})
    return application.list(request)
  })

  current.answer("session.read", message => {
    const request = sessionRead.parse(message.payload)
    return application.read(request.session, request.after, request.limit)
  })

  current.answer("session.snapshot", message => {
    const request = sessionRequest.parse(message.payload)
    return application.snapshot(request.session)
  })

  current.answer("session.attach", async message => {
    const request = sessionRequest.parse(message.payload)
    application.attach(request.session, await clientIdentity(message.from))
    return { accepted: true } as const
  })

  current.answer("session.write", message => {
    const request = sessionWrite.parse(message.payload)
    application.write(request.session, request.data)
    return { accepted: true } as const
  })

  current.answer("session.resize", message => {
    const request = sessionResize.parse(message.payload)
    application.resize(request.session, request.cols, request.rows)
    return { accepted: true } as const
  })

  current.answer("session.signal", message => {
    const request = sessionSignal.parse(message.payload)
    application.signal(request.session, request.signal)
    return { accepted: true } as const
  })

  current.answer("session.close", message => {
    const request = sessionRequest.parse(message.payload)
    application.close(request.session)
    return { accepted: true } as const
  })

  system.process.subscribe("endpointStop", endpoint => {
    void releaseClient(application, endpoint).catch(() => undefined)
  })
}

async function clientIdentity(endpoint: Endpoint) {
  const process = await endpoint.process()
  if (endpoint !== process.client) throw new Error("This terminal operation requires a Client")
  return process.identity
}

async function releaseClient(application: Application, endpoint: Endpoint) {
  const process = await endpoint.process()
  if (endpoint === process.client) application.releaseOwner(process.identity)
}

async function exitClient(identity: string) {
  const process = await system.process.find(identity)
  if (!process || !await process.client.exists()) return

  if (await process.server.exists()) await process.client.stop()
  else await process.exit()
}
