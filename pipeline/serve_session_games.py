"""Receives the Session Games visitors finish on the site and stores them.

Runs on the VPS beside the static site; the reverse proxy in front of both
passes requests under /api/ to this service.
See docs/adr/0002-session-games-received-beside-the-static-site.md.

    python -m pipeline.serve_session_games --database data/session-games.sqlite [--host 127.0.0.1] [--port 8787]

It names the openings of the Bot's games with the openings table in
data/openings, the one Camille's record is named with.

The service listens on the local machine by default. In a container it
listens on every interface of the container, so the reverse proxy can reach
it; the container itself publishes no port, so the proxy is still the only
thing the internet reaches.
"""

import argparse
import json
import re
import sys
import traceback
from datetime import UTC, datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from pipeline.player_record import OPENINGS_DIR, read_opening_table
from pipeline.session_games import (
    RejectedGame,
    RejectedImpression,
    UnknownGame,
    open_store,
    record_impression,
    record_session_game,
    scalar,
    session_game_counts,
    session_game_record,
)

SESSION_GAMES_PATH = "/api/session-games"

# Where the visitor's end-of-game answer is sent, naming the game by the id
# the service gave it when it was stored.
IMPRESSION_PATH = re.compile(r"/api/session-games/(?P<game_id>[0-9a-f-]{36})/impression")

# What the write-up page reads to show how many games have been played and
# how the Bot fared, as they stand when the page is read.
COUNTS_PATH = "/api/session-games/counts"

# What the game page reads to show the Bot's record beside Camille's.
RECORD_PATH = "/api/session-games/record"

DEFAULT_PORT = 8787

# A long game of 300 moves reports in about 12 KB. A body far beyond that is
# refused unread, so a request cannot make the service hold a large upload
# in memory.
MAX_BODY_BYTES = 64_000


class BadRequest(Exception):
    """A request the service refuses before looking at what it reports."""

    def __init__(self, status: HTTPStatus, reason: str):
        super().__init__(reason)
        self.status = status
        self.reason = reason


def make_server(database: Path, table: dict[str, str], host: str, port: int) -> ThreadingHTTPServer:
    """
    A server, not yet serving, that stores what it receives in the database
    at that path, and names the openings of the Bot's games from table.
    """
    # Working out the record replays every stored game, a few milliseconds
    # each, so it is kept until another game is stored: counting the rows is
    # far cheaper than reading the games.
    kept_record: dict = {"games": None, "record": None}

    class SessionGameHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            if self.path == COUNTS_PATH:
                self.answer_counts()
                return

            if self.path == RECORD_PATH:
                self.answer_record()
                return

            self.reply(HTTPStatus.NOT_FOUND, {"error": "no such endpoint"})

        def do_POST(self) -> None:
            if self.path == SESSION_GAMES_PATH:
                self.receive_game()
                return

            impression_path = IMPRESSION_PATH.fullmatch(self.path)
            if impression_path is not None:
                self.receive_impression(impression_path["game_id"])
                return

            self.reply(HTTPStatus.NOT_FOUND, {"error": "no such endpoint"})

        def answer_counts(self) -> None:
            store = open_store(database)
            try:
                counts = session_game_counts(store)
            finally:
                store.close()

            self.reply(HTTPStatus.OK, counts)

        def answer_record(self) -> None:
            store = open_store(database)
            try:
                stored_games = scalar(store, "SELECT COUNT(*) FROM session_games")
                if kept_record["games"] != stored_games:
                    kept_record["record"] = session_game_record(store, table)
                    kept_record["games"] = stored_games
                record = kept_record["record"]
            finally:
                store.close()

            self.reply(HTTPStatus.OK, record)

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

        def receive_impression(self, game_id: str) -> None:
            try:
                answer = self.read_json_body()
            except BadRequest as problem:
                self.reply(problem.status, {"error": problem.reason})
                return

            felt_like_a_real_player = None
            if isinstance(answer, dict):
                felt_like_a_real_player = answer.get("feltLikeARealPlayer")
            if not isinstance(felt_like_a_real_player, bool):
                self.reply(HTTPStatus.BAD_REQUEST, {"error": "the answer is neither yes nor no"})
                return

            store = open_store(database)
            try:
                record_impression(store, game_id, felt_like_a_real_player=felt_like_a_real_player)
            except UnknownGame as rejection:
                self.reply(HTTPStatus.NOT_FOUND, {"error": str(rejection)})
                return
            except RejectedImpression as rejection:
                self.reply(HTTPStatus.CONFLICT, {"error": str(rejection)})
                return
            finally:
                store.close()

            self.reply(HTTPStatus.NO_CONTENT, None)

        def read_json_body(self) -> object:
            """The request's body as JSON. Raises BadRequest when there is none to read."""
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                raise BadRequest(HTTPStatus.BAD_REQUEST, "the body's length is not a number")
            if length < 0:
                raise BadRequest(HTTPStatus.BAD_REQUEST, "the body's length is negative")
            if length > MAX_BODY_BYTES:
                # The body is left unread, so the connection cannot be reused.
                self.close_connection = True
                raise BadRequest(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "the body is too large")

            raw = self.rfile.read(length)
            try:
                return json.loads(raw)
            except ValueError:
                raise BadRequest(HTTPStatus.BAD_REQUEST, "the body is not JSON")

        def log_message(self, format: str, *args) -> None:
            # The standard handler starts every line with the client's address.
            # The line is kept for following what the service does, and the
            # address is left out, since no visitor's address is stored.
            sys.stderr.write(format % args + "\n")

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

    server = AddressFreeServer((host, port), SessionGameHandler)
    return server


class AddressFreeServer(ThreadingHTTPServer):
    """A server whose report of a failed request leaves out who sent it."""

    def handle_error(self, request, client_address) -> None:
        traceback.print_exc()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Receive and store the Session Games finished on the site.")
    parser.add_argument("--database", type=Path, required=True, help="the SQLite file the games are stored in")
    parser.add_argument("--host", default="127.0.0.1", help="address to listen on (default 127.0.0.1)")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"port to listen on (default {DEFAULT_PORT})")
    arguments = parser.parse_args()

    # Read once, as the service starts: the table is a few thousand lines.
    table = read_opening_table(OPENINGS_DIR)
    server = make_server(arguments.database, table, host=arguments.host, port=arguments.port)
    print(f"Storing Session Games in {arguments.database}, listening on {arguments.host}:{arguments.port}")
    server.serve_forever()
