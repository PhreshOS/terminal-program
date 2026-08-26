import { externalDependencies } from "@/vite.config"
import packageConfig from "@/package.json"
import { copyFile, rm, writeFile } from "node:fs/promises"

process.env.NODE_ENV = "production"

await rm("dist", { recursive: true, force: true })

const { build } = await import("vite")
const dependencies: Partial<typeof packageConfig.dependencies> = {}

for (const dependency of externalDependencies) dependencies[dependency] = packageConfig.dependencies[dependency]

await build({ configFile: "vite.config.ts", ssr: { noExternal: true } })
await build({ configFile: "vite.client.ts" })
await writeFile("dist/server/package.json", JSON.stringify({ type: "module", dependencies }))
await copyFile("scripts/prepare-node-pty.mjs", "dist/server/install.mjs")
