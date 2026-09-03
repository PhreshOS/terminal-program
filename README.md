# Terminal

The PhreshOS Program for real host PTY sessions.

[Programs](https://docs.phreshos.com/runtime/programs) ·
[Communication](https://docs.phreshos.com/runtime/communication) ·
[Source](https://github.com/PhreshOS/terminal-program)

## Role

Terminal exposes host PTY sessions to people and other Programs through the
standard Program boundary. Its Server owns Sessions, PTY processes, input,
resizing, and authoritative output history; its Client renders and interacts
with those Sessions through xterm.js.

Shell execution remains inside the Server Endpoint. The Desktop owns only the
Window representing the Client, and a Client-lifecycle Session closes with its
associated Client Endpoint.

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

Build, run the production definition, or package a release with:

```sh
bun run build
bun run start
bun run pack
```

`verify` checks the PTY contract, builds both Endpoints, and validates the
production Program artifact.

## Related repositories

- [PhreshOS System](https://github.com/PhreshOS/system) owns Endpoint execution
  and the Desktop Window hosting Terminal.
- [`@phreshos/core`](https://github.com/PhreshOS/core) owns the Program,
  Endpoint, and communication contracts.
- [`@phreshos/client`](https://github.com/PhreshOS/client) and
  [`@phreshos/server`](https://github.com/PhreshOS/server) provide Terminal's
  runtime boundaries.
- [`@phreshos/cli`](https://github.com/PhreshOS/cli) installs, runs, and packages
  Terminal through the ordinary Program workflow.

## License

Licensed under the [MIT License](LICENSE). Copyright © 2026 Zohayr SLILEH.
