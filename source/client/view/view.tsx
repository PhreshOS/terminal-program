import Application from "@client/core/application"
import usePromise from "@libs/react-promise"
import { SystemProvider, useDesktopPreferences, useSystemAppearance } from "@phreshos/react"
import { useEffect, useState } from "react"
import Terminal from "./terminal"
import "./style.css"

export default function View() {
  return <SystemProvider
    provide={["appearance", "desktopPreferences"]}
    fallback={<State message="Opening Terminal…" />}
  >
    <TerminalApplication />
  </SystemProvider>
}

function TerminalApplication() {
  const appearance = useSystemAppearance()
  const preferences = useDesktopPreferences()
  const [application] = useState(() => new Application())
  const opening = usePromise(() => application.start(), [application])

  useEffect(() => () => application.dispose(), [application])

  if (opening.isPending) return <State message="Connecting to Terminal…" />
  if (opening.exception) return <State
    message={message(opening.exception.current)}
    retry={() => void opening.safeExecute()}
  />

  return <Terminal session={opening.solve} foreground={appearance.foreground[preferences.theme]} />
}

function State({ message, retry }: Readonly<{ message: string, retry?: () => void }>) {
  return <main className="terminal-state" role={retry ? "alert" : "status"}>
    <p>{message}</p>
    {retry && <button type="button" onClick={retry}>Try again</button>}
  </main>
}

function message(value: unknown) {
  return value instanceof Error ? value.message : "Terminal could not start"
}
