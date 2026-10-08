import chess

from pipeline.dataset import Position, positions_faced
from pipeline.style_discriminator import games_long_enough, train_discriminator

# Ten plies of development, then White castles at ply 11, the first ply the
# discriminator reads, on the side the name says.
CASTLES_KINGSIDE = "e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 d2d3 f8c5 b1c3 d7d6 e1g1"
CASTLES_QUEENSIDE = "d2d4 d7d5 b1c3 b8c6 c1f4 c8f5 d1d2 d8d7 e2e3 e7e6 e1c1"

# Both sides' knights step back and forth, so a game lasts long enough to be
# read: Black first after a White move, White first after a Black one.
KNIGHTS_SHUFFLE = " c6b8 c3b1 b8c6 b1c3" * 6
KNIGHTS_SHUFFLE_WHITE_FIRST = " c3b1 c6b8 b1c3 b8c6" * 6


def white_game(game_id: str, moves: str) -> list[Position]:
    parsed = []
    board = chess.Board()
    for uci in moves.split():
        move = chess.Move.from_uci(uci)
        # The positions are built without checking legality, so a mistyped
        # fixture would test nothing; this catches it.
        assert move in board.legal_moves, f"{uci} is illegal after {board.move_stack}"
        board.push(move)
        parsed.append(move)
    return positions_faced(game_id, "lichess", parsed, chess.WHITE)


def games(prefix: str, moves: str, count: int) -> list[list[Position]]:
    return [white_game(f"{prefix}:{index}", moves) for index in range(count)]


def test_recognises_a_habit_of_camille_s_on_a_game_it_was_not_trained_on():
    camille = games("camille", CASTLES_QUEENSIDE + KNIGHTS_SHUFFLE, 5)
    others = games("other", CASTLES_KINGSIDE + KNIGHTS_SHUFFLE, 5)

    discriminator = train_discriminator(camille, others)

    unseen_queenside = white_game("unseen:queenside", CASTLES_QUEENSIDE + KNIGHTS_SHUFFLE)
    unseen_kingside = white_game("unseen:kingside", CASTLES_KINGSIDE + KNIGHTS_SHUFFLE)
    assert discriminator.camille_probability(unseen_queenside) > 0.8
    assert discriminator.camille_probability(unseen_kingside) < 0.2


# White castles at ply 9, inside the first ten plies, then shuffles a knight.
CASTLES_EARLY = "e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 b1c3 f8c5 e1g1 d7d6"
# The same development without castling: the king stays on e1.
STAYS_UNCASTLED = "e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 b1c3 f8c5 d2d3 d7d6"


def test_reads_nothing_from_the_first_ten_plies_where_the_opening_book_plays():
    camille = games("camille", CASTLES_EARLY + KNIGHTS_SHUFFLE_WHITE_FIRST, 5)
    others = games("other", STAYS_UNCASTLED + KNIGHTS_SHUFFLE_WHITE_FIRST, 5)

    discriminator = train_discriminator(camille, others)

    unseen_early_castle = white_game("unseen:early", CASTLES_EARLY + KNIGHTS_SHUFFLE_WHITE_FIRST)
    assert 0.45 < discriminator.camille_probability(unseen_early_castle) < 0.55


def test_keeps_only_the_games_with_ten_moves_to_read_from_ply_11_on():
    # Both games castle at ply 11, White's first move read. White's knight
    # then moves eight more times in one game, for nine moves read, and
    # once more in the other, for ten.
    eight_knight_moves = " c6b8 c3b1 b8c6 b1c3" * 4
    nine_moves_read = white_game("lichess:nine", CASTLES_KINGSIDE + eight_knight_moves)
    ten_moves_read = white_game("lichess:ten", CASTLES_KINGSIDE + eight_knight_moves + " c6b8 c3b1")

    kept = games_long_enough(ten_moves_read + nine_moves_read)

    assert kept == [ten_moves_read]


def test_names_the_statistic_that_gives_camille_away():
    camille = games("camille", CASTLES_QUEENSIDE + KNIGHTS_SHUFFLE, 5)
    others = games("other", CASTLES_KINGSIDE + KNIGHTS_SHUFFLE, 5)

    weights = train_discriminator(camille, others).weights()

    strongest_for_camille = max(weights, key=weights.get)
    strongest_against = min(weights, key=weights.get)
    assert {strongest_for_camille, strongest_against} == {"castled queenside", "castled kingside"}
    assert weights["castled queenside"] > 0


def test_keeps_each_weight_on_its_own_statistic_when_no_game_reaches_the_endgame():
    # Castling at ply 11 and sixteen plies of shuffling end the games at
    # ply 27: every endgame statistic is missing from every game.
    short_shuffle = " c6b8 c3b1 b8c6 b1c3" * 4
    camille = games("camille", CASTLES_QUEENSIDE + short_shuffle, 5)
    others = games("other", CASTLES_KINGSIDE + short_shuffle, 5)

    weights = train_discriminator(camille, others).weights()

    assert weights["castled queenside"] > 0
    assert weights["castled kingside"] < 0
    assert weights["king moves, endgame"] == 0
