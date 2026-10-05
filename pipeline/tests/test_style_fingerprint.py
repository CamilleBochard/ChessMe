import chess

from pipeline.blunder_profile import MoveLoss
from pipeline.dataset import Position, positions_faced
from pipeline.style_fingerprint import build_style_fingerprint


def white_positions(game_id: str, moves: str) -> list[Position]:
    """The positions White faced in a game given as UCI moves separated by spaces."""
    parsed = [chess.Move.from_uci(move) for move in moves.split()]
    return positions_faced(game_id, "lichess", parsed, chess.WHITE)


def no_losses(positions: list[Position]) -> list[MoveLoss]:
    return [MoveLoss(game_id=p.game_id, ply=p.ply, phase=p.phase, centipawn_loss=0) for p in positions]


def fingerprint_of(positions: list[Position]) -> dict:
    return build_style_fingerprint(positions, no_losses(positions))


def test_shares_the_moves_out_by_the_piece_that_made_them():
    # White moves a pawn, a knight, a bishop and castles: the king moves.
    positions = white_positions("lichess:a", "e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 e1g1")

    piece_share = fingerprint_of(positions)["piece_share"]["all_phases"]

    assert piece_share == {"pawn": 0.25, "knight": 0.25, "bishop": 0.25, "rook": 0, "queen": 0, "king": 0.25}
