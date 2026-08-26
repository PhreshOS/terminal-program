import { chmod } from "node:fs/promises"
import { join } from "node:path"

if (process.platform === "darwin") {
  const candidates = [
    join("node_modules", "node-pty", "prebuilds", `${process.platform}-${process.arch}`, "spawn-helper"),
    join("node_modules", "node-pty", "build", "Release", "spawn-helper")
  ]
  let prepared = false

  for (const candidate of candidates) {
    try {
      await chmod(candidate, 0o755)
      prepared = true
    } catch (error) {
      if (error?.code !== "ENOENT") throw error
    }
  }

  if (!prepared) throw new Error(`node-pty did not install a spawn helper for darwin-${process.arch}`)
}

await import("node-pty")
