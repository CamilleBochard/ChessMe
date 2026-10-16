import chess
import chess.pgn

from pipeline.player_record import player_record

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

    record = player_record(games, PLAYER)

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

    record = player_record(games, PLAYER)

    assert record["white"]["results"] == {"wins": 1, "draws": 0, "losses": 1}
    assert record["black"]["results"] == {"wins": 1, "draws": 1, "losses": 0}


def test_adds_up_the_results_of_both_colours():
    games = [
        game(PLAYER, "someone", "1-0", ["e4"]),
        game("someone", PLAYER, "0-1", ["e4"]),
        game("someone", PLAYER, "1/2-1/2", ["e4"]),
    ]

    record = player_record(games, PLAYER)

    assert record["results"] == {"wins": 2, "draws": 1, "losses": 0}
