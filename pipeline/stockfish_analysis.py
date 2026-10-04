"""Has Stockfish evaluate each of Camille's moves against the best move in the same position.

A full run over the dataset takes hours, so every analysis is appended to a
cache file the moment it is made: an interrupted run picks up where it
stopped, and a finished one is never repeated.
"""

import json
import queue
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Protocol

import chess
import chess.engine
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


class StockfishAnalyser:
    """Runs one Stockfish process at a fixed depth on a single thread.

    A single thread and a cleared hash table before each position make an
    analysis depend on the position and depth alone, so a re-run gives the
    same scores.
    """

    def __init__(self, binary_path: Path, depth: int):
        self.depth = depth
        self._stockfish = chess.engine.SimpleEngine.popen_uci(str(binary_path))
        self._stockfish.configure({"Threads": 1})
        self.engine = self._stockfish.id["name"]

    def analyse(self, fen: str, move: str) -> Analysis:
        board = chess.Board(fen)
        played_move = chess.Move.from_uci(move)
        limit = chess.engine.Limit(depth=self.depth)
        # A new game key makes python-chess send ucinewgame, which clears the
        # hash; the two searches below share the key, so the second can reuse
        # what the first found.
        this_position = object()

        best_search = self._stockfish.analyse(board, limit, game=this_position)
        best_move = best_search["pv"][0]
        best_score = best_search["score"].pov(board.turn)
        if best_move == played_move:
            return Analysis(best_move=best_move.uci(), best=best_score, played=best_score)

        played_search = self._stockfish.analyse(board, limit, game=this_position, root_moves=[played_move])
        played_score = played_search["score"].pov(board.turn)
        return Analysis(best_move=best_move.uci(), best=best_score, played=played_score)

    def close(self) -> None:
        self._stockfish.quit()

    def __enter__(self) -> "StockfishAnalyser":
        return self

    def __exit__(self, *exception_details) -> None:
        self.close()


def analyse_positions(
    positions: list[Position],
    analysers: list[Analyser],
    cache_path: Path,
    report_progress: Callable[[int, int], None] | None = None,
) -> dict[tuple[str, str], Analysis]:
    """Analyses each position's move, keyed by (FEN, move).

    Moves already in the cache are read from it rather than analysed again,
    provided the same engine analysed them at the same depth. Each analyser
    works on one move at a time, so several analysers run in parallel.
    All analysers must be the same engine at the same depth.

    report_progress, if given, is called after each new analysis with how many
    have been made and how many this run has to make.
    """
    engine = analysers[0].engine
    depth = analysers[0].depth
    analyses = _read_cache(cache_path, engine, depth)

    positions_to_analyse = {}
    for position in positions:
        key = (position.fen, position.move)
        if key in analyses:
            continue
        positions_to_analyse[key] = position

    free_analysers: queue.Queue[Analyser] = queue.Queue()
    for analyser in analysers:
        free_analysers.put(analyser)

    def analyse_with_a_free_analyser(position: Position) -> Analysis:
        analyser = free_analysers.get()
        try:
            return analyser.analyse(position.fen, position.move)
        finally:
            free_analysers.put(analyser)

    executor = ThreadPoolExecutor(max_workers=len(analysers))
    try:
        with open(cache_path, "a", encoding="utf-8") as cache_file:
            future_positions = {}
            for position in positions_to_analyse.values():
                future = executor.submit(analyse_with_a_free_analyser, position)
                future_positions[future] = position
            # Only this thread writes the cache, in the order analyses finish.
            analysed_this_run = 0
            for future in as_completed(future_positions):
                position = future_positions[future]
                analysis = future.result()
                analyses[(position.fen, position.move)] = analysis
                _append_to_cache(cache_file, position, analysis, engine, depth)
                analysed_this_run += 1
                if report_progress is not None:
                    report_progress(analysed_this_run, len(future_positions))
    finally:
        # On an interruption, moves not yet started are dropped rather than
        # analysed before the run can stop.
        executor.shutdown(cancel_futures=True)
    return analyses


def _read_cache(cache_path: Path, engine: str, depth: int) -> dict[tuple[str, str], Analysis]:
    analyses = {}
    if not cache_path.exists():
        return analyses
    _drop_half_written_last_line(cache_path)
    for line in cache_path.read_text(encoding="utf-8").splitlines():
        record = json.loads(line)
        # Mixing depths would blur what the profile measures.
        if record["engine"] != engine or record["depth"] != depth:
            continue
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


def _append_to_cache(cache_file, position: Position, analysis: Analysis, engine: str, depth: int) -> None:
    record = {
        "fen": position.fen,
        "move": position.move,
        "engine": engine,
        "depth": depth,
        "best_move": analysis.best_move,
        "best": _score_to_json(analysis.best),
        "played": _score_to_json(analysis.played),
    }
    line = json.dumps(record)
    cache_file.write(line + "\n")
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
