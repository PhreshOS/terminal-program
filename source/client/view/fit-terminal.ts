import type { Terminal } from "@xterm/xterm"

/** Fits complete terminal cells into a view whose scrollbar occupies no space. */
export default function fitTerminal(terminal: Terminal) {
  const element = terminal.element
  const parent = element?.parentElement

  if (!element || !parent) return

  const renderService = (terminal as TerminalInternals)._core._renderService
  const dimensions = renderService.dimensions
  const cell = dimensions.css.cell

  if (!cell.width || !cell.height) return

  const style = getComputedStyle(element)
  const height = parent.clientHeight - pixels(style.paddingTop) - pixels(style.paddingBottom)
  const rows = Math.max(1, Math.floor(height / cell.height))
  // Give the sides the same minimum inset as the centered rows.
  const inset = Math.max(0, (parent.clientHeight - rows * cell.height) / 2)
  const width = parent.clientWidth
    - Math.max(inset, pixels(style.paddingLeft))
    - Math.max(inset, pixels(style.paddingRight))
  const cols = Math.max(2, Math.floor(width / cell.width))

  if (terminal.cols === cols && terminal.rows === rows) return

  renderService.clear()
  terminal.resize(cols, rows)
}

function pixels(value: string) {
  return Number.parseFloat(value) || 0
}

interface TerminalInternals extends Terminal {
  _core: {
    _renderService: {
      dimensions: {
        css: {
          cell: {
            width: number
            height: number
          }
        }
      }
      clear(): void
    }
  }
}
