"""Reads the Session Games visitors played on the site as evidence about the
Bot's Level: each of its moves with the evaluation it lost, and how early a
game slipped away from it.

The measures are the Blunder Profile's own, so the Bot's moves against a
visitor can be set beside Camille's moves against the players he met, and
beside the Bot's games against the Base Model at his rating.
"""

import io
import math
import sqlite3
from dataclasses import dataclass

import chess.pgn

from pipeline.dataset import PHASES, phase_of

# A player whose position stands this far below equality, from their own
# side, has as good as lost the game at this level.
COLLAPSE_CENTIPAWNS = -300

# Plies before which a fall that far counts as an early collapse: the first
# fifteen moves of each side.
COLLAPSE_BEFORE_PLY = 30

# Below this probability the Base Model finds a move improbable.
IMPROBABLE_BELOW = 0.01


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
class StoredMove:
    """One move of a stored Session Game, in the dataset's shape, and for the Bot's, where it came from."""

    game_id: str
    ply: int
    phase: str
    fen: str
    move: str
    # The Opening Book or the Base Model, as the page reported it; None for
    # the visitor's moves.
    came_from: str | None


@dataclass(frozen=True)
class StoredGame:
    id: str
    played_on: str
    bot_colour: str
    result: str
    bot_moves: list[StoredMove]
    # Measured as the Bot's are, they say how strong the players it met were.
    visitor_moves: list[StoredMove]


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
        bot_moves, visitor_moves = _moves_of_each_side(game_id, pgn, bot_colour, sources)
        game = StoredGame(
            id=game_id,
            played_on=played_on,
            bot_colour=bot_colour,
            result=result,
            bot_moves=bot_moves,
            visitor_moves=visitor_moves,
        )
        games.append(game)
    return games


def _moves_of_each_side(
    game_id: str, pgn: str, bot_colour: str, sources: dict[int, str]
) -> tuple[list[StoredMove], list[StoredMove]]:
    """The Bot's moves of a game, found by the plies the store recorded them at, and the visitor's, the others."""
    game = chess.pgn.read_game(io.StringIO(pgn))
    board = game.board()
    bot_moves = []
    visitor_moves = []
    for ply, move in enumerate(game.mainline_moves(), start=1):
        stored = StoredMove(
            game_id=game_id,
            ply=ply,
            phase=phase_of(ply),
            fen=board.fen(),
            move=move.uci(),
            came_from=sources.get(ply),
        )
        if ply in sources:
            bot_moves.append(stored)
        else:
            visitor_moves.append(stored)
        board.push(move)
    return bot_moves, visitor_moves


@dataclass(frozen=True)
class AnalysedMove:
    """One move, the evaluation it lost and, for a move of the Base Model, the probability it gave it."""

    phase: str
    centipawn_loss: int
    # Whether the move could still be a mistake: not both the best and the
    # played move at ten pawns or more for the same side.
    open_position: bool
    # None for a move the model did not choose, such as one from the Opening Book.
    probability: float | None


@dataclass(frozen=True)
class PhaseSummary:
    open_moves: int
    # The average loss over the moves made in open positions; None without any.
    average_loss: float | None
    # Two standard errors of that average, the range a figure read from this
    # many moves can stray by; None with fewer than two moves.
    loss_margin: float | None
    model_moves: int
    # The share of the model's moves it gave less than 1%; None without any.
    share_under_1_percent: float | None


def phase_summaries(moves: list[AnalysedMove]) -> dict[str, PhaseSummary]:
    """Per Phase, the average loss in open positions, as Level is compared, and the share of model moves under 1%."""
    summaries = {}
    for phase in PHASES:
        in_phase = [move for move in moves if move.phase == phase]

        open_moves = [move for move in in_phase if move.open_position]
        losses = [move.centipawn_loss for move in open_moves]
        average_loss = None
        if losses:
            average_loss = sum(losses) / len(losses)
        loss_margin = None
        if len(losses) >= 2:
            variance = sum((loss - average_loss) ** 2 for loss in losses) / (len(losses) - 1)
            loss_margin = 2 * math.sqrt(variance / len(losses))

        model_moves = [move for move in in_phase if move.probability is not None]
        share_under_1_percent = None
        if model_moves:
            improbable = [move for move in model_moves if move.probability < IMPROBABLE_BELOW]
            share_under_1_percent = len(improbable) / len(model_moves)

        summaries[phase] = PhaseSummary(
            open_moves=len(open_moves),
            average_loss=average_loss,
            loss_margin=loss_margin,
            model_moves=len(model_moves),
            share_under_1_percent=share_under_1_percent,
        )
    return summaries


def result_for_the_bot(result: str, bot_colour: str) -> str:
    """A game's result from the Bot's side: win, draw or loss."""
    if result == "1/2-1/2":
        return "draw"
    white_won = result == "1-0"
    bot_is_white = bot_colour == "white"
    if white_won == bot_is_white:
        return "win"
    return "loss"


def share_margin(count: int, of: int) -> float:
    """Two standard errors of the share count / of, read as a proportion."""
    share = count / of
    return 2 * math.sqrt(share * (1 - share) / of)


def played_games_record(
    games: list[StoredGame], sides: dict[str, tuple[list[int | None], dict[str, PhaseSummary]]]
) -> dict:
    """What the site shows of the games visitors played: their results for the Bot, then each side's figures.

    Each side comes with the ply at which each game slipped away from it, or
    None, and its Phase summaries. The keys are those the site reads.
    """
    results = {"wins": 0, "draws": 0, "losses": 0}
    for game in games:
        outcome = result_for_the_bot(game.result, game.bot_colour)
        if outcome == "win":
            results["wins"] += 1
        elif outcome == "draw":
            results["draws"] += 1
        else:
            results["losses"] += 1

    sides_record = {}
    for side, (collapses, summaries) in sides.items():
        slipped = sum(1 for collapse in collapses if collapse is not None)
        phases = {}
        for phase in PHASES:
            summary = summaries[phase]
            phases[phase] = {
                "moves": summary.open_moves,
                "averageLoss": summary.average_loss,
                "margin": summary.loss_margin,
            }
        sides_record[side] = {
            "slippedAway": {"games": slipped, "of": len(collapses), "margin": share_margin(slipped, len(collapses))},
            "phases": phases,
        }
    return {"games": len(games), "results": results, "sides": sides_record}

