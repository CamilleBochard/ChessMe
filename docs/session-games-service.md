# Running the Session Game service

The site is static, and stays so. Finished Session Games are received by
`pipeline/serve_session_games.py`, which runs beside it on the VPS and is
reached through the reverse proxy under `/api/`. ADR-0002 records why.

## What it stores

One row per finished game in a SQLite file: the date (not the time), which
colour the Bot played, the result, the PGN, and the visitor's answer to the
end-of-game question once given. A second table holds, for each of the Bot's
moves, whether it came from the Opening Book or the Base Model. No account,
cookie or address is stored, and the service's own output names no client.

A game the visitor did not finish is never sent, and the service refuses
one that has not ended. A game the visitor resigned counts as finished: it
is stored as the Bot's win, its PGN marked `[Termination "Visitor resigned"]`.

## On the VPS

The site and the service run as two containers, built from
`docker/web.Dockerfile` and `docker/api.Dockerfile` and published on GHCR by
`.github/workflows/deploy.yml` on every push to master. The VPS
configuration (Compose file, routing, rate limits) lives in the
infrastructure repository, not here.

The service container listens on every interface of the container, so the
reverse proxy can reach it, and publishes no port: the proxy is the only
way in. It runs as an unprivileged user on a read-only filesystem, and
writes its database to a named volume mounted on `/data`.

The reverse proxy (Traefik) does what nginx did in front of a service on
the host:

- requests under `/api/` go to the service, everything else to the site;
- game reports are limited to ten a minute from one address, with a burst
  of five, and a request body to 64 KB;
- `GET /api/session-games/counts` has a limit of its own, thirty a minute
  with a burst of ten, so that a reader who reloads a page showing the
  counts cannot use up the limit their next game report needs;
- no access log is written for `/api/`, since it would record the visitor's
  address. The service keeps its own log, without addresses, in
  `docker logs`.

The rate limits hold addresses in memory only, to count requests.

## Reading the counts

The game page shows the aggregate counts as they stand once a game ends,
and the write-up page whenever it is read, both from
`GET /api/session-games/counts`, which answers them as JSON. Its rate limit
above is separate from the one on game reports: a reader who reloads the
page more than thirty times a minute sees the counts as unavailable, and
can still report the game they play next.

To read them offline, copy the database off the VPS (from the `/data`
volume of the service container) and print the same counts:

```sh
python -m pipeline.report_session_games --database data/session-games.sqlite
```

The stored PGNs are in the `pgn` column of `session_games`, for any analysis
beyond the counts. The endpoint is public, so anyone can post a legal,
finished game that was never played on the site; the counts carry that limit.

## In development

`npm run dev` forwards `/api/` to port 8787. Start the service beside it:

```sh
python -m pipeline.serve_session_games --database data/session-games.sqlite
```

Without it the page plays as usual and the report of the game fails silently.
