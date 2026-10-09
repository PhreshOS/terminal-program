import { defineConfig } from "@phreshos/core"

export default defineConfig({
  identity: "terminal",
  name: "Terminal",
  description: "Shell sessions that keep running on the machine, shown as tabs, for people and agents.",
  version: "0.4.0",
  // Drawn from icon.svg: an apricot screen, and on its dark soil a prompt whose cursor is a sprout.
  icon: "icon.png",
  categories: ["System", "Development"],
  keywords: ["terminal", "shell", "pty", "command line"],
  website: "https://github.com/PhreshOS/terminal-program",
  agent: "agent.md",
  buildCommand: "vite-node scripts/build.ts",
  // A Terminal window shows a folder in Files through the "files" Service, when one is present.
  permissions: { services: ["files"] },
  // One Server holds every session, in the Process named "terminal", which is the "terminal" Service.
  // Windows are Clients that reach it, so a session outlives the window that showed it.
  server: {
    location: "dist/server",
    start: false,
    service: true,
    worker: "main.js",
    installCommand: "npm install --omit=dev --no-audit && node install.mjs",
    devCommand: "vite-node source/server/main.ts"
  },
  client: {
    location: "dist/client",
    title: "Terminal",
    // The Terminal draws its own header: the sessions sit in the title row, beside the window buttons.
    header: false,
    size: { width: 1040, height: 640 },
    devCommand: "vite --config vite.client.ts"
  }
})
