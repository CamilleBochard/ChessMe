import chess

from pipeline.blunder_profile import MoveLoss
from pipeline.dataset import Position, positions_faced
from pipeline.style_fingerprint import build_style_fingerprint


def white_positions(game_id: str, moves: str) -> list[Position]:
    """The positions White faced in a game given as UCI moves separated by spaces."""
    parsed = [chess.Move.from_uci(move) for move in moves.split()]
    return positions_faced(game_id, "lichess", parsed, chess.WHITE)


def black_positions(game_id: str, moves: str) -> list[Position]:
    parsed = [chess.Move.from_uci(move) for move in moves.split()]
    return positions_faced(game_id, "lichess", parsed, chess.BLACK)


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


# Both queens come off: White takes on d6 at ply 7, Black recaptures at ply 8.
QUEEN_TRADE = "d2d4 e7e5 d4e5 d7d6 e5d6 d8d6 d1d6 c7d6 b1c3"


def test_counts_the_games_in_which_both_queens_came_off_before_move_20():
    traded = white_positions("lichess:traded", QUEEN_TRADE)
    kept = white_positions("lichess:kept", "e2e4 e7e5 g1f3")

    queen_trades = fingerprint_of(traded + kept)["queen_trade_before_move_20"]

    assert queen_trades == {"games": 2, "games_with_a_queen_trade": 1, "rate": 0.5}


def test_counts_a_trade_completed_on_the_last_ply_before_move_20_but_not_one_completed_after():
    # Knights shuffling back and forth push the same trade later: after 30
    # plies of shuffling it completes at ply 38, after 32 plies at ply 40.
    four_plies_of_shuffling = "g1f3 g8f6 f3g1 f6g8 "
    completed_at_ply_38 = white_positions("lichess:a", four_plies_of_shuffling * 7 + "g1f3 g8f6 " + QUEEN_TRADE)
    completed_at_ply_40 = white_positions("lichess:b", four_plies_of_shuffling * 8 + QUEEN_TRADE)

    early = fingerprint_of(completed_at_ply_38)["queen_trade_before_move_20"]
    late = fingerprint_of(completed_at_ply_40)["queen_trade_before_move_20"]

    assert early["games_with_a_queen_trade"] == 1
    assert late["games_with_a_queen_trade"] == 0


def test_sees_a_queen_trade_from_black_s_side_of_the_board():
    positions = black_positions("lichess:a", QUEEN_TRADE)

    queen_trades = fingerprint_of(positions)["queen_trade_before_move_20"]

    assert queen_trades["games_with_a_queen_trade"] == 1


def test_measures_the_material_left_on_the_board_at_move_30_in_games_that_reach_it():
    # The queen trade, played after thirty plies of shuffling, also costs
    # White a pawn and Black two. Knights then shuffle on to move 30, so
    # its board holds 78 - 18 - 3 = 57 pawns' worth of material.
    shuffling_before = "g1f3 g8f6 f3g1 f6g8 " * 7 + "g1f3 g8f6 "
    shuffling_after = " b8c6 c3b1 c6b8 b1c3" * 5
    reaches_move_30 = white_positions("lichess:long", shuffling_before + QUEEN_TRADE + shuffling_after)
    ends_early = white_positions("lichess:short", "e2e4 e7e5 g1f3")

    material = fingerprint_of(reaches_move_30 + ends_early)["material_at_move_30"]

    assert material["games"] == 2
    assert material["games_reaching_move_30"] == 1
    assert material["mean"] == 57


def test_records_which_side_each_game_castled_to_if_it_castled_at_all():
    kingside = white_positions("lichess:a", "e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 e1g1")
    queenside = white_positions("lichess:b", "d2d4 d7d5 b1c3 b8c6 c1f4 c8f5 d1d2 d8d7 e1c1")
    never = white_positions("lichess:c", "e2e4 e7e5 e1e2")
    never_either = white_positions("lichess:d", "d2d4 d7d5")

    castling = fingerprint_of(kingside + queenside + never + never_either)["castling"]

    assert castling == {"games": 4, "kingside": 0.25, "queenside": 0.25, "never": 0.5}


def test_describes_the_shape_of_the_centipawn_losses_by_phase():
    positions = white_positions("lichess:a", "e2e4 e7e5 g1f3")
    losses = [
        MoveLoss(game_id="lichess:a", ply=1, phase="opening", centipawn_loss=0),
        MoveLoss(game_id="lichess:a", ply=3, phase="opening", centipawn_loss=300),
    ]

    centipawn_loss = build_style_fingerprint(positions, losses)["centipawn_loss"]

    assert centipawn_loss["phases"]["opening"]["mean"] == 150
    assert centipawn_loss["phases"]["opening"]["percentiles"]["95"] == 300
    assert centipawn_loss["all_phases"]["moves"] == 2


def test_counts_a_game_as_reaching_move_30_only_if_the_player_moves_in_it_whatever_his_colour():
    # 58 plies of shuffling: Black plays ply 58, the last ply of move 29,
    # and the game stops there. Black never moves in move 30, just as White
    # would not if the game stopped on the same ply.
    fifty_eight_plies = ("g1f3 g8f6 f3g1 f6g8 " * 15).split()[:58]
    stops_before_move_30 = black_positions("lichess:a", " ".join(fifty_eight_plies))

    material = fingerprint_of(stops_before_move_30)["material_at_move_30"]

    assert material["games_reaching_move_30"] == 0
