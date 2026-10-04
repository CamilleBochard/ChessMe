from pipeline.dataset import Dataset, Position
from pipeline.opening_book import build_opening_book

START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
START_KEY = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -"


def played(game_id, fen, move, ply=1):
    return Position(game_id=game_id, source="lichess", ply=ply, phase="opening", fen=fen, move=move)


def test_maps_a_position_reached_often_enough_to_the_move_played_there():
    train = [played("lichess:a", START, "e2e4"), played("lichess:b", START, "e2e4")]

    book = build_opening_book(Dataset(train=train, test=[]), min_occurrences=2)

    assert book == {START_KEY: "e2e4"}


def test_leaves_out_a_position_reached_fewer_times_than_the_minimum():
    train = [played("lichess:a", START, "e2e4"), played("lichess:b", START, "e2e4")]

    book = build_opening_book(Dataset(train=train, test=[]), min_occurrences=3)

    assert book == {}


def test_plays_the_move_played_most_often_when_several_were_tried():
    train = [
        played("lichess:a", START, "d2d4"),
        played("lichess:b", START, "e2e4"),
        played("lichess:c", START, "e2e4"),
    ]

    book = build_opening_book(Dataset(train=train, test=[]), min_occurrences=3)

    assert book == {START_KEY: "e2e4"}


def test_leaves_out_a_position_where_two_moves_were_played_equally_often():
    train = [
        played("lichess:a", START, "e2e4"),
        played("lichess:b", START, "d2d4"),
        played("lichess:c", START, "e2e4"),
        played("lichess:d", START, "d2d4"),
    ]

    book = build_opening_book(Dataset(train=train, test=[]), min_occurrences=2)

    assert book == {}


def test_learns_nothing_from_test_set_games():
    train = [played("lichess:a", START, "e2e4")]
    test = [played("lichess:b", START, "d2d4"), played("lichess:c", START, "d2d4")]

    book = build_opening_book(Dataset(train=train, test=test), min_occurrences=1)

    assert book == {START_KEY: "e2e4"}


def test_counts_a_position_reached_by_another_move_order_as_the_same_position():
    # The same position after 2. Nc3 Nc6 and after the knights went out and
    # back once more: only the move counters differ.
    after_four_knight_moves = "r1bqkb1r/pppppppp/2n2n2/8/8/2N2N2/PPPPPPPP/R1BQKB1R w KQkq - 4 3"
    after_eight_knight_moves = "r1bqkb1r/pppppppp/2n2n2/8/8/2N2N2/PPPPPPPP/R1BQKB1R w KQkq - 8 5"
    train = [
        played("lichess:a", after_four_knight_moves, "e2e4", ply=5),
        played("lichess:b", after_eight_knight_moves, "e2e4", ply=9),
    ]

    book = build_opening_book(Dataset(train=train, test=[]), min_occurrences=2)

    assert book == {"r1bqkb1r/pppppppp/2n2n2/8/8/2N2N2/PPPPPPPP/R1BQKB1R w KQkq -": "e2e4"}
