from chess.engine import Cp, Mate

from pipeline.dataset import Position
from pipeline.stockfish_analysis import Analysis, analyse_positions

START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"


class FakeAnalyser:
    """Stands in for Stockfish: scores every move by a fixed rule and remembers what it was asked."""

    engine = "Fake engine"

    def __init__(self, depth=18, played_score=Cp(-70)):
        self.depth = depth
        self.played_score = played_score
        self.asked = []

    def analyse(self, fen: str, move: str) -> Analysis:
        self.asked.append((fen, move))
        return Analysis(best_move="e2e4", best=Cp(30), played=self.played_score)


def played(game_id, fen, move, ply=1):
    return Position(game_id=game_id, source="lichess", ply=ply, phase="opening", fen=fen, move=move)


def test_analyses_every_position_with_the_analyser(tmp_path):
    positions = [played("lichess:a", START, "d2d4"), played("lichess:a", AFTER_E4, "c7c5", ply=2)]

    analyses = analyse_positions(positions, [FakeAnalyser()], tmp_path / "cache.jsonl")

    assert analyses[(START, "d2d4")] == Analysis(best_move="e2e4", best=Cp(30), played=Cp(-70))
    assert analyses[(AFTER_E4, "c7c5")] == Analysis(best_move="e2e4", best=Cp(30), played=Cp(-70))


def test_a_second_run_reads_the_cache_instead_of_analysing_again(tmp_path):
    positions = [played("lichess:a", START, "d2d4"), played("lichess:a", AFTER_E4, "c7c5", ply=2)]
    cache_path = tmp_path / "cache.jsonl"
    analyse_positions(positions, [FakeAnalyser()], cache_path)

    second_analyser = FakeAnalyser()
    analyses = analyse_positions(positions, [second_analyser], cache_path)

    assert second_analyser.asked == []
    assert analyses[(START, "d2d4")] == Analysis(best_move="e2e4", best=Cp(30), played=Cp(-70))


def test_a_mate_score_comes_back_from_the_cache_as_a_mate(tmp_path):
    positions = [played("lichess:a", START, "f2f3")]
    cache_path = tmp_path / "cache.jsonl"
    analyse_positions(positions, [FakeAnalyser(played_score=Mate(-2))], cache_path)

    analyses = analyse_positions(positions, [FakeAnalyser()], cache_path)

    assert analyses[(START, "f2f3")].played == Mate(-2)


class StoppedAnalyser(FakeAnalyser):
    """Analyses a few moves, then is stopped as if the run were interrupted with Ctrl+C."""

    def __init__(self, moves_before_stopping):
        super().__init__()
        self.moves_before_stopping = moves_before_stopping

    def analyse(self, fen: str, move: str) -> Analysis:
        if len(self.asked) == self.moves_before_stopping:
            raise KeyboardInterrupt
        return super().analyse(fen, move)


def test_a_stopped_run_resumes_with_the_moves_it_had_not_reached(tmp_path):
    positions = [
        played("lichess:a", START, "d2d4"),
        played("lichess:a", AFTER_E4, "c7c5", ply=2),
        played("lichess:b", START, "g1f3"),
    ]
    cache_path = tmp_path / "cache.jsonl"
    try:
        analyse_positions(positions, [StoppedAnalyser(moves_before_stopping=2)], cache_path)
    except KeyboardInterrupt:
        pass

    resumed_analyser = FakeAnalyser()
    analyses = analyse_positions(positions, [resumed_analyser], cache_path)

    assert resumed_analyser.asked == [(START, "g1f3")]
    assert len(analyses) == 3


def test_a_run_killed_while_writing_resumes_and_analyses_the_half_written_move_again(tmp_path):
    positions = [played("lichess:a", START, "d2d4"), played("lichess:a", AFTER_E4, "c7c5", ply=2)]
    cache_path = tmp_path / "cache.jsonl"
    analyse_positions(positions, [FakeAnalyser()], cache_path)
    complete_lines = cache_path.read_text(encoding="utf-8").splitlines()
    half_written_last_line = complete_lines[1][:40]
    cache_path.write_text(complete_lines[0] + "\n" + half_written_last_line, encoding="utf-8")

    resumed_analyser = FakeAnalyser()
    analyses = analyse_positions(positions, [resumed_analyser], cache_path)

    assert resumed_analyser.asked == [(AFTER_E4, "c7c5")]
    assert len(analyses) == 2
    third_analyser = FakeAnalyser()
    analyse_positions(positions, [third_analyser], cache_path)
    assert third_analyser.asked == []
