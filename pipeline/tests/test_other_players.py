import io
import json

from pipeline.dataset import Position
from pipeline.other_players import read_other_players, sample_other_players


def lichess_game(game_id: str, white: str, white_elo: int, black: str, black_elo: int, moves: str, time_control: str = "600+0") -> str:
    """A game as the Lichess monthly database writes it."""
    return f"""[Event "Rated Rapid game"]
[Site "https://lichess.org/{game_id}"]
[White "{white}"]
[Black "{black}"]
[Result "*"]
[UTCDate "2026.09.01"]
[WhiteElo "{white_elo}"]
[BlackElo "{black_elo}"]
[TimeControl "{time_control}"]

{moves} *

"""


def sample(pgn: str, games_wanted: int = 10) -> list[dict]:
    return sample_other_players(io.StringIO(pgn), rating_range=(1190, 1360), excluded_player="Punkycam", games_wanted=games_wanted)


def test_keeps_the_side_of_a_ten_minute_game_played_by_someone_rated_in_the_range():
    pgn = lichess_game("game0001", "Strong", 1800, "AtLevel", 1250, "1. e4 e5 2. Nf3")

    games = sample(pgn)

    assert games == [
        {
            "game_id": "lichess:game0001",
            "player": "AtLevel",
            "colour": "black",
            "rating": 1250,
            "moves": ["e2e4", "e7e5", "g1f3"],
        }
    ]


def test_skips_games_at_any_other_time_control():
    pgn = lichess_game("blitz001", "AtLevel", 1250, "Other", 1300, "1. e4 e5", time_control="300+0")

    assert sample(pgn) == []


def test_keeps_a_single_side_of_a_game_both_players_qualify_for():
    pgn = lichess_game("both0001", "AtLevel", 1250, "AlsoAtLevel", 1300, "1. e4 e5")

    games = sample(pgn)

    assert len(games) == 1
    assert games[0]["player"] in {"AtLevel", "AlsoAtLevel"}


def test_keeps_one_game_per_player():
    pgn = lichess_game("first001", "AtLevel", 1250, "Strong", 1800, "1. e4 e5") + lichess_game(
        "second01", "Strong", 1800, "AtLevel", 1260, "1. d4 d5"
    )

    games = sample(pgn)

    assert [game["game_id"] for game in games] == ["lichess:first001"]


def test_leaves_out_camille_s_own_games():
    pgn = lichess_game("camille1", "punkycam", 1250, "Strong", 1800, "1. e4 e5")

    assert sample(pgn) == []


def test_stops_reading_once_enough_games_are_sampled():
    pgn = lichess_game("game0001", "First", 1250, "Strong", 1800, "1. e4 e5") + lichess_game(
        "game0002", "Second", 1250, "Strong", 1800, "1. d4 d5"
    )

    games = sample(pgn, games_wanted=1)

    assert [game["player"] for game in games] == ["First"]


AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"


def test_reads_back_the_positions_the_sampled_player_faced(tmp_path):
    sample_path = tmp_path / "other-players.jsonl"
    game = {"game_id": "lichess:game0001", "player": "AtLevel", "colour": "black", "rating": 1250, "moves": ["e2e4", "e7e5", "g1f3"]}
    sample_path.write_text(json.dumps(game) + "\n", encoding="utf-8")

    positions = read_other_players(sample_path)

    assert positions == [Position(game_id="lichess:game0001", source="lichess", ply=2, phase="opening", fen=AFTER_E4, move="e7e5")]
