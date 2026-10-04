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
