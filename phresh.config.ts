import { defineConfig } from "@phreshos/core"

export default defineConfig({
  identity: "terminal",
  name: "Terminal",
  description: "A shared real PTY terminal for people and agents.",
  version: "0.1.8",
  icon: "icon.png",
  categories: ["System", "Development"],
  keywords: ["terminal", "shell", "pty", "command line"],
  website: "https://github.com/PhreshOS/terminal-program",
  agent: "agent.md",
  buildCommand: "vite-node scripts/build.ts",
  server: {
    location: "dist/server",
    start: false,
    entryFile: "main.js",
    installCommand: "npm install --omit=dev && node install.mjs",
    development: {
      startCommand: "vite-node source/server/main.ts"
    }
  },
  client: {
    location: "dist/client",
    title: "Terminal",
    size: { width: 820, height: 540 },
    development: {
      url: "http://localhost:5280/",
      startCommand: "vite --config vite.client.ts"
    }
  }
})
