"""Stores the Session Games visitors finish on the site, and counts them.

The page reports a game as the list of moves played, each of the Bot's moves
marked with where it came from. The store replays the moves itself and writes
the PGN from the replay, so what is kept is a legal game whose result was
worked out here rather than taken on trust from whoever sent it.

Nothing that identifies the visitor is stored: no account, no address, not
even the time of day, only the date the game was played. The visitor may
give their rating on Lichess or Chess.com once the game is over, which is
kept with the game and says nothing about who they are.
"""

import io
import re
import sqlite3
import uuid
from datetime import date
from pathlib import Path

import chess
import chess.pgn

from pipeline.player_record import player_record

BOT_NAME = "ChessMe Bot"
VISITOR_NAME = "Visitor"

# Where a Bot move on the site can come from. The engine falls back to a
# random legal move only when it has no Base Model, and the page never runs
# it that way, so a move from anywhere else means the report is not the
# page's own.
OPENING_BOOK = "opening-book"
BASE_MODEL = "base-model"
BOT_MOVE_SOURCES = (OPENING_BOOK, BASE_MODEL)

# The Base Model is named after its file, such as maia3-5m-f9725c961e03. Anything else is
# refused, so that no text a sender chooses ends up in a PGN header.
BASE_MODEL_NAME = re.compile(r"[a-z0-9][a-z0-9._-]{0,63}")

SCHEMA = """
CREATE TABLE IF NOT EXISTS session_games (
    id TEXT PRIMARY KEY,
    played_on TEXT NOT NULL,
    bot_colour TEXT NOT NULL,
    result TEXT NOT NULL,
    pgn TEXT NOT NULL,
    -- The visitor's answer to "did it feel like a real player at that
    -- level?": 1 for yes, 0 for no, NULL until they answer, which they may
    -- never do.
    felt_like_a_real_player INTEGER,
    -- 1 when analysis mode was on at any point during the game: an engine's
    -- evaluation showed the visitor where the Bot went wrong.
    assisted INTEGER NOT NULL DEFAULT 0,
    -- The ratings the visitor gave once the game was over, on Lichess and
    -- on Chess.com, NULL for one they left out or until they answer.
    visitor_lichess_rating INTEGER,
    visitor_chesscom_rating INTEGER
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


# The ratings a player can have on Lichess or Chess.com, from Chess.com's
# floor of 100 to above the best player's on either site. A figure outside
# them is a typing mistake, not a rating.
LOWEST_RATING = 100
HIGHEST_RATING = 3500


class RejectedGame(ValueError):
    """The page's report is not a finished game that can be stored."""


class RejectedImpression(ValueError):
    """The visitor's impression cannot be recorded for that game."""


class RejectedRatings(ValueError):
    """The ratings the visitor gave cannot be recorded for that game."""


class RatingsAlreadyGiven(RejectedRatings):
    """The visitor has already given ratings for that game."""


class UnknownGame(RejectedImpression, RejectedRatings):
    """No game is stored under the id the impression names."""


# The columns added to session_games since it was first made, with their
# definitions. Creating the tables leaves an existing one as it was, so a
# store made before them is given them as it is opened.
LATER_COLUMNS = {
    # Every game stored before analysis mode existed was played without it.
    "assisted": "INTEGER NOT NULL DEFAULT 0",
    # No rating was asked before.
    "visitor_lichess_rating": "INTEGER",
    "visitor_chesscom_rating": "INTEGER",
}


def open_store(path: Path) -> sqlite3.Connection:
    """Opens the database at path, creating it and its tables if needed."""
    connection = sqlite3.connect(path)
    connection.executescript(SCHEMA)
    add_later_columns(connection)
    return connection


def add_later_columns(connection: sqlite3.Connection) -> None:
    """Gives a store made before some of its columns existed the ones it lacks."""
    columns = connection.execute("PRAGMA table_info(session_games)").fetchall()
    column_names = [column[1] for column in columns]
    with connection:
        for name, definition in LATER_COLUMNS.items():
            if name not in column_names:
                connection.execute(f"ALTER TABLE session_games ADD COLUMN {name} {definition}")


