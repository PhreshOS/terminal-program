# Terminal

Terminal provides real interactive shell sessions shared by people and agents.

The Program has one long-lived Server Process named `terminal-server`. Terminal
windows are ordinary Client-only Processes that attach to sessions owned by that
Server. A session is created without running an initial command beyond the
configured shell startup.

## Operating policy

`terminal-server` is the only valid Terminal Server Process. It is Server-only.
Never start a Server endpoint on a Terminal window's Client Process.

Process launch properties inherit Program defaults when omitted. Therefore,
always select both Endpoint kinds explicitly.

Create or resolve the shared Server with this exact topology:

```json
{
  "action": "findOrCreate",
  "program": "terminal",
  "launch": {
    "name": "terminal-server",
    "server": true,
    "client": false
  }
}
```

Create a visible Terminal window as a separate Client-only Process:

```json
{
  "action": "create",
  "program": "terminal",
  "launch": {
    "server": false,
    "client": true
  }
}
```

Never create `terminal-server` with `client` omitted: Terminal's Client default
would be inherited, the Process would contain both Endpoints, and the Server
would deliberately stop because that topology is invalid.

The Runtime `shell` Tool is for independent non-interactive background
commands. When the user asks to work in a visible Terminal, use this Program's
Client-owned session instead.

To use a Terminal window that is already visible:

1. Identify that Terminal Client Process.
2. Find the `terminal-server` Process.
3. Ask its Server for `session.list` with
   `{ client: "<Terminal Client Process identity>", lifecycle: "client", limit: 1 }`.
4. Use the returned session for `session.write`, `session.read`, or
   `session.snapshot`.

If its session is not present yet, observe `session.changed` from
`terminal-server` and select the session whose `client` equals the visible
Client Process identity. Do not create another Server. Do not create an
explicit session when the requested destination is an existing visible
Terminal window.

Explicit sessions are for headless work. To make one visible, create a Terminal
Client Process with its immutable `session` option set to the explicit session
identity.

## Session lifecycles

- `client`: tied to the Client that creates or attaches it. Closing that Client
  closes the session.
- `explicit`: independent of any Client. It remains alive until `session.close`
  is requested or its shell exits.

## Server events

### `session.create`

Payload: `{ request, lifecycle, cols?, rows?, cwd?, shell? }`. `request` is a
caller-generated correlation string.

Returns only an acknowledgment. The authoritative session is published through
`session.changed` with the same `request` value. Begin observing that publication
before requesting creation. When the surrounding runtime supports concurrent
tool calls, start the event wait and `session.create` in the same turn; a
publication emitted before observation is not replayed.

For `client` lifecycle, creation is idempotent by Client Process: every desktop
representing that same Client receives the same session rather than creating a
second PTY.

### `session.list`

Payload: `{ limit?, cursor?, lifecycle?, client?, status? }`. `client` is a
Terminal Client Process identity and returns only the session owned by that
Client.

Returns a bounded page ordered from newest to oldest. Use `nextCursor` to
continue. Never assume the first page contains every session.

### `session.read`

Payload: `{ session, after?, limit? }`.

Returns the current session metadata and a bounded sequence of output chunks.

### `session.snapshot`

Payload: `{ session }`.

Returns a serialized terminal screen and the output sequence represented by it.

### `session.attach`

Payload: `{ session }`. Attaches the calling Client to the session. Returns an
acknowledgment and publishes the changed session.

### `session.write`

Payload: `{ session, data }`. Writes UTF-8 text or terminal control sequences to
the PTY input. Returns an acknowledgment.

### `session.resize`

Payload: `{ session, cols, rows }`. Resizes both the PTY and terminal model.

### `session.signal`

Payload: `{ session, signal }`, where signal is `SIGINT`, `SIGTERM`, `SIGHUP`,
or `SIGKILL`.

### `session.close`

Payload: `{ session }`. Terminates the PTY and removes the session.

## Publications

- `session.changed`: `{ session, request? }`, containing complete current
  metadata and the creation correlation when applicable. Session metadata
  includes `client`, the owning Client Process identity for a client-lifecycle
  session, or `null` for an explicit session.
- `session.removed`: `{ session }` after a session is no longer available.
- `terminal.output`: ordered `{ session, sequence, data }` PTY output.

Output is live and may be missed while disconnected. Use `session.snapshot` to
establish a baseline, then consume only output with a greater sequence. If a
sequence gap is detected, request a fresh snapshot.

A live PTY cannot survive a Terminal Server restart. Explicit sessions are
long-lived within one Server incarnation, not persisted shell processes.
