import chess
import chess.pgn

from pipeline.player_record import opening_of, opening_table, player_record

PLAYER = "punkycam"


def game(white: str, black: str, result: str, moves: list[str]) -> chess.pgn.Game:
    """A game between white and black with the moves given in SAN and the result."""
    built = chess.pgn.Game()
    built.headers["White"] = white
    built.headers["Black"] = black
    built.headers["Result"] = result
    node = built
    for san in moves:
        node = node.add_variation(node.board().parse_san(san))
    return built


def test_counts_the_games_with_each_colour():
    games = [
        game(PLAYER, "someone", "1-0", ["e4"]),
        game(PLAYER, "someone", "0-1", ["d4"]),
        game("someone", PLAYER, "1/2-1/2", ["e4"]),
    ]

    record = player_record(games, PLAYER, table={})

    assert record["games"] == 3
    assert record["white"]["games"] == 2
    assert record["black"]["games"] == 1


def test_counts_wins_draws_and_losses_from_the_players_side_with_each_colour():
    games = [
        game(PLAYER, "someone", "1-0", ["e4"]),
        game(PLAYER, "someone", "0-1", ["d4"]),
        game("someone", PLAYER, "0-1", ["e4"]),
        game("someone", PLAYER, "1/2-1/2", ["e4"]),
    ]

    record = player_record(games, PLAYER, table={})

    assert record["white"]["results"] == {"wins": 1, "draws": 0, "losses": 1}
    assert record["black"]["results"] == {"wins": 1, "draws": 1, "losses": 0}


def test_adds_up_the_results_of_both_colours():
    games = [
        game(PLAYER, "someone", "1-0", ["e4"]),
        game("someone", PLAYER, "0-1", ["e4"]),
        game("someone", PLAYER, "1/2-1/2", ["e4"]),
    ]

    record = player_record(games, PLAYER, table={})

    assert record["results"] == {"wins": 2, "draws": 1, "losses": 0}


# A few lines of Lichess's openings table, as (name, moves).
TABLE_LINES = [
    ("King's Pawn Game", "1. e4"),
    ("Sicilian Defense", "1. e4 c5"),
    ("Sicilian Defense: Alapin Variation", "1. e4 c5 2. c3"),
    ("Queen's Gambit Declined", "1. d4 d5 2. c4 e6"),
]


def test_names_a_game_after_the_deepest_line_of_the_table_it_reaches():
    table = opening_table(TABLE_LINES)
    alapin = game(PLAYER, "someone", "1-0", ["e4", "c5", "c3", "d5", "exd5"])

    assert opening_of(alapin, table) == "Sicilian Defense: Alapin Variation"


def test_recognises_an_opening_reached_in_another_move_order():
    table = opening_table(TABLE_LINES)
    # 1. c4 e6 2. d4 d5 reaches the Queen's Gambit Declined by the English.
    transposed = game(PLAYER, "someone", "1-0", ["c4", "e6", "d4", "d5", "Nc3"])

    assert opening_of(transposed, table) == "Queen's Gambit Declined"


def test_lists_the_openings_played_most_with_each_colour_by_family_with_the_results():
    table = opening_table(TABLE_LINES)
    games = [
        game(PLAYER, "someone", "1-0", ["e4", "c5", "c3"]),
        game(PLAYER, "someone", "0-1", ["e4", "c5", "Nf3"]),
        game(PLAYER, "someone", "1-0", ["e4", "e5"]),
    ]

    record = player_record(games, PLAYER, table)

    assert record["white"]["openings"] == [
        {"name": "Sicilian Defense", "games": 2, "results": {"wins": 1, "draws": 0, "losses": 1}},
        {"name": "King's Pawn Game", "games": 1, "results": {"wins": 1, "draws": 0, "losses": 0}},
    ]


def test_lists_no_more_than_five_openings_with_a_colour():
    first_moves = ["e4", "d4", "c4", "Nf3", "g3", "b3"]
    table = opening_table([(f"Opening {san}", f"1. {san}") for san in first_moves])
    games = [game(PLAYER, "someone", "1-0", [san]) for san in first_moves]

    record = player_record(games, PLAYER, table)

    assert len(record["white"]["openings"]) == 5
