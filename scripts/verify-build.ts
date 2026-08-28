import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import config from "../phresh.config"
import manifest from "../package.json" with { type: "json" }

assert.equal(config.identity, "terminal")
assert.equal(config.version, manifest.version)
assert.equal(config.server?.start, false)
assert.equal(config.server?.entryFile, "main.js")
assert.equal(config.server?.installCommand, "npm install --omit=dev && node install.mjs")
assert.equal(config.client?.location, "dist/client")
assert(readFileSync("dist/client/index.html", "utf8").length > 0)
assert(readFileSync("dist/server/main.js", "utf8").length > 0)
assert(readFileSync("dist/server/install.mjs", "utf8").length > 0)
assert.deepEqual(JSON.parse(readFileSync("dist/server/package.json", "utf8")), {
  type: "module",
  dependencies: { "node-pty": manifest.dependencies["node-pty"] }
})
