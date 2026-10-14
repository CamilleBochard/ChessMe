"""Reads the Session Games visitors played on the site as evidence about the
Bot's Level: each of its moves with the evaluation it lost, and how early a
game slipped away from it.

The measures are the Blunder Profile's own, so the Bot's moves against a
visitor can be set beside Camille's moves against the players he met, and
beside the Bot's games against the Base Model at his rating.
"""

import io
import sqlite3
from dataclasses import dataclass

import chess.pgn

from pipeline.dataset import phase_of

# A player whose position stands this far below equality, from their own
# side, has as good as lost the game at this level.
COLLAPSE_CENTIPAWNS = -300

# Plies before which a fall that far counts as an early collapse: the first
# fifteen moves of each side.
COLLAPSE_BEFORE_PLY = 30


def collapse_ply(evaluations: list[tuple[int, int]]) -> int | None:
    """The first ply, before move 15, at which the player's position stood three pawns down or worse.

    The evaluations are the player's own moves: the ply and the score of the
    position before the move, from the player's side. None when the player
    never fell that far that early.
    """
    for ply, evaluation in evaluations:
        if ply > COLLAPSE_BEFORE_PLY:
            continue
        if evaluation <= COLLAPSE_CENTIPAWNS:
            return ply
    return None


@dataclass(frozen=True)
class StoredBotMove:
    """One of the Bot's moves in a stored Session Game, in the dataset's shape, and where it came from."""

    game_id: str
    ply: int
    phase: str
    fen: str
    move: str
    # The Opening Book or the Base Model, as the page reported it.
    came_from: str


@dataclass(frozen=True)
class StoredGame:
    id: str
    played_on: str
    bot_colour: str
    result: str
    bot_moves: list[StoredBotMove]


def stored_games(connection: sqlite3.Connection, include_assisted: bool = False) -> list[StoredGame]:
    """The stored Session Games, oldest first, each with the Bot's moves replayed from its PGN.

    Games played with analysis mode on are left out unless asked for: the
    visitor could see where the Bot went wrong, so they say less about how
    it plays against an unaided player.
    """
    query = "SELECT id, played_on, bot_colour, result, pgn FROM session_games"
    if not include_assisted:
        query += " WHERE assisted = 0"
    query += " ORDER BY rowid"

    games = []
    for game_id, played_on, bot_colour, result, pgn in connection.execute(query).fetchall():
        source_rows = connection.execute("SELECT ply, source FROM bot_moves WHERE game_id = ?", (game_id,)).fetchall()
        sources = dict(source_rows)
        bot_moves = _bot_moves(game_id, pgn, sources)
        game = StoredGame(id=game_id, played_on=played_on, bot_colour=bot_colour, result=result, bot_moves=bot_moves)
        games.append(game)
    return games


def _bot_moves(game_id: str, pgn: str, sources: dict[int, str]) -> list[StoredBotMove]:
    """The Bot's moves of a game, found by the plies the store recorded them at."""
    game = chess.pgn.read_game(io.StringIO(pgn))
    board = game.board()
    bot_moves = []
    for ply, move in enumerate(game.mainline_moves(), start=1):
        if ply in sources:
            bot_moves.append(
                StoredBotMove(
                    game_id=game_id,
                    ply=ply,
                    phase=phase_of(ply),
                    fen=board.fen(),
                    move=move.uci(),
                    came_from=sources[ply],
                )
            )
        board.push(move)
    return bot_moves
