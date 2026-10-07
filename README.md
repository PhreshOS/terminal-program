# Terminal

The PhreshOS Program for shell sessions on the machine, shown as tabs.

[Programs](https://docs.phreshos.com/runtime/programs) ·
[Communication](https://docs.phreshos.com/runtime/communication) ·
[Source](https://github.com/PhreshOS/terminal-program)

## Role

Terminal runs shells on the machine through `node-pty` and shows them with
xterm.js. Every session lives in one Server, the `terminal` Service, which
starts with the System; windows are Clients that show their own sessions. A
session belongs to the window that started it: "+" starts another, and closing
the window ends them.

The Server keeps each session's screen in a headless terminal, so a window
takes it as it is, then follows its output in numbered batches. A shell that
writes faster than the window draws waits for it.

Other Programs reach Terminal through the `terminal` Service, such as Files
opening a folder in it; Terminal shows a folder in Files through the `files`
Service, when a Program offers it. Agents use the same Service:
[`agent.md`](agent.md) describes it.

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

`verify` checks the types, builds both Endpoints, and tests the sessions.

`check` performs static checks, `build` creates distributable output, and `test`
runs Vitest assertions from `tests/`. Run `build` before testing built artifacts.
`verify` runs `check`, `build`, and `test` in order. Operational tooling belongs
in `scripts/`; tests and their fixtures belong in `tests/`. Verification uses
the committed dependency graph without local package substitutions.

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
