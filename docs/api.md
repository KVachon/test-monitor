# HTTP API

Everything the page shows comes from these endpoints, so you can build on them: a menu bar indicator, a chat notification, a status light. They're stable from 0.1: new fields may appear, existing ones won't change meaning.

## Who can call what

| Request | From this machine | From elsewhere |
| --- | --- | --- |
| `POST /api/events` | Token | Token |
| `GET` anything else | Open | Token (or the sign-in cookie; on the local network, open with `--lan-view`) |
| `GET /healthz`, `/fonts/*` | Open | Open |

Send the token as `Authorization: Bearer <token>`. `?token=<token>` also works, but it ends up in logs, so prefer the header. Requests that came through a proxy or tunnel (they carry `X-Forwarded-For`, `Forwarded` or `CF-Connecting-IP`) always count as "from elsewhere".

## Endpoints

### `POST /api/events`

Body: a JSON array of [events](events.md), one event, or JSON lines (8 MB at most). Answers `{"accepted": 5, "errors": []}`; bad events are listed in `errors` and the good ones are still kept.

### `GET /api/runs`

The newest runs first: `{"runs": [...], "total": 42, "projects": ["my-app", ...]}`. Each run has `id`, `project`, `command`, `host`, `started` and `ended` (ms since the epoch; `ended` is 0 while running), `status` (`pass`, `fail`, `stopped`, or empty while running), `counts` (`pass`, `fail`, `skip`, `flaky`) and `durationMs`.

Query: `?project=` narrows it; `?limit=` (default 50).

### `GET /api/runs/<id>`

One run: `{"meta": {...}, "events": [...], "previous": {...} | null, "serverNow": 1700000000000}`. `events` have KurTest's time `t` and a sequence number `seq`. `previous` summarises the last finished run of the same project and command (its suites, tests and duration), which the page uses to lay itself out and estimate time left.

### `GET /api/history`

Per-feature results across recent runs of one project: `{"project", "runs": [...], "features": [{"suite", "label", "group", "name", "cells": [...]}]}`. Query: `?project=` (default: the project of the newest run), `?limit=` runs (default 20, up to 60).

### `GET /api/stream`

[Server-sent events](https://developer.mozilla.org/docs/Web/API/Server-sent_events). The first message is `event: hello` with `{"serverNow", "latest"}` (the id of the running run, or the newest one). After that, every stored event arrives as a plain `data:` message, the same objects as in `/api/runs/<id>`. A comment line every 15 seconds keeps the connection open.

```js
const es = new EventSource('http://localhost:7357/api/stream');
es.onmessage = m => {
  const ev = JSON.parse(m.data);
  if (ev.type === 'run-end') console.log(ev.run, ev.status);
};
```

### `GET /healthz`

`{"ok": true}`.

KurTest keeps the last 300 runs.
