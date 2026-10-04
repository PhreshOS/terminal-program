import { windowIdentity } from "@client/core/terminal-server"
import usePromise from "@libs/react-promise"
import { desktop, system } from "@phreshos/client"
import { DesktopProvider, SystemProvider, useDesktopPreferences, useSystemAppearance } from "@phreshos/react"
import { DocumentTheme, Loading, UIProvider } from "@phreshos/react-ui"
import { Arrival } from "./readiness"
import TerminalWindow from "./window"
import "./style.css"

/**
 * The Terminal in the Desktop's Appearance and preferences. It appears whole, once it knows which
 * window it is, the sessions there are, and the first screen is drawn.
 */
export default function View() {
    return <SystemProvider system={system}>
        <DesktopProvider desktop={desktop}>
            <Themed />
        </DesktopProvider>
    </SystemProvider>
}

function Themed() {
    const window = usePromise(() => windowIdentity, [])
    return <UIProvider appearance={useSystemAppearance()} preferences={useDesktopPreferences()}>
        <DocumentTheme />
        <Loading>{window.solve ? <TerminalWindow window={window.solve} /> : <Arrival arrived={false} />}</Loading>
    </UIProvider>
}
