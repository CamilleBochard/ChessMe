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
    return {
        "piece_share": _per_phase(positions, _share_by_piece),
        "capture_taken_rate": _per_phase(positions, _capture_taken_rate),
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
