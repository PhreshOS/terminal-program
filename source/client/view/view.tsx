import Application from "@client/core/application"
import Session from "@client/core/session"
import usePromise from "@libs/react-promise"
import Readiness, { useReadiness, useReady } from "@libs/readiness"
import { DesktopProvider, SystemProvider, useDesktopPreferences } from "@phreshos/react"
import { desktop, system } from "@phreshos/client"
import { useCallback, useEffect, useLayoutEffect, useState, type ReactNode } from "react"
import Terminal from "./terminal"
import "./style.css"

type Requirement = Readonly<{ message: string }>

const systemRequirement = Object.freeze<Requirement>({ message: "Opening Terminal…" })
const desktopRequirement = Object.freeze<Requirement>({ message: "Opening Desktop…" })
const sessionRequirement = Object.freeze<Requirement>({ message: "Connecting to Terminal…" })
const renderRequirement = Object.freeze<Requirement>({ message: "Rendering Terminal…" })
const startupRequirements = Object.freeze([
  systemRequirement,
  desktopRequirement,
  sessionRequirement,
  renderRequirement
])

export default function View() {
  return <Readiness requirements={startupRequirements}>
    <TerminalReadiness>
      <SystemProvider system={system}>
        <ReadyStage requirement={systemRequirement}>
          <DesktopProvider desktop={desktop}>
            <ReadyStage requirement={desktopRequirement}>
              <TerminalApplication />
            </ReadyStage>
          </DesktopProvider>
        </ReadyStage>
      </SystemProvider>
    </TerminalReadiness>
  </Readiness>
}

function TerminalReadiness({ children }: Readonly<{ children: ReactNode }>) {
  const { pending } = useReadiness<Requirement>()
  const [revealed, setRevealed] = useState(false)

  // Initial readiness is a one-way boundary; later session activity must not hide the terminal again.
  useLayoutEffect(() => {
    if (pending.length === 0) setRevealed(true)
  }, [pending])

  return <div className="terminal-readiness-stage">
    <div className="terminal-readiness-content" inert={!revealed} aria-hidden={!revealed} style={{ opacity: revealed ? 1 : 0 }}>
      {children}
    </div>
    {!revealed && <div className="terminal-initial-loading"><State message={pending[0]?.message ?? "Opening Terminal…"} /></div>}
  </div>
}

function ReadyStage({ children, requirement }: Readonly<{ children: ReactNode, requirement: Requirement }>) {
  useReady(requirement)
  return children
}

function TerminalApplication() {
  const preferences = useDesktopPreferences()
  const [application] = useState(() => new Application())
  const opening = usePromise(() => application.start(), [application])

  useEffect(() => () => application.dispose(), [application])

  if (opening.isPending) return <State message="Connecting to Terminal…" />
  if (opening.exception) return <FailedTerminal
    error={opening.exception.current}
    retry={() => void opening.safeExecute()}
  />

  return <TerminalSession key={opening.solve.identity} session={opening.solve} inverted={preferences.theme === "light"} />
}

function TerminalSession({ session, inverted }: Readonly<{ session: Session, inverted: boolean }>) {
  useReady(sessionRequirement)
  const [rendered, setRendered] = useState(false)
  const { pending } = useReadiness<Requirement>()
  const onReady = useCallback(() => setRendered(true), [])

  return <>
    <Terminal session={session} inverted={inverted} visible={pending.length === 0} onReady={onReady} />
    {rendered && <ReadyStage requirement={renderRequirement}>{null}</ReadyStage>}
  </>
}

function FailedTerminal({ error, retry }: Readonly<{ error: unknown, retry: () => void }>) {
  useReady(sessionRequirement)
  useReady(renderRequirement)
  return <State message={message(error)} retry={retry} />
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
