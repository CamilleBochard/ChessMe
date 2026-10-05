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

# Where a Bot move on the site can come from. The engine falls back to a
# random legal move only when it has no Base Model, and the page never runs
# it that way, so a move from anywhere else means the report is not the
# page's own.
BOT_MOVE_SOURCES = ("opening-book", "base-model")

SCHEMA = """
CREATE TABLE IF NOT EXISTS session_games (
    id TEXT PRIMARY KEY,
    played_on TEXT NOT NULL,
    bot_colour TEXT NOT NULL,
    result TEXT NOT NULL,
    pgn TEXT NOT NULL
);

-- One row per move the Bot played, so where its moves came from can be
-- counted without reading the PGN back.
CREATE TABLE IF NOT EXISTS bot_moves (
    game_id TEXT NOT NULL REFERENCES session_games (id),
    ply INTEGER NOT NULL,
    uci TEXT NOT NULL,
    source TEXT NOT NULL,
    PRIMARY KEY (game_id, ply)
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
    """
    Stores the game the page reported and returns the id it was stored under.
    Raises RejectedGame, storing nothing, when the report is not a finished,
    legal game shaped as the page sends it.
    """
    check_shape(report)

    bot_colour = report.get("botColour")
    if bot_colour not in ("white", "black"):
        raise RejectedGame(f"the Bot's colour {bot_colour} is neither white nor black")
    bot_plays_white = bot_colour == "white"

    board = chess.Board()
    bot_moves = []
    for reported_move in report["moves"]:
        uci = reported_move["uci"]
        try:
            move = chess.Move.from_uci(uci)
        except ValueError:
            raise RejectedGame(f"unreadable move {uci}")
        if not board.is_legal(move):
            raise RejectedGame(f"illegal move {uci}")

        is_bot_move = board.turn == bot_plays_white
        if is_bot_move:
            source = reported_move.get("source")
            if source not in BOT_MOVE_SOURCES:
                raise RejectedGame(f"the Bot's move {uci} came from {source}, not the Opening Book or the Base Model")
            ply = board.ply() + 1
            bot_moves.append((ply, uci, source))
        board.push(move)

    # The page ends a game at the fifty-move rule and at threefold repetition
    # without waiting for a claim, so a claimable draw counts as an ending.
    # A game the visitor walked away from never reaches its end, and is
    # refused here rather than stored half-played.
    if not board.is_game_over(claim_draw=True):
        raise RejectedGame("the game has not ended")

    if bot_plays_white:
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
    result = board.result(claim_draw=True)
    game.headers["Result"] = result
    pgn = str(game)

    game_id = str(uuid.uuid4())
    with connection:
        connection.execute(
            "INSERT INTO session_games (id, played_on, bot_colour, result, pgn) VALUES (?, ?, ?, ?, ?)",
            (game_id, played_on.isoformat(), bot_colour, result, pgn),
        )
        for ply, uci, source in bot_moves:
            connection.execute(
                "INSERT INTO bot_moves (game_id, ply, uci, source) VALUES (?, ?, ?, ?)",
                (game_id, ply, uci, source),
            )
    return game_id


def check_shape(report: object) -> None:
    """
    Raises RejectedGame unless the report has the fields the page sends, of
    the right types. Anyone can send the service a request, so nothing in it
    is assumed until checked.
    """
    if not isinstance(report, dict):
        raise RejectedGame("the report is not an object")

    moves = report.get("moves")
    if not isinstance(moves, list):
        raise RejectedGame("the report has no list of moves")

    for reported_move in moves:
        if not isinstance(reported_move, dict):
            raise RejectedGame("a move is not an object")
        if not isinstance(reported_move.get("uci"), str):
            raise RejectedGame("a move has no UCI name")


def session_game_pgns(connection: sqlite3.Connection) -> list[str]:
    """Every stored game as PGN, oldest first."""
    rows = connection.execute("SELECT pgn FROM session_games ORDER BY rowid").fetchall()
    pgns = [row[0] for row in rows]
    return pgns


def session_game_counts(connection: sqlite3.Connection) -> dict[str, int]:
    """How many games have been stored, how the Bot fared in them, and where its moves came from."""
    games = scalar(connection, "SELECT COUNT(*) FROM session_games")
    bot_wins = scalar(
        connection,
        """SELECT COUNT(*) FROM session_games
           WHERE (result = '1-0' AND bot_colour = 'white') OR (result = '0-1' AND bot_colour = 'black')""",
    )
    bot_losses = scalar(
        connection,
        """SELECT COUNT(*) FROM session_games
           WHERE (result = '1-0' AND bot_colour = 'black') OR (result = '0-1' AND bot_colour = 'white')""",
    )
    draws = scalar(connection, "SELECT COUNT(*) FROM session_games WHERE result = '1/2-1/2'")
    from_opening_book = scalar(connection, "SELECT COUNT(*) FROM bot_moves WHERE source = 'opening-book'")
    from_base_model = scalar(connection, "SELECT COUNT(*) FROM bot_moves WHERE source = 'base-model'")

    counts = {
        "games": games,
        "bot_wins": bot_wins,
        "bot_losses": bot_losses,
        "draws": draws,
        "bot_moves_from_opening_book": from_opening_book,
        "bot_moves_from_base_model": from_base_model,
    }
    return counts


def scalar(connection: sqlite3.Connection, query: str) -> int:
    """The single number a counting query returns."""
    row = connection.execute(query).fetchone()
    return row[0]
