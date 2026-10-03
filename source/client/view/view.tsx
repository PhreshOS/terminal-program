import { windowIdentity } from "@client/core/terminal-server"
import usePromise from "@libs/react-promise"
import { desktop, system } from "@phreshos/client"
import { DesktopProvider, SystemProvider, useDesktopPreferences, useSystemAppearance } from "@phreshos/react"
import { DocumentTheme, UIProvider } from "@phreshos/react-ui"
import TerminalWindow from "./window"
import "./style.css"

/** The Terminal in the Desktop's Appearance and preferences, once it knows which window it is. */
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
        {window.solve && <TerminalWindow window={window.solve} />}
    </UIProvider>
}
