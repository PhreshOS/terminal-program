# Terminal

Terminal runs shell sessions on the machine and shows them as tabs. A session
belongs to the window that started it, and ends when that window closes.

Every session lives in one Server: the Process named `terminal`, Server only,
which is also the `terminal` Service. It starts with the System. Terminal
windows are Client-only Processes that reach it.

Reach it with:

```sh
phresh endpoint ask --program terminal --process terminal --endpoint server --event sessions.list --json
```

Never start another Server, and never give a window Process a Server.

## Work in a session

1. `sessions.list` returns every session: `{ session, title, shell, cwd, cols,
   rows, state, createdAt, window }`. `window` is the identity of the window
   Process it belongs to. `state` is `running`
   while a command runs in front, `idle` while the shell waits.
2. Type with `session.write` `{ session, data }`. End a command line with `\r`.
3. Read the screen with `session.text` `{ session }`: the whole screen and its
   scrollback as plain text, without control sequences.

For output in order, `session.read` `{ session, after?, limit? }` returns
`{ output: [{ sequence, data }], truncated, more }` from the recent output the
session keeps (2 MB). `truncated` means some output after `after` is no longer
kept. Continue from the last `sequence`.

## Open a window

`session.open` `{ cwd, position? }` opens a new Terminal window whose first
session starts in `cwd`, an absolute folder. `position` is `{ x, y }` on the
Desktop's plane; without it the System places the window.

Prefer a session someone already sees, or open one with `session.open`, so the
owner sees what you do.

## Other questions

| Event | Payload | Does |
| --- | --- | --- |
| `session.close` | `{ session }` | Ends the shell |
| `session.resize` | `{ session, cols, rows }` | Resizes the shell and its screen |

`session.create`, `session.watch`, `session.unwatch`, and `session.acknowledge`
belong to Terminal windows.

## Publications

- `sessions.changed`: the whole list, whenever a session starts, ends, or
  changes its title or state.
- `output.<session>`: `{ sequence, data }`, that session's output in order.

Sessions live in the Server's memory: when it ends, or the System restarts,
every shell ends with it.
