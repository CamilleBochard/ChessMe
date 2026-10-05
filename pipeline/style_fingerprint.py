"""Builds the Style Fingerprint: distributional statistics describing how a
player plays, computed the same way for Camille and for the Bot.

Move-Matching needs the two players to face the same positions. The
fingerprint does not: it summarises each player's own games, so it compares
Camille with the Bot on games that share no position at all.

Every statistic is read from the positions a player faced and the move he
played in each, the shape the dataset records Camille's moves in.
"""

from collections import defaultdict

import chess

from pipeline.blunder_profile import MoveLoss
from pipeline.dataset import PHASES, Position

PIECE_NAMES = {
    chess.PAWN: "pawn",
    chess.KNIGHT: "knight",
    chess.BISHOP: "bishop",
    chess.ROOK: "rook",
    chess.QUEEN: "queen",
    chess.KING: "king",
}


def build_style_fingerprint(positions: list[Position], move_losses: list[MoveLoss]) -> dict:
    return {"piece_share": _piece_share(positions)}


def _piece_share(positions: list[Position]) -> dict:
    """The share of moves made by each piece type, per Phase and over every Phase."""
    positions_by_phase = defaultdict(list)
    for position in positions:
        positions_by_phase[position.phase].append(position)

    phases = {}
    for phase in PHASES:
        phases[phase] = _share_by_piece(positions_by_phase[phase])
    return {"phases": phases, "all_phases": _share_by_piece(positions)}


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