def record_session_game(connection: sqlite3.Connection, report: dict, played_on: date) -> str:
    """
    Stores the game the page reported and returns the id it was stored under.
    A game is finished when it ended on the board, when the visitor resigned
    it, or when a clock ran out. Raises RejectedGame, storing nothing, when
    the report is not a finished, legal game shaped as the page sends it.
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

    visitor_resigned = report.get("visitorResigned", False)
    timed_out = report.get("timedOut")
    has_ended_on_the_board = has_ended_as_the_page_ends_it(board)
    if timed_out is not None:
        if has_ended_on_the_board:
            raise RejectedGame("the game had already ended when a clock ran out")
        # Only the side to move has its clock running, so only it can run
        # out of time.
        side_out_of_time = chess.WHITE
        if timed_out == "black":
            side_out_of_time = chess.BLACK
        if board.turn != side_out_of_time:
            raise RejectedGame(f"{timed_out} ran out of time while not to move")
        # The side whose clock ran out loses to an opponent who could still
        # mate, and draws against one who never could, as the page decides it.
        opponent = not side_out_of_time
        if board.has_insufficient_material(opponent):
            result = "1/2-1/2"
        elif opponent == chess.WHITE:
            result = "1-0"
        else:
            result = "0-1"
    elif visitor_resigned:
        if has_ended_on_the_board:
            raise RejectedGame("the game had already ended when the visitor resigned")
        # The Bot never resigns, so a resignation is always the Bot's win.
        if bot_plays_white:
            result = "1-0"
        else:
            result = "0-1"
    else:
        # A game the visitor walked away from never reaches its end, and is
        # refused here rather than stored half-played.
        if not has_ended_on_the_board:
            raise RejectedGame("the game has not ended")
        result = board.result(claim_draw=True)

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
    game.headers["Result"] = result
    if visitor_resigned:
        game.headers["Termination"] = "Visitor resigned"
    if timed_out is not None:
        game.headers["Termination"] = "Time forfeit"
    # The served Base Model may change, and its games must not be mixed with
    # the next one's without anyone noticing.
    game.headers["BaseModel"] = report["baseModel"]
    game.headers["BaseModelRating"] = str(report["rating"])
    pgn = str(game)

    # A page from before analysis mode sends nothing, and was never assisted.
    assisted = report.get("assisted", False)

    game_id = str(uuid.uuid4())
    with connection:
        connection.execute(
            "INSERT INTO session_games (id, played_on, bot_colour, result, pgn, assisted) VALUES (?, ?, ?, ?, ?, ?)",
            (game_id, played_on.isoformat(), bot_colour, result, pgn, assisted),
        )
        for ply, uci, source in bot_moves:
            connection.execute(
                "INSERT INTO bot_moves (game_id, ply, uci, source) VALUES (?, ?, ?, ?)",
                (game_id, ply, uci, source),
            )
    return game_id


def record_impression(connection: sqlite3.Connection, game_id: str, felt_like_a_real_player: bool) -> None:
    """
    Records the visitor's answer to whether the Bot felt like a real player at
    that level. Only the first answer for a game counts: a second one is
    refused rather than allowed to overwrite it.
    """
    with connection:
        updated = connection.execute(
            "UPDATE session_games SET felt_like_a_real_player = ? WHERE id = ? AND felt_like_a_real_player IS NULL",
            (felt_like_a_real_player, game_id),
        )
    if updated.rowcount == 1:
        return

    stored = connection.execute("SELECT 1 FROM session_games WHERE id = ?", (game_id,)).fetchone()
    if stored is None:
        raise UnknownGame(f"there is no game {game_id}")
    raise RejectedImpression("the game has already been given an impression")


def record_visitor_ratings(
    connection: sqlite3.Connection, game_id: str, lichess: int | None, chesscom: int | None
) -> None:
    """
    Records the ratings the visitor gave for that game, None for one they
    left out. Raises RejectedRatings, recording nothing, unless at least one
    is given and each is a whole number in the range of real ratings.
    """
    if lichess is None and chesscom is None:
        raise RejectedRatings("the answer gives no rating")
    for site, rating in (("Lichess", lichess), ("Chess.com", chesscom)):
        if rating is None:
            continue
        # bool is a kind of int in Python, and true is no rating.
        if not isinstance(rating, int) or isinstance(rating, bool):
            raise RejectedRatings(f"the {site} rating is not a whole number")
        if not LOWEST_RATING <= rating <= HIGHEST_RATING:
            raise RejectedRatings(f"the {site} rating {rating} is outside {LOWEST_RATING} to {HIGHEST_RATING}")

    # Only the first answer for a game counts: a second one is refused
    # rather than allowed to overwrite it.
    with connection:
        updated = connection.execute(
            """UPDATE session_games SET visitor_lichess_rating = ?, visitor_chesscom_rating = ?
               WHERE id = ? AND visitor_lichess_rating IS NULL AND visitor_chesscom_rating IS NULL""",
            (lichess, chesscom, game_id),
        )
    if updated.rowcount == 1:
        return

    stored = connection.execute("SELECT 1 FROM session_games WHERE id = ?", (game_id,)).fetchone()
    if stored is None:
        raise UnknownGame(f"there is no game {game_id}")
    raise RatingsAlreadyGiven("the game has already been given ratings")


def visitor_ratings(connection: sqlite3.Connection) -> list[dict]:
    """The ratings visitors gave, one entry per game they gave any for, oldest first."""
    rows = connection.execute(
        """SELECT id, visitor_lichess_rating, visitor_chesscom_rating FROM session_games
           WHERE visitor_lichess_rating IS NOT NULL OR visitor_chesscom_rating IS NOT NULL
           ORDER BY rowid"""
    ).fetchall()
    ratings = []
    for game_id, lichess, chesscom in rows:
        ratings.append({"game_id": game_id, "lichess": lichess, "chesscom": chesscom})
    return ratings


def has_ended_as_the_page_ends_it(board: chess.Board) -> bool:
    """
    True when the page would have ended the game in this position. The page
    ends a game at the fifty-move rule and at threefold repetition without
    waiting for a claim. python-chess's own test for a claimable draw is not
    used: it also allows a draw one move early, when the next move could
    complete the repetition.
    """
    if board.is_checkmate() or board.is_stalemate() or board.is_insufficient_material():
        return True
    if board.halfmove_clock >= 100:
        return True
    if board.is_repetition(3):
        return True
    return False


def check_shape(report: object) -> None:
    """
    Raises RejectedGame unless the report has the fields the page sends, of
    the right types. Anyone can send the service a request, so nothing in it
    is assumed until checked.
    """
    if not isinstance(report, dict):
        raise RejectedGame("the report is not an object")

    base_model = report.get("baseModel")
    if not isinstance(base_model, str) or BASE_MODEL_NAME.fullmatch(base_model) is None:
        raise RejectedGame("the report does not name the Base Model")

    # bool is a kind of int in Python, and true is no rating.
    rating = report.get("rating")
    if not isinstance(rating, int) or isinstance(rating, bool):
        raise RejectedGame("the report does not give the Base Model's rating")

    moves = report.get("moves")
    if not isinstance(moves, list):
        raise RejectedGame("the report has no list of moves")

    for reported_move in moves:
        if not isinstance(reported_move, dict):
            raise RejectedGame("a move is not an object")
        if not isinstance(reported_move.get("uci"), str):
            raise RejectedGame("a move has no UCI name")

    # Absent from a game that ended on the board. Anything but true or false
    # would let a truthy value end a game no one resigned.
    visitor_resigned = report.get("visitorResigned", False)
    if not isinstance(visitor_resigned, bool):
        raise RejectedGame("the report says neither yes nor no about a resignation")

    # Absent or null unless a clock ran out. Only a side's name may end a
    # game on time: a truthy value of any other kind would end one by mistake.
    timed_out = report.get("timedOut")
    if timed_out is not None and timed_out not in ("white", "black"):
        raise RejectedGame(f"the report says {timed_out!r} ran out of time, which is neither white nor black")
    if timed_out is not None and visitor_resigned:
        raise RejectedGame("the report says the game was both resigned and lost on time")

    # Absent from a page that predates analysis mode. Anything but true or
    # false would leave unclear which games the Bot played unaided.
    if "assisted" in report and not isinstance(report["assisted"], bool):
        raise RejectedGame("the report says neither yes nor no about analysis mode")


def session_game_pgns(connection: sqlite3.Connection) -> list[str]:
    """Every stored game as PGN, oldest first."""
    rows = connection.execute("SELECT pgn FROM session_games ORDER BY rowid").fetchall()
    pgns = [row[0] for row in rows]
    return pgns


def session_game_record(connection: sqlite3.Connection, table: dict[str, str]) -> dict:
    """
    The Bot's record over every stored game, worked out as Camille's is, so
    the page shows both the same way: games and results with each colour,
    and the openings it reached most, named from table.
    """
    games = []
    for pgn in session_game_pgns(connection):
        games.append(chess.pgn.read_game(io.StringIO(pgn)))
    return player_record(games, BOT_NAME, table)


def session_game_counts(connection: sqlite3.Connection, assisted: bool | None = None) -> dict[str, int]:
    """
    How many games have been stored, how the Bot fared in them, where its
    moves came from, and what visitors made of it. Counts every game, or with
    assisted given, only the games played with analysis mode on (True) or
    only those played without it (False).
    """
    # Every count reads the games through this condition, so the assisted
    # games and the others are counted the same way.
    if assisted is None:
        which_games = "1 = 1"
        parameters: tuple = ()
    else:
        which_games = "session_games.assisted = ?"
        parameters = (assisted,)

    def count_games(condition: str) -> int:
        query = f"SELECT COUNT(*) FROM session_games WHERE ({condition}) AND {which_games}"
        return scalar(connection, query, parameters)

    def count_bot_moves(source: str) -> int:
        query = f"""SELECT COUNT(*) FROM bot_moves JOIN session_games ON session_games.id = bot_moves.game_id
                    WHERE bot_moves.source = ? AND {which_games}"""
        return scalar(connection, query, (source,) + parameters)

    bot_won = "(result = '1-0' AND bot_colour = 'white') OR (result = '0-1' AND bot_colour = 'black')"
    bot_lost = "(result = '1-0' AND bot_colour = 'black') OR (result = '0-1' AND bot_colour = 'white')"
    counts = {
        "games": count_games("1 = 1"),
        "bot_wins": count_games(bot_won),
        "bot_losses": count_games(bot_lost),
        "draws": count_games("result = '1/2-1/2'"),
        "bot_moves_from_opening_book": count_bot_moves(OPENING_BOOK),
        "bot_moves_from_base_model": count_bot_moves(BASE_MODEL),
        "felt_like_a_real_player": count_games("felt_like_a_real_player = 1"),
        "did_not_feel_like_a_real_player": count_games("felt_like_a_real_player = 0"),
        "impression_not_given": count_games("felt_like_a_real_player IS NULL"),
    }
    return counts


def scalar(connection: sqlite3.Connection, query: str, parameters: tuple = ()) -> int:
    """The single number a counting query returns."""
    row = connection.execute(query, parameters).fetchone()
    return row[0]
