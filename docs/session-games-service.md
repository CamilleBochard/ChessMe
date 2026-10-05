# Running the Session Game service

The site is static, and stays so. Finished Session Games are received by
`pipeline/serve_session_games.py`, which runs beside it on the VPS and is
reached through the web server under `/api/`. ADR-0002 records why.

## What it stores

One row per finished game in a SQLite file: the date (not the time), which
colour the Bot played, the result, the PGN, and the visitor's answer to the
end-of-game question once given. A second table holds, for each of the Bot's
moves, whether it came from the Opening Book or the Base Model. No account,
cookie or address is stored, and the service's own output names no client.

A game the visitor did not finish is never sent, and the service refuses
one that has not ended.

## On the VPS

The service needs Python 3.12 and python-chess, installed from this
repository with `pip install .` in a virtual environment. It listens on
127.0.0.1 only, and creates its database on the first request, in a
directory the service's user must be able to write:

```sh
sudo install -d -o chessme -g chessme /srv/chessme/data
```

A systemd unit, for instance `/etc/systemd/system/chessme-session-games.service`:

```ini
[Unit]
Description=ChessMe Session Game service
After=network.target

[Service]
User=chessme
WorkingDirectory=/srv/chessme
ExecStart=/srv/chessme/.venv/bin/python -m pipeline.serve_session_games --database /srv/chessme/data/session-games.sqlite --port 8787
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

In the nginx server block that serves the site:

```nginx
# Ten reports a minute from one address is far more than a person playing.
# The zone holds addresses in memory only, to count requests; nothing is
# written to disk.
limit_req_zone $binary_remote_addr zone=session_games:1m rate=10r/m;

location /api/ {
    # No access log, and no error log: both record the visitor's address,
    # the error log for each request the rate limit turns away and each one
    # that fails while the service is down. The service keeps its own log,
    # without addresses, in the system journal.
    access_log off;
    error_log /dev/null;
    limit_req zone=session_games burst=5 nodelay;
    client_max_body_size 64k;
    proxy_pass http://127.0.0.1:8787;
}
```

`limit_req_zone` belongs in the `http` block, outside the server block.

## Reading the counts

Copy the database off the VPS, then print the aggregate counts as JSON:

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
