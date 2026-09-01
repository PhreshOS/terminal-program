# Terminal

The official PhreshOS terminal Program.

Terminal provides real host PTY sessions to people and agents through the
standard Program boundary.

## Model

The Server owns terminal Sessions, PTY processes, input, resizing, and
authoritative output history. Client Windows render and interact with those
Sessions through xterm.js.

The browser uses the WebGL renderer when available and retains the DOM renderer
as its fallback. A Client-lifecycle Session and its associated Client Endpoint
close together in either direction.

## Installation

```sh
phresh install terminal --run
```

Installation prepares the native `node-pty` dependency for the host machine.

## Development

```sh
bun install --frozen-lockfile
bun run verify
bun run dev
```

Build, attach the production definition, or package a release with:

```sh
bun run build
bun run start
bun run pack
```

`verify` checks the PTY contract, builds both Endpoints, and validates the
production Program artifact.

## Repository boundary

This repository owns terminal Sessions and their Client representation. Shell
execution remains inside the Server Endpoint; the desktop owns only the Window
that represents its Client.

## License

Licensed under the [MIT License](LICENSE). Copyright © 2026 Zohayr SLILEH.
