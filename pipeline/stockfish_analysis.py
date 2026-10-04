"""Has Stockfish evaluate each of Camille's moves against the best move in the same position.

A full run over the dataset takes hours, so every analysis is appended to a
cache file the moment it is made: an interrupted run picks up where it
stopped, and a finished one is never repeated.
"""

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from chess.engine import Cp, Mate, Score

from pipeline.dataset import Position


@dataclass(frozen=True)
class Analysis:
    """The best move in a position and how it and the played move score, from the mover's side."""

    best_move: str
    best: Score
    played: Score


class Analyser(Protocol):
    engine: str
    depth: int

    def analyse(self, fen: str, move: str) -> Analysis: ...


def analyse_positions(
    positions: list[Position], analysers: list[Analyser], cache_path: Path
) -> dict[tuple[str, str], Analysis]:
    """Analyses each position's move, keyed by (FEN, move).

    Moves already in the cache are read from it rather than analysed again.
    """
    analyser = analysers[0]
    analyses = _read_cache(cache_path)
    with open(cache_path, "a", encoding="utf-8") as cache_file:
        for position in positions:
            key = (position.fen, position.move)
            if key in analyses:
                continue
            analysis = analyser.analyse(position.fen, position.move)
            analyses[key] = analysis
            _append_to_cache(cache_file, position, analysis, analyser)
    return analyses


def _read_cache(cache_path: Path) -> dict[tuple[str, str], Analysis]:
    analyses = {}
    if not cache_path.exists():
        return analyses
    _drop_half_written_last_line(cache_path)
    for line in cache_path.read_text(encoding="utf-8").splitlines():
        record = json.loads(line)
        analysis = Analysis(
            best_move=record["best_move"],
            best=_score_from_json(record["best"]),
            played=_score_from_json(record["played"]),
        )
        analyses[(record["fen"], record["move"])] = analysis
    return analyses


def _drop_half_written_last_line(cache_path: Path) -> None:
    """Cuts a record left unfinished by a run killed while writing it.

    Every complete record ends with a newline, so anything after the last
    newline is unfinished. Left in place, it would fail to parse, and the next
    record appended would be glued onto it.
    """
    content = cache_path.read_text(encoding="utf-8")
    if content == "" or content.endswith("\n"):
        return
    last_newline = content.rfind("\n")
    complete_records = content[: last_newline + 1]
    cache_path.write_text(complete_records, encoding="utf-8")


def _append_to_cache(cache_file, position: Position, analysis: Analysis, analyser: Analyser) -> None:
    record = {
        "fen": position.fen,
        "move": position.move,
        "engine": analyser.engine,
        "depth": analyser.depth,
        "best_move": analysis.best_move,
        "best": _score_to_json(analysis.best),
        "played": _score_to_json(analysis.played),
    }
    cache_file.write(json.dumps(record) + "\n")
    # Written through at once, so stopping the run loses at most the move
    # being analysed.
    cache_file.flush()


def _score_to_json(score: Score) -> dict[str, int]:
    if score.is_mate():
        return {"mate": score.mate()}
    return {"cp": score.score()}


def _score_from_json(written: dict[str, int]) -> Score:
    if "mate" in written:
        return Mate(written["mate"])
    return Cp(written["cp"])
