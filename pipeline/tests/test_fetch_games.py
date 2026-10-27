from datetime import date
from pathlib import Path

import pytest

from pipeline.fetch_games import fetch_new_games, game_id_of_pgn, known_game_ids, new_games, split_pgn

RESPONSES = Path(__file__).parent / "fixtures" / "responses"


def test_reads_the_games_of_a_recorded_chesscom_month_that_no_file_holds_yet(tmp_path):
    month = (RESPONSES / "chesscom-2026-09.pgn").read_text(encoding="utf-8")
    first, second, third = split_pgn(month)
    (tmp_path / "chesscom.pgn").write_text(first + "\n", encoding="utf-8")

    games = new_games(month, known_game_ids(tmp_path))

    assert [game_id_of_pgn(game) for game in games] == [game_id_of_pgn(second), game_id_of_pgn(third)]
    assert games[0].startswith('[Event "Live Chess"]')


class RecordedSites:
    """Stands in for the two sites' APIs, answering from recorded responses and noting every request."""

    def __init__(self, responses: dict[str, str]):
        self.responses = responses
        self.requests: list[tuple[str, dict[str, str]]] = []

    def __call__(self, url: str, headers: dict[str, str]) -> str:
        self.requests.append((url, headers))
        for prefix, response in self.responses.items():
            if url.startswith(prefix):
                return response
        raise AssertionError(f"No recorded response for {url}")


def test_stops_before_any_request_without_a_lichess_token_and_says_where_to_set_it(tmp_path):
    sites = RecordedSites({})

    with pytest.raises(SystemExit) as stopped:
        fetch_new_games(tmp_path, date(2026, 10, 27), sites, environ={})

    assert "LICHESS_TOKEN" in str(stopped.value)
    assert "lichess.org/account/oauth/token" in str(stopped.value)
    assert sites.requests == []


def recorded_sites() -> RecordedSites:
    return RecordedSites(
        {
            "https://api.chess.com/pub/player/punkycam/games/archives": (RESPONSES / "chesscom-archives.json").read_text(encoding="utf-8"),
            "https://api.chess.com/pub/player/punkycam/games/2026/09/pgn": (RESPONSES / "chesscom-2026-09.pgn").read_text(encoding="utf-8"),
            # October had no game yet when the response was recorded.
            "https://api.chess.com/pub/player/punkycam/games/2026/10/pgn": "",
            "https://lichess.org/api/games/user/Punkycam": (RESPONSES / "lichess-games.pgn").read_text(encoding="utf-8"),
        }
    )


def raw_dir_holding_the_oldest_recorded_game_of_each_site(tmp_path) -> Path:
    raw = tmp_path / "raw"
    raw.mkdir()
    chesscom_games = split_pgn((RESPONSES / "chesscom-2026-09.pgn").read_text(encoding="utf-8"))
    lichess_games = split_pgn((RESPONSES / "lichess-games.pgn").read_text(encoding="utf-8"))
    (raw / "chesscom.pgn").write_text(chesscom_games[0] + "\n", encoding="utf-8")
    # Lichess gives the newest game first.
    (raw / "lichess.pgn").write_text(lichess_games[-1] + "\n", encoding="utf-8")
    return raw


def test_writes_the_new_games_of_each_site_to_a_new_dated_file_and_leaves_the_others_untouched(tmp_path):
    raw = raw_dir_holding_the_oldest_recorded_game_of_each_site(tmp_path)
    before = {path.name: path.read_bytes() for path in raw.iterdir()}
    sites = recorded_sites()

    written = fetch_new_games(raw, date(2026, 10, 27), sites, environ={"LICHESS_TOKEN": "a-token"})

    assert sorted(path.name for path in written) == ["chesscom-2026-10-27.pgn", "lichess-2026-10-27.pgn"]
    for name, content in before.items():
        assert (raw / name).read_bytes() == content
    assert len(split_pgn((raw / "chesscom-2026-10-27.pgn").read_text(encoding="utf-8"))) == 2
    assert len(split_pgn((raw / "lichess-2026-10-27.pgn").read_text(encoding="utf-8"))) == 2
    assert known_game_ids(raw) == {game_id_of_pgn(game) for name in ("chesscom-2026-09.pgn", "lichess-games.pgn") for game in split_pgn((RESPONSES / name).read_text(encoding="utf-8"))}


def test_reads_only_the_months_and_games_since_the_latest_game_held_and_sends_the_token_to_lichess_only(tmp_path):
    raw = raw_dir_holding_the_oldest_recorded_game_of_each_site(tmp_path)
    sites = recorded_sites()

    fetch_new_games(raw, date(2026, 10, 27), sites, environ={"LICHESS_TOKEN": "a-token"})

    urls = [url for url, _ in sites.requests]
    assert "https://api.chess.com/pub/player/punkycam/games/2026/08/pgn" not in urls
    lichess_url, lichess_headers = [request for request in sites.requests if "lichess.org" in request[0]][0]
    # The oldest recorded game began on 2026-10-13 at 16:44:07 UTC.
    assert "since=1791909847000" in lichess_url
    assert lichess_headers["Authorization"] == "Bearer a-token"
    for url, headers in sites.requests:
        if "chess.com" in url:
            assert "Authorization" not in headers


def test_writes_nothing_when_run_again_with_no_game_played_since(tmp_path):
    raw = raw_dir_holding_the_oldest_recorded_game_of_each_site(tmp_path)
    fetch_new_games(raw, date(2026, 10, 27), recorded_sites(), environ={"LICHESS_TOKEN": "a-token"})
    files_after_the_first_run = sorted(path.name for path in raw.iterdir())

    written = fetch_new_games(raw, date(2026, 10, 27), recorded_sites(), environ={"LICHESS_TOKEN": "a-token"})

    assert written == []
    assert sorted(path.name for path in raw.iterdir()) == files_after_the_first_run
