import json
import shutil
from datetime import date
from pathlib import Path

import pytest
from chess.engine import Cp

from pipeline.dataset import read_dataset
from pipeline.dated_files import dated_files_in_order
from pipeline.extract_blunder_profile import REPOSITORY_ROOT
from pipeline.refresh_games import Engine, RefreshPaths, RefreshTools, refresh, site_yardstick_commands
from pipeline.stockfish_analysis import Analysis

FIXTURES = Path(__file__).parent / "fixtures"


class FakeAnalyser:
    """Stands in for one Stockfish build: every move loses one pawn; remembers what it was asked."""

    def __init__(self, engine: str, depth: int):
        self.engine = engine
        self.depth = depth
        self.asked = []

    def analyse(self, fen: str, move: str) -> Analysis:
        self.asked.append((fen, move))
        return Analysis(best_move="e2e4", best=Cp(30), played=Cp(-70))


def no_new_game(url: str, headers: dict[str, str]) -> str:
    if url.endswith("/games/archives"):
        return json.dumps({"archives": []})
    return ""


def place_moves_with_a_stand_in(positions_path: Path, records_path: Path) -> int:
    """Stands in for the Base Model: records each position not yet recorded, and says how many."""
    recorded = set()
    if records_path.exists():
        for line in records_path.read_text(encoding="utf-8").splitlines():
            record = json.loads(line)
            recorded.add((record["game_id"], record["ply"]))
    added = []
    for line in positions_path.read_text(encoding="utf-8").splitlines():
        position = json.loads(line)
        if (position["game_id"], position["ply"]) not in recorded:
            added.append(json.dumps({"game_id": position["game_id"], "ply": position["ply"], "probability": 0.5}) + "\n")
    with open(records_path, "a", encoding="utf-8") as records:
        records.writelines(added)
    return len(added)


def write_yardsticks_with_a_stand_in(paths: RefreshPaths, since: str | None) -> None:
    phases = {phase: {"atOrBelow": [0.0] * 51, "perGame": None} for phase in ("opening", "middlegame", "endgame")}
    paths.improbability_yardstick.write_text(json.dumps({"phases": phases}), encoding="utf-8")
    paths.loss_yardstick.write_text(json.dumps({"phases": phases}), encoding="utf-8")


class FirstChoicesStandIn:
    """Stands in for the two models under Node: the served model's first choice is Camille's move, the untrained one's never.

    Remembers which model was asked about which games, and which games the
    dataset held at that moment.
    """

    def __init__(self, paths: RefreshPaths):
        self.paths = paths
        self.asked = []

    def __call__(self, model: Path, positions: list) -> list[bool]:
        games_in_the_dataset = set()
        if (self.paths.dataset_dir / "train.jsonl").exists():
            dataset = read_dataset(self.paths.dataset_dir)
            games_in_the_dataset = {position.game_id for position in dataset.train + dataset.test}
        asked_games = {position.game_id for position in positions}
        self.asked.append({"model": model, "games": asked_games, "games_in_the_dataset": games_in_the_dataset})
        return [model == self.paths.served_model] * len(positions)


def repository_under(tmp_path: Path) -> RefreshPaths:
    paths = RefreshPaths.under(tmp_path)
    paths.raw_dir.mkdir(parents=True)
    for fixture in FIXTURES.glob("*.pgn"):
        shutil.copy(fixture, paths.raw_dir / fixture.name)
    # Two different files, so each model has a checksum of its own.
    paths.served_model.parent.mkdir(parents=True)
    paths.served_model.write_bytes(b"the served model")
    paths.untrained_model.write_bytes(b"the untrained model")
    return paths


def tools_with(deep: FakeAnalyser, browser: FakeAnalyser, paths: RefreshPaths) -> RefreshTools:
    return RefreshTools(
        get=no_new_game,
        environ={"LICHESS_TOKEN": "a-token"},
        deep=Engine(analysers=[deep], cache_path=paths.analysis_dir / "deep.jsonl"),
        browser=Engine(analysers=[browser], cache_path=paths.analysis_dir / "browser.jsonl"),
        place_moves=place_moves_with_a_stand_in,
        write_yardsticks=lambda since: write_yardsticks_with_a_stand_in(paths, since),
        first_choice_matches=FirstChoicesStandIn(paths),
    )


