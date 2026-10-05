"""Receives the Session Games visitors finish on the site and stores them.

Runs on the VPS beside the static site, which the web server keeps serving
on its own; the web server passes requests under /api/ to this service.
See docs/adr/0002-session-games-received-beside-the-static-site.md.

    python -m pipeline.serve_session_games --database data/session-games.sqlite [--port 8787]

The service listens on the local machine only: the web server in front of
it is what the internet reaches.
"""

import argparse
import json
from datetime import UTC, datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from pipeline.session_games import RejectedGame, open_store, record_session_game

SESSION_GAMES_PATH = "/api/session-games"

DEFAULT_PORT = 8787


class BadRequest(Exception):
    """A request the service refuses before looking at what it reports."""

    def __init__(self, status: HTTPStatus, reason: str):
        super().__init__(reason)
        self.status = status
        self.reason = reason


def make_server(database: Path, host: str, port: int) -> ThreadingHTTPServer:
    """A server, not yet serving, that stores what it receives in the database at that path."""

    class SessionGameHandler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:
            if self.path == SESSION_GAMES_PATH:
                self.receive_game()
                return
            self.reply(HTTPStatus.NOT_FOUND, {"error": "no such endpoint"})

        def receive_game(self) -> None:
            try:
                report = self.read_json_body()
            except BadRequest as problem:
                self.reply(problem.status, {"error": problem.reason})
                return
            played_on = datetime.now(UTC).date()

            store = open_store(database)
            try:
                game_id = record_session_game(store, report, played_on=played_on)
            except RejectedGame as rejection:
                self.reply(HTTPStatus.BAD_REQUEST, {"error": str(rejection)})
                return
            finally:
                store.close()

            self.reply(HTTPStatus.CREATED, {"id": game_id})

        def read_json_body(self) -> object:
            """The request's body as JSON. Raises BadRequest when there is none to read."""
            raw = self.rfile.read(int(self.headers.get("Content-Length", "0")))
            try:
                return json.loads(raw)
            except ValueError:
                raise BadRequest(HTTPStatus.BAD_REQUEST, "the body is not JSON")

        def reply(self, status: HTTPStatus, body: dict | None) -> None:
            self.send_response(status)
            if body is None:
                self.send_header("Content-Length", "0")
                self.end_headers()
                return

            encoded = json.dumps(body).encode("utf-8")
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

    server = ThreadingHTTPServer((host, port), SessionGameHandler)
    return server


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Receive and store the Session Games finished on the site.")
    parser.add_argument("--database", type=Path, required=True, help="the SQLite file the games are stored in")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"local port to listen on (default {DEFAULT_PORT})")
    arguments = parser.parse_args()

    server = make_server(arguments.database, host="127.0.0.1", port=arguments.port)
    print(f"Storing Session Games in {arguments.database}, listening on 127.0.0.1:{arguments.port}")
    server.serve_forever()
