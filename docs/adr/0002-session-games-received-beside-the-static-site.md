# Receive Session Games in a small service beside the static site

The spec asks two things of the VPS that do not fit together as written: it
serves static files only, so its 4 GB and 2 vCores are never the bottleneck,
and it stores finished Session Games in SQLite. A static file server cannot
receive anything, so something has to listen.

The static site stays exactly as it is. Beside it runs one small Python
service, `pipeline/serve_session_games.py`, listening on the local machine
only; the web server passes requests under `/api/` to it. The service never
computes a move. Its work is one write per finished game and one per answer
to the end-of-game question, which is negligible next to serving the Base
Model's file, so the reason for the static-only rule still holds.

## Why Python, and why the standard library

Storing and counting games is data work, which the language boundary gives
to Python. Its standard library carries both an HTTP server and SQLite, so
the service needs nothing beyond python-chess, already a dependency of the
pipeline, to replay a game and write its PGN. Node's built-in SQLite module
was still experimental in the Node release the project uses.

The standard library's HTTP server is not built to face the internet on its
own. It does not have to: it binds to 127.0.0.1, and the web server in front
of it handles TLS, request size limits and rate limiting.

## Consequences

The page reports the moves played, not a PGN. The service replays them, so a
game is stored only if it is legal and finished, and its result is the one
the service computed. An abandoned game is never reported and would be
refused if it were.

No account, cookie or address is stored. The service turns off the request
log the standard library writes by default, which would otherwise record
every visitor's IP address, and the web server's access log is turned off
for `/api/` for the same reason.

The endpoint is public, so anyone can post a legal finished game that was
never played on the site. Replaying refuses nonsense but cannot tell a real
game from a fabricated one. The counts are reported with that limit stated.