def built_files(paths: RefreshPaths) -> dict[str, bytes]:
    every_file = list(paths.raw_dir.iterdir()) + list(paths.dataset_dir.rglob("*.json*")) + list(paths.analysis_dir.iterdir())
    return {str(path): path.read_bytes() for path in every_file if path.is_file()}


def test_a_second_run_with_no_new_game_writes_no_game_file_analyses_nothing_and_rebuilds_the_same_files(tmp_path):
    paths = repository_under(tmp_path)
    deep = FakeAnalyser("Fake deep engine", 18)
    browser = FakeAnalyser("Fake browser engine", 14)
    refresh(paths, date(2026, 10, 27), tools_with(deep, browser, paths))
    assert deep.asked and browser.asked
    after_the_first_run = built_files(paths)
    deep.asked.clear()
    browser.asked.clear()

    summary = refresh(paths, date(2026, 10, 28), tools_with(deep, browser, paths))

    assert deep.asked == []
    assert browser.asked == []
    assert built_files(paths) == after_the_first_run
    assert summary["new_games"]["games"] == 0
    assert summary["new_game_files"] == []
    # Nothing to analyse, so nothing to check either.
    assert summary["identity_checks"] == {}


def test_records_how_many_cached_moves_each_engine_checked_before_analysing_new_ones(tmp_path):
    paths = repository_under(tmp_path)
    refresh(paths, date(2026, 10, 27), tools_with(FakeAnalyser("Fake deep engine", 18), FakeAnalyser("Fake browser engine", 14), paths))
    cached = len((paths.analysis_dir / "deep.jsonl").read_text().splitlines())
    shutil.copy(FIXTURES / "responses" / "lichess-games.pgn", paths.raw_dir / "lichess-2026-10-28.pgn")

    summary = refresh(paths, date(2026, 10, 28), tools_with(FakeAnalyser("Fake deep engine", 18), FakeAnalyser("Fake browser engine", 14), paths))

    assert summary["identity_checks"]["Fake deep engine at depth 18"] == {"compared": cached, "differences": 0}
    assert summary["identity_checks"]["Fake browser engine at depth 14"]["differences"] == 0


class ScoresOtherwise(FakeAnalyser):
    """A build that scores every move a centipawn differently from the one that filled the cache."""

    def analyse(self, fen: str, move: str) -> Analysis:
        self.asked.append((fen, move))
        return Analysis(best_move="e2e4", best=Cp(30), played=Cp(-71))


def test_stops_before_analysing_new_moves_or_rebuilding_anything_when_this_machine_scores_cached_moves_otherwise(tmp_path):
    paths = repository_under(tmp_path)
    refresh(paths, date(2026, 10, 27), tools_with(FakeAnalyser("Fake deep engine", 18), FakeAnalyser("Fake browser engine", 14), paths))
    # A new game arrives, with moves no cache holds.
    shutil.copy(FIXTURES / "responses" / "lichess-games.pgn", paths.raw_dir / "lichess-2026-10-28.pgn")
    built_before = {path: content for path, content in built_files(paths).items() if "/data/raw/" not in path}
    cached_moves = {(json.loads(line)["fen"], json.loads(line)["move"]) for line in (paths.analysis_dir / "deep.jsonl").read_text().splitlines()}
    other_build = ScoresOtherwise("Fake deep engine", 18)

    with pytest.raises(SystemExit) as stopped:
        refresh(paths, date(2026, 10, 28), tools_with(other_build, FakeAnalyser("Fake browser engine", 14), paths))

    assert "does not score" in str(stopped.value)
    assert set(other_build.asked) <= cached_moves
    built_after = {path: content for path, content in built_files(paths).items() if "/data/raw/" not in path}
    assert built_after == built_before


def test_rebuilds_from_the_exports_as_they_stand_without_asking_the_sites_when_told_not_to_fetch(tmp_path):
    paths = repository_under(tmp_path)
    tools = tools_with(FakeAnalyser("Fake deep engine", 18), FakeAnalyser("Fake browser engine", 14), paths)
    requests = []
    tools.get = lambda url, headers: requests.append(url)
    tools.environ = {}

    summary = refresh(paths, date(2026, 10, 27), tools, fetch=False)

    assert requests == []
    assert summary["new_game_files"] == []
    assert (paths.dataset_dir / "train.jsonl").exists()


