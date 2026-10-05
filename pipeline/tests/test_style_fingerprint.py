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


def test_counts_how_often_a_capture_is_played_when_one_is_on_offer():
    # Ply 1 offers no capture; ply 3 offers exd5 and White declines it;
    # ply 5 offers Nxe4 and White takes.
    positions = white_positions("lichess:a", "e2e4 d7d5 b1c3 d5e4 c3e4")

    capture_rate = fingerprint_of(positions)["capture_taken_rate"]["all_phases"]

    assert capture_rate == {"positions_with_a_capture": 2, "captures_played": 1, "rate": 0.5}


def test_keeps_each_phase_s_moves_apart():
    # White's first five moves (plies 1-9) are the opening: four knight moves
    # and a pawn move. Its sixth move (ply 11) opens the middlegame: a pawn.
    positions = white_positions("lichess:a", "g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g1 f6g8 e2e4 e7e5 d2d4 d7d5")

    piece_share = fingerprint_of(positions)["piece_share"]["phases"]

    assert piece_share["opening"]["knight"] == 0.8
    assert piece_share["middlegame"]["pawn"] == 1
    assert piece_share["endgame"]["pawn"] is None
