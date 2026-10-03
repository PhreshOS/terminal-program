import { context, system } from "@phreshos/client"
import { parseRelativeValue, type Position, type ServerService, type Value } from "@phreshos/core"
import { useEffect, useState } from "react"

/**
 * The Server Service offered under this name, while one is present, or `null`. It follows Services
 * appearing and leaving, so what depends on it shows only while it can work. When several Programs
 * offer the name, the first one found serves.
 */
export function useService(name: string) {
    const [service, setService] = useState<ServerService | null>(null)
    useEffect(() => {
        let active = true
        const look = () => void system.service.list({ name })
            .then(found => found.find((service): service is ServerService => service.address().endpoint === "server") ?? null)
            .catch(() => null)
            .then(found => { if (active) setService(found) })
        const named = (service: { address(): { process: string } }) => { if (service.address().process === name) look() }
        const stopAvailable = system.service.subscribe("available", named)
        const stopUnavailable = system.service.subscribe("unavailable", named)
        look()
        return () => {
            active = false
            stopAvailable()
            stopUnavailable()
        }
    }, [name])
    return service
}

/** How far a window opened from this one stands from it, down and across. */
const step = 32

/**
 * A little down and across from this window, for a window another Program opens from it. Its position
 * may be in pixels or in views, such as "100% - 262"; either way the step is added in pixels.
 */
export async function besideThisWindow(): Promise<Position | null> {
    const { x, y } = await context.window.position()
    const shiftedX = shifted(x), shiftedY = shifted(y)
    return shiftedX === null || shiftedY === null ? null : { x: shiftedX, y: shiftedY }
}

function shifted(value: Value): Value | null {
    const parsed = parseRelativeValue(value)
    if (!parsed) return null
    const pixels = parsed.pixels + step
    if (parsed.relative === 0) return pixels
    const share = `${parsed.relative * 100}%`
    return pixels === 0 ? share : `${share} ${pixels < 0 ? "-" : "+"} ${Math.abs(pixels)}`
}