def test_names_the_files_the_site_yardsticks_are_read_from_relative_to_the_repository():
    paths = RefreshPaths.under(REPOSITORY_ROOT)

    commands = site_yardstick_commands(paths, since="2026-03-01T10:00:00")

    for command in commands:
        for argument in command:
            assert not argument.startswith("/"), argument
    assert "data/dataset/move-probabilities/fine-tuned-test.jsonl" in commands[0]
    assert commands[0][-2:] == ["--since", "2026-03-01T10:00:00"]


def test_names_in_its_summary_the_game_files_a_separate_fetch_wrote_when_told_which(tmp_path):
    paths = repository_under(tmp_path)
    tools = tools_with(FakeAnalyser("Fake deep engine", 18), FakeAnalyser("Fake browser engine", 14), paths)
    shutil.copy(FIXTURES / "responses" / "lichess-games.pgn", paths.raw_dir / "lichess-2026-10-27.pgn")

    summary = refresh(paths, date(2026, 10, 27), tools, fetch=False, fetched=[paths.raw_dir / "lichess-2026-10-27.pgn"])

    assert summary["new_game_files"] == ["lichess-2026-10-27.pgn"]


def test_never_writes_over_a_summary_of_the_same_day_and_reads_the_last_one_written_as_the_previous(tmp_path):
    paths = repository_under(tmp_path)
    tools = tools_with(FakeAnalyser("Fake deep engine", 18), FakeAnalyser("Fake browser engine", 14), paths)
    refresh(paths, date(2026, 10, 27), tools)
    first = (paths.summaries_dir / "2026-10-27.json").read_bytes()

    refresh(paths, date(2026, 10, 27), tools)
    refresh(paths, date(2026, 10, 27), tools)

    assert (paths.summaries_dir / "2026-10-27.json").read_bytes() == first
    assert sorted(path.name for path in paths.summaries_dir.iterdir()) == ["2026-10-27-2.json", "2026-10-27-3.json", "2026-10-27.json"]
    assert dated_files_in_order(paths.summaries_dir)[-1].name == "2026-10-27-3.json"


def test_measures_both_models_on_the_new_games_only_before_the_dataset_takes_them_in(tmp_path):
    paths = repository_under(tmp_path)
    refresh(paths, date(2026, 10, 27), tools_with(FakeAnalyser("Fake deep engine", 18), FakeAnalyser("Fake browser engine", 14), paths))
    games_before = {position.game_id for position in read_dataset(paths.dataset_dir).train + read_dataset(paths.dataset_dir).test}
    shutil.copy(FIXTURES / "responses" / "lichess-games.pgn", paths.raw_dir / "lichess-2026-10-28.pgn")
    tools = tools_with(FakeAnalyser("Fake deep engine", 18), FakeAnalyser("Fake browser engine", 14), paths)

    summary = refresh(paths, date(2026, 10, 28), tools, fetch=False, fetched=[paths.raw_dir / "lichess-2026-10-28.pgn"])

    after = read_dataset(paths.dataset_dir)
    new_positions = [position for position in after.train + after.test if position.game_id not in games_before]
    new_games = {position.game_id for position in new_positions}
    asked = tools.first_choice_matches.asked
    assert [question["model"] for question in asked] == [paths.served_model, paths.untrained_model]
    for question in asked:
        assert question["games"] == new_games
        assert question["games_in_the_dataset"] == games_before
    measured = summary["new_games_matching"]
    assert (measured["games"], measured["moves"]) == (len(new_games), len(new_positions))
    assert measured["measurement"] == "2026-10-28.json"
    recorded = json.loads((paths.monthly_dir / "2026-10-28.json").read_text())
    assert recorded["game_files"] == ["lichess-2026-10-28.pgn"]
    assert len(recorded["games"]) == len(new_games)
    assert "Games played" in (paths.monthly_dir / "README.md").read_text()


def test_skips_the_measure_with_a_message_when_the_refresh_brings_no_new_game(tmp_path, capsys):
    paths = repository_under(tmp_path)
    tools = tools_with(FakeAnalyser("Fake deep engine", 18), FakeAnalyser("Fake browser engine", 14), paths)

    summary = refresh(paths, date(2026, 10, 27), tools)

    assert tools.first_choice_matches.asked == []
    assert summary["new_games_matching"] == {"skipped": "no new game"}
    assert "no new game" in capsys.readouterr().out
    assert not paths.monthly_dir.exists()
