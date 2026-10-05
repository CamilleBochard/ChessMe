"""Builds the Style Fingerprint: distributional statistics describing how a
player plays, computed the same way for Camille and for the Bot.

Move-Matching needs the two players to face the same positions. The
fingerprint does not: it summarises each player's own games, so it compares
Camille with the Bot on games that share no position at all.

Every statistic is read from the positions a player faced and the move he
played in each, the shape the dataset records Camille's moves in.
"""

from collections import defaultdict
from typing import Callable

import chess

from pipeline.blunder_profile import MoveLoss, nearest_rank_percentiles
from pipeline.dataset import PHASES, Position

# Move 20 begins at ply 39, so a trade before it is complete within 38 plies.
PLIES_BEFORE_MOVE_20 = 38

# Move 30 begins once 58 plies have been played.
PLIES_BEFORE_MOVE_30 = 58

# The usual piece values, in pawns. A full board holds 78 of material.
PIECE_VALUES = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9, chess.KING: 0}

MATERIAL_PERCENTILES = [25, 50, 75]

PIECE_NAMES = {
    chess.PAWN: "pawn",
    chess.KNIGHT: "knight",
    chess.BISHOP: "bishop",
    chess.ROOK: "rook",
    chess.QUEEN: "queen",
    chess.KING: "king",
}


def build_style_fingerprint(positions: list[Position], move_losses: list[MoveLoss]) -> dict:
    return {
        "piece_share": _per_phase(positions, _share_by_piece),
        "capture_taken_rate": _per_phase(positions, _capture_taken_rate),
        "queen_trade_before_move_20": _queen_trade_rate(positions),
        "material_at_move_30": _material_at_move_30(positions),
        "castling": _castling_choice(positions),
    }


def _per_phase(positions: list[Position], summarise: Callable[[list[Position]], dict]) -> dict:
    """Applies summarise to each Phase's positions and to every position."""
    positions_by_phase = defaultdict(list)
    for position in positions:
        positions_by_phase[position.phase].append(position)

    phases = {}
    for phase in PHASES:
        phases[phase] = summarise(positions_by_phase[phase])
    return {"phases": phases, "all_phases": summarise(positions)}


def _share_by_piece(positions: list[Position]) -> dict[str, float]:
    moves_by_piece = {name: 0 for name in PIECE_NAMES.values()}
    for position in positions:
        board = chess.Board(position.fen)
        move = chess.Move.from_uci(position.move)
        # Castling is the king's move, as in UCI.
        piece = board.piece_type_at(move.from_square)
        moves_by_piece[PIECE_NAMES[piece]] += 1

    share_by_piece = {}
    for name, moves in moves_by_piece.items():
        if positions:
            share_by_piece[name] = moves / len(positions)
        else:
            share_by_piece[name] = None
    return share_by_piece


def _capture_taken_rate(positions: list[Position]) -> dict:
    """How often a capture was played, among the positions where at least one was legal.

    Positions with no capture on offer say nothing about a taste for taking,
    so they are left out of the count.
    """
    positions_with_a_capture = 0
    captures_played = 0
    for position in positions:
        board = chess.Board(position.fen)
        capture_on_offer = any(board.is_capture(move) for move in board.legal_moves)
        if not capture_on_offer:
            continue
        positions_with_a_capture += 1
        played = chess.Move.from_uci(position.move)
        if board.is_capture(played):
            captures_played += 1

    rate = None
    if positions_with_a_capture > 0:
        rate = captures_played / positions_with_a_capture
    return {"positions_with_a_capture": positions_with_a_capture, "captures_played": captures_played, "rate": rate}


def _queen_trade_rate(positions: list[Position]) -> dict:
    """The share of games in which both queens were off the board before move 20.

    Every game counts, including one that ended before move 20 with its
    queens on: the rate is how often a game of this player loses its queens
    early, not how often a long game does.
    """
    games = _boards_by_game(positions)
    games_with_a_queen_trade = 0
    for boards in games.values():
        plies_seen = [plies for plies in boards if plies <= PLIES_BEFORE_MOVE_20]
        last_board_before_move_20 = boards[max(plies_seen)]
        if _queens_on(last_board_before_move_20) == 0:
            games_with_a_queen_trade += 1

    rate = None
    if games:
        rate = games_with_a_queen_trade / len(games)
    return {"games": len(games), "games_with_a_queen_trade": games_with_a_queen_trade, "rate": rate}


def _boards_by_game(positions: list[Position]) -> dict[str, dict[int, chess.Board]]:
    """For each game, the boards known from the player's positions, keyed by how many plies had been played.

    Only the player's own positions are recorded, but the board is known
    after every ply all the same: either as a position he faced or as that
    position once his move was played. Only the opponent's last move, when a
    game ends on it, is missing.
    """
    games: dict[str, dict[int, chess.Board]] = defaultdict(dict)
    for position in positions:
        board_faced = chess.Board(position.fen)
        games[position.game_id][position.ply - 1] = board_faced

        board_after_the_move = board_faced.copy()
        board_after_the_move.push(chess.Move.from_uci(position.move))
        games[position.game_id][position.ply] = board_after_the_move
    return games


def _queens_on(board: chess.Board) -> int:
    white_queens = len(board.pieces(chess.QUEEN, chess.WHITE))
    black_queens = len(board.pieces(chess.QUEEN, chess.BLACK))
    return white_queens + black_queens


def _material_at_move_30(positions: list[Position]) -> dict:
    """The material left on the board, both sides together, as move 30 begins.

    Only games that reach move 30 have a board to measure, so how many do is
    reported beside the distribution: a player whose games end early leaves
    only his long games in it.
    """
    games = _boards_by_game(positions)
    materials = []
    for boards in games.values():
        if PLIES_BEFORE_MOVE_30 not in boards:
            continue
        materials.append(_material_on(boards[PLIES_BEFORE_MOVE_30]))

    mean = None
    if materials:
        mean = sum(materials) / len(materials)
    return {
        "games": len(games),
        "games_reaching_move_30": len(materials),
        "mean": mean,
        "percentiles": nearest_rank_percentiles(materials, MATERIAL_PERCENTILES),
    }


def _material_on(board: chess.Board) -> int:
    material = 0
    for piece in board.piece_map().values():
        material += PIECE_VALUES[piece.piece_type]
    return material



def _castling_choice(positions: list[Position]) -> dict:
    """The share of games in which the player castled kingside, castled queenside, or never castled."""
    castling_by_game = {}
    for position in positions:
        castling_by_game.setdefault(position.game_id, "never")
        board = chess.Board(position.fen)
        move = chess.Move.from_uci(position.move)
        if board.is_kingside_castling(move):
            castling_by_game[position.game_id] = "kingside"
        elif board.is_queenside_castling(move):
            castling_by_game[position.game_id] = "queenside"

    games = len(castling_by_game)
    choices = list(castling_by_game.values())
    shares = {"games": games}
    for choice in ["kingside", "queenside", "never"]:
        if games > 0:
            shares[choice] = choices.count(choice) / games
        else:
            shares[choice] = None
    return shares
