# Running the Session Game service

The site is static, and stays so. Finished Session Games are received by
`pipeline/serve_session_games.py`, which runs beside it on the VPS and is
reached through the reverse proxy under `/api/`. ADR-0002 records why.

## What it stores

One row per finished game in a SQLite file: the date (not the time), which
colour the Bot played, the result, the PGN, whether analysis mode was on,
and the ratings the visitor gave once the game was over, on Lichess and on
Chess.com, if they gave any. Games from before the rating was asked may also
hold the visitor's answer to the end-of-game question the page used to ask.
A second table holds, for each of the Bot's moves, whether it came from the
Opening Book or the Base Model. No account, cookie or address is stored, and
the service's own output names no client.

The ratings come from `POST /api/session-games/<id>/ratings`, with
`{"lichess": 1650, "chesscom": null}`: whole numbers from 100 to 3500, at
least one of the two, and only the first answer for a game. It goes through
the same rate limit as game reports. To read them offline:

```sh
python -c "from pipeline.session_games import open_store, visitor_ratings; print(visitor_ratings(open_store('data/session-games.sqlite')))"
```

A game the visitor did not finish is never sent, and the service refuses
one that has not ended. A game the visitor resigned counts as finished: it
is stored as the Bot's win, its PGN marked `[Termination "Visitor resigned"]`.
So does a game in which a clock ran out: the report names the side, which
loses unless the other side could not have mated, in which case it is a
draw, and the PGN is marked `[Termination "Time forfeit"]`. A loss on time
is refused for a game that had already ended on the board.

## On the VPS

The site and the service run as two containers, built from
`docker/web.Dockerfile` and `docker/api.Dockerfile` and published on GHCR by
`.github/workflows/deploy.yml` on every push to master. The VPS
configuration (Compose file, routing, rate limits) lives in the
infrastructure repository, not here. The service image holds the openings
table from `data/openings`, with which the service names the openings of
the Bot's games.

The service container listens on every interface of the container, so the
reverse proxy can reach it, and publishes no port: the proxy is the only
way in. It runs as an unprivileged user on a read-only filesystem, and
writes its database to a named volume mounted on `/data`.

The reverse proxy (Traefik) does what nginx did in front of a service on
the host:

- requests under `/api/` go to the service, everything else to the site;
- game reports are limited to ten a minute from one address, with a burst
  of five, and a request body to 64 KB;
- `GET /api/session-games/counts` and `GET /api/session-games/record` share
  a limit of their own, thirty a minute with a burst of ten, so that a
  reader who reloads a page showing them cannot use up the limit their next
  game report needs;
- no access log is written for `/api/`, since it would record the visitor's
  address. The service keeps its own log, without addresses, in
  `docker logs`.

The rate limits hold addresses in memory only, to count requests.

## Reading the counts

The game page's Bot tab shows the aggregate counts and the Bot's record, read
when the tab is opened and again once a game ends, and the write-up page
shows the counts whenever it is read. They come from
`GET /api/session-games/counts` and `GET /api/session-games/record`, which
answer them as JSON, the record in the shape of Camille's in
`src/record/player-record.json`. Their rate limit above is separate from the
one on game reports: a reader who reloads the page more than thirty times a
minute sees the counts as unavailable, and can still report the game they
play next.

To read them offline, copy the database off the VPS (from the `/data`
volume of the service container) and print the same counts, split in two:
the games played without analysis mode, then the assisted ones, during which
the visitor turned on the engine's evaluation at some point and could see
where the Bot went wrong. The endpoint answers the counts over every game.

```sh
python -m pipeline.report_session_games --database data/session-games.sqlite
```

The stored PGNs are in the `pgn` column of `session_games`. To read them as
evidence about the Bot's Level, run

```sh
scripts/analyse-session-games.sh data/session-games.sqlite
```

which has Stockfish 19 measure each of the Bot's moves at the Blunder
Profile's depth, adds the served model's probability for each, and sets the
games beside the Bot's games against the model at Camille's rating and
beside Camille's own games: how often a game slipped away before move 15,
the average loss per Phase in open positions, and the share of the model's
moves under 1%. Assisted games are left out unless `--include-assisted` is
added. The endpoint is public, so anyone can post a legal,
finished game that was never played on the site; the counts carry that limit.

## In development

`npm run dev` forwards `/api/` to port 8787. Start the service beside it:

```sh
python -m pipeline.serve_session_games --database data/session-games.sqlite
```

Without it the page plays as usual and the report of the game fails silently.
