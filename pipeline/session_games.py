"""Stores the Session Games visitors finish on the site, and counts them.

The page reports a game as the list of moves played, each of the Bot's moves
marked with where it came from. The store replays the moves itself and writes
the PGN from the replay, so what is kept is a legal game whose result was
worked out here rather than taken on trust from whoever sent it.

Nothing about the visitor is stored: no account, no address, not even the
time of day, only the date the game was played.
"""

import sqlite3
import uuid
from datetime import date
from pathlib import Path

import chess
import chess.pgn

BOT_NAME = "ChessMe Bot"
VISITOR_NAME = "Visitor"

SCHEMA = """
CREATE TABLE IF NOT EXISTS session_games (
    id TEXT PRIMARY KEY,
    played_on TEXT NOT NULL,
    pgn TEXT NOT NULL
);
"""


class RejectedGame(ValueError):
    """The page's report is not a finished game that can be stored."""


def open_store(path: Path) -> sqlite3.Connection:
    """Opens the database at path, creating it and its tables if needed."""
    connection = sqlite3.connect(path)
    connection.executescript(SCHEMA)
    return connection


def record_session_game(connection: sqlite3.Connection, report: dict, played_on: date) -> str:
    """Stores the game the page reported and returns the id it was stored under."""
    board = chess.Board()
    for reported_move in report["moves"]:
        uci = reported_move["uci"]
        try:
            move = chess.Move.from_uci(uci)
        except ValueError:
            raise RejectedGame(f"unreadable move {uci}")
        if not board.is_legal(move):
            raise RejectedGame(f"illegal move {uci}")
        board.push(move)

    # The page ends a game at the fifty-move rule and at threefold repetition
    # without waiting for a claim, so a claimable draw counts as an ending.
    # A game the visitor walked away from never reaches its end, and is
    # refused here rather than stored half-played.
    if not board.is_game_over(claim_draw=True):
        raise RejectedGame("the game has not ended")

    bot_colour = report["botColour"]
    if bot_colour == "white":
        white_player = BOT_NAME
        black_player = VISITOR_NAME
    else:
        white_player = VISITOR_NAME
        black_player = BOT_NAME

    game = chess.pgn.Game.from_board(board)
    game.headers["Event"] = "ChessMe Session Game"
    game.headers["Site"] = "ChessMe"
    game.headers["Date"] = played_on.strftime("%Y.%m.%d")
    game.headers["White"] = white_player
    game.headers["Black"] = black_player
    game.headers["Result"] = board.result(claim_draw=True)
    pgn = str(game)

    game_id = str(uuid.uuid4())
    with connection:
        connection.execute(
            "INSERT INTO session_games (id, played_on, pgn) VALUES (?, ?, ?)",
            (game_id, played_on.isoformat(), pgn),
        )
    return game_id


def session_game_pgns(connection: sqlite3.Connection) -> list[str]:
    """Every stored game as PGN, oldest first."""
    rows = connection.execute("SELECT pgn FROM session_games ORDER BY rowid").fetchall()
    pgns = [row[0] for row in rows]
    return pgns
