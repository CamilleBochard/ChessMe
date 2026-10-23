"""Analyses the Session Games stored on the site as evidence about the Bot's Level.

Run from the repository root, with a copy of the database, in steps
around the Base Model's probabilities (scripts/analyse-session-games.sh runs
them all):

    python -m pipeline.analyse_session_games export --database data/session-games.sqlite \\
        --out data/session-analysis/bot-moves.jsonl
    python -m pipeline.analyse_session_games export --database data/session-games.sqlite \\
        --side visitor --out data/session-analysis/visitor-moves.jsonl
    npm run move-probabilities -- models/onnx/maia3-5m-fine-tuned.onnx --rating 1100 \\
        data/session-analysis/bot-moves.jsonl --out data/session-analysis/bot-move-probabilities.jsonl
    python -m pipeline.analyse_session_games report --database data/session-games.sqlite \\
        --moves data/session-analysis/bot-moves.jsonl \\
        --probabilities data/session-analysis/bot-move-probabilities.jsonl \\
        --visitor-moves data/session-analysis/visitor-moves.jsonl

The export has Stockfish 19 measure each of one side's moves at the Blunder
Profile's depth, from its cache: the Bot's, or with --side visitor the
visitors'. The report prints each game, then sets the games beside the Bot's
400 games against the Base Model at Camille's rating and beside Camille's
own games, on the same measures: how often a game slipped away before move
15, the average loss per Phase in open positions, and the share of the
model's moves under 1%. Given the visitors' moves, it sets their losses
beside the Bot's, which says how strong the players it met were. Games
played with analysis mode on are left out unless --include-assisted is
given.
"""

import argparse
import json
import math
import sqlite3
from collections import defaultdict
from pathlib import Path

import chess

from pipeline.blunder_profile import capped_centipawns, centipawn_loss, position_already_decided
from pipeline.dataset import PHASE_LABELS, PHASES, Position, read_dataset
from pipeline.extract_blunder_profile import DATASET_DIR, add_stockfish_arguments, running_stockfish
from pipeline.opening_book import position_key
from pipeline.session_game_analysis import (
    COLLAPSE_BEFORE_PLY,
    AnalysedMove,
    PhaseSummary,
    collapse_ply,
    phase_summaries,
    stored_games,
)
from pipeline.stockfish_analysis import Analyser, analyse_positions
from pipeline.session_games import open_store

# The Bot's games against the Base Model at Camille's rating, with each move's
# loss, as pipeline/export_bot_moves.py wrote them for the served model.
BOT_VERSUS_MODEL_MOVES = DATASET_DIR / "bot-moves-fine-tuned-at-1.jsonl"

# The served model's probabilities for Camille's Test Set moves, and the
# Opening Book, whose positions the Bot never asks the model about.
CAMILLE_PROBABILITIES = DATASET_DIR / "move-probabilities" / "fine-tuned-test.jsonl"
OPENING_BOOK = DATASET_DIR / "opening-book.json"

# Where scripts/stage-model.ts puts the model the site serves, named after
# its file and a hash of it, as a Session Game records the model it played.
SERVED_MODEL_DIRECTORY = Path(__file__).resolve().parent.parent / "public" / "models"


def export(
    database: Path, out_path: Path, side: str, analysers: list[Analyser], cache_path: Path, include_assisted: bool
) -> int:
    """Writes one side's moves of the stored games, the Bot's or the visitor's, each with its loss and the evaluation before it."""
    store = open_store(database)
    try:
        games = stored_games(store, include_assisted=include_assisted)
    finally:
        store.close()
    moves = []
    for game in games:
        if side == "bot":
            moves.extend(game.bot_moves)
        else:
            moves.extend(game.visitor_moves)
    positions = [_position_of(move.game_id, move.ply, move.phase, move.fen, move.move) for move in moves]
    analyses = analyse_positions(positions, analysers, cache_path)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as out_file:
        for move in moves:
            analysis = analyses[(move.fen, move.move)]
            row = {
                "game_id": move.game_id,
                "source": "session",
                "ply": move.ply,
                "phase": move.phase,
                "fen": move.fen,
                "move": move.move,
                "came_from": move.came_from,
                "centipawn_loss": centipawn_loss(best=analysis.best, played=analysis.played),
                "open_position": not position_already_decided(best=analysis.best, played=analysis.played),
                "evaluation": capped_centipawns(analysis.best),
                "best_move": analysis.best_move,
            }
            out_file.write(json.dumps(row) + "\n")
    return len(moves)


def report(
    database: Path, moves_path: Path, probabilities_path: Path, visitor_moves_path: Path | None,
    analysers: list[Analyser], cache_path: Path, include_assisted: bool,
) -> None:
    """Prints each stored game, then the games beside the Bot's games against the model and Camille's own.

    Given the visitors' moves, as the export writes them, they get a column
    of their own: measured as the Bot's are, they say how strong the players
    it met were.
    """
    store = open_store(database)
    try:
        games = stored_games(store, include_assisted=include_assisted)
        model_of_game = _model_of_each_game(store, [game.id for game in games])
    finally:
        store.close()
    rows = _read_json_lines(moves_path)

    # The probabilities are the served model's, so they only describe the
    # games that model played; a game played by an earlier model shows none.
    served = _served_model_name()
    probabilities = {}
    for row in _read_json_lines(probabilities_path):
        if model_of_game.get(row["game_id"]) == served:
            probabilities[(row["game_id"], row["ply"])] = row
    played_with = defaultdict(int)
    for model in model_of_game.values():
        played_with[model] += 1

    rows_by_game = defaultdict(list)
    for row in rows:
        rows_by_game[row["game_id"]].append(row)

    print(f"{len(games)} Session Games{_assisted_note(include_assisted)}, played with {_models_text(played_with)}.")
    other_models = sum(count for model, count in played_with.items() if model != served)
    if other_models > 0:
        print(f"The site serves {served}: no probabilities for the {other_models} games another model played.")
    print()
    print("| Date | Bot | Result for the Bot | Moves | Slipped away before move 15 | The Bot's costliest move |")
    print("|---|---|---|---|---|---|")
    session_moves = []
    session_collapses = []
    for game in games:
        game_rows = rows_by_game[game.id]
        evaluations = [(row["ply"], row["evaluation"]) for row in game_rows]
        collapse = collapse_ply(evaluations)
        session_collapses.append(collapse)
        for row in game_rows:
            session_moves.append(_analysed(row, probabilities.get((row["game_id"], row["ply"]))))
        worst = _costliest_move(game_rows, probabilities)
        print(
            f"| {game.played_on} | {game.bot_colour} | {_result_for_the_bot(game.result, game.bot_colour)} | "
            f"{len(game_rows)} | {_collapse_text(collapse)} | {worst} |"
        )
    print()

    bot_rows = _read_json_lines(BOT_VERSUS_MODEL_MOVES)
    bot_evaluations = _evaluations_by_game(bot_rows, analysers, cache_path)
    bot_moves = _losses_with_open_flags(bot_rows, analysers, cache_path)

    dataset = read_dataset(DATASET_DIR)
    camille_positions = dataset.train + dataset.test
    camille_rows = [_row_of(position) for position in camille_positions]
    camille_evaluations = _evaluations_by_game(camille_rows, analysers, cache_path)
    camille_moves = _losses_with_open_flags(camille_rows, analysers, cache_path)
    camille_probabilities = _camille_model_moves()

    columns = {
        f"Session Games ({len(games)})": (session_collapses, phase_summaries(session_moves)),
    }
    if visitor_moves_path is not None:
        columns[f"Their visitors ({len(games)})"] = _visitor_column(_read_json_lines(visitor_moves_path), games)
    columns |= {
        f"Bot against the model ({len(bot_evaluations)})": (
            [collapse_ply(evaluations) for evaluations in bot_evaluations.values()],
            phase_summaries(bot_moves),
        ),
        f"Camille's games ({len(camille_evaluations)})": (
            [collapse_ply(evaluations) for evaluations in camille_evaluations.values()],
            _merge_improbability(phase_summaries(camille_moves), phase_summaries(camille_probabilities)),
        ),
    }

    print(f"| Measure (Stockfish 19, depth 18) | {' | '.join(columns)} |")
    print(f"|---|{'---|' * len(columns)}")
    collapse_cells = [_share_cell(collapses) for collapses, _ in columns.values()]
    collapse_label = f"Games slipped away before move {COLLAPSE_BEFORE_PLY // 2} (3 pawns down)"
    print(f"| {collapse_label} | {' | '.join(collapse_cells)} |")
    for phase in PHASES:
        cells = [_loss_cell(summaries[phase]) for _, summaries in columns.values()]
        print(f"| Average loss, {PHASE_LABELS[phase]}, open positions | {' | '.join(cells)} |")
    for phase in PHASES:
        cells = [_improbable_cell(summaries[phase]) for _, summaries in columns.values()]
        print(f"| Model moves under 1%, {PHASE_LABELS[phase]} | {' | '.join(cells)} |")
    print()
    print(
        "The Bot's games against the model were played without the opening cut and carry no fine-tuned "
        "probabilities. Camille's share under 1% reads his Test Set moves outside the Opening Book, "
        "as the panel's yardstick does. A share carries ± two standard errors."
    )


def _visitor_column(rows: list[dict], games: list) -> tuple[list[int | None], dict[str, PhaseSummary]]:
    """How early each game slipped away from the visitor, and their losses per Phase."""
    rows_by_game = defaultdict(list)
    for row in rows:
        rows_by_game[row["game_id"]].append(row)
    collapses = []
    for game in games:
        evaluations = [(row["ply"], row["evaluation"]) for row in rows_by_game[game.id]]
        collapses.append(collapse_ply(evaluations))
    # The visitor's moves carry no model probability.
    moves = [_analysed(row, None) for row in rows]
    return collapses, phase_summaries(moves)


def _position_of(game_id: str, ply: int, phase: str, fen: str, move: str) -> Position:
    return Position(game_id=game_id, source="session", ply=ply, phase=phase, fen=fen, move=move)


def _row_of(position: Position) -> dict:
    return {
        "game_id": position.game_id,
        "ply": position.ply,
        "phase": position.phase,
        "fen": position.fen,
        "move": position.move,
    }


def _evaluations_by_game(
    rows: list[dict], analysers: list[Analyser], cache_path: Path
) -> dict[str, list[tuple[int, int]]]:
    """Per game, each of the player's moves as its ply and the evaluation before it, from the player's side."""
    positions = [_position_of(row["game_id"], row["ply"], row["phase"], row["fen"], row["move"]) for row in rows]
    analyses = analyse_positions(positions, analysers, cache_path)
    by_game = defaultdict(list)
    for row in rows:
        analysis = analyses[(row["fen"], row["move"])]
        by_game[row["game_id"]].append((row["ply"], capped_centipawns(analysis.best)))
    return by_game


def _losses_with_open_flags(rows: list[dict], analysers: list[Analyser], cache_path: Path) -> list[AnalysedMove]:
    """Each move's loss and whether its position was open, read from the Blunder Profile's cache."""
    positions = [_position_of(row["game_id"], row["ply"], row["phase"], row["fen"], row["move"]) for row in rows]
    analyses = analyse_positions(positions, analysers, cache_path)
    moves = []
    for row in rows:
        analysis = analyses[(row["fen"], row["move"])]
        moves.append(
            AnalysedMove(
                phase=row["phase"],
                centipawn_loss=centipawn_loss(best=analysis.best, played=analysis.played),
                open_position=not position_already_decided(best=analysis.best, played=analysis.played),
                probability=None,
            )
        )
    return moves


def _camille_model_moves() -> list[AnalysedMove]:
    """Camille's Test Set moves outside the Opening Book, with the served model's probability for each."""
    book = json.loads(OPENING_BOOK.read_text(encoding="utf-8"))["positions"]
    moves = []
    for row in _read_json_lines(CAMILLE_PROBABILITIES):
        if position_key(row["fen"]) in book:
            continue
        # Only the probability is read from these; the losses come from all his games.
        move = AnalysedMove(phase=row["phase"], centipawn_loss=0, open_position=False, probability=row["probability"])
        moves.append(move)
    return moves


def _merge_improbability(losses: dict, improbability: dict) -> dict:
    """Camille's losses from all his games, with the share under 1% read from his Test Set."""
    merged = {}
    for phase in PHASES:
        merged[phase] = PhaseSummary(
            open_moves=losses[phase].open_moves,
            average_loss=losses[phase].average_loss,
            model_moves=improbability[phase].model_moves,
            share_under_1_percent=improbability[phase].share_under_1_percent,
        )
    return merged


def _analysed(row: dict, probability_row: dict | None) -> AnalysedMove:
    probability = None
    if row["came_from"] == "base-model" and probability_row is not None:
        probability = probability_row["probability"]
    return AnalysedMove(
        phase=row["phase"],
        centipawn_loss=row["centipawn_loss"],
        open_position=row["open_position"],
        probability=probability,
    )


def _costliest_move(game_rows: list[dict], probabilities: dict) -> str:
    """The Bot's move that lost the most in an open position, with how the model rated it."""
    open_rows = [row for row in game_rows if row["open_position"]]
    if not open_rows:
        return "none in an open position"
    worst = max(open_rows, key=lambda row: row["centipawn_loss"])
    board = chess.Board(worst["fen"])
    move_number = board.fullmove_number
    dots = "." if board.turn == chess.WHITE else "…"
    san = board.san(chess.Move.from_uci(worst["move"]))
    pawns = worst["centipawn_loss"] / 100
    text = f"{move_number}{dots}{san}, {pawns:.1f} pawns"
    if worst["came_from"] == "opening-book":
        return f"{text}, from the Opening Book"
    probability_row = probabilities.get((worst["game_id"], worst["ply"]))
    if probability_row is not None:
        text += f", model {100 * probability_row['probability']:.1f}% (choice {probability_row['rank']})"
    return text


def _model_of_each_game(store: sqlite3.Connection, game_ids: list[str]) -> dict[str, str]:
    """The Base Model each game was played with, read from the PGN header the store wrote."""
    models = {}
    for game_id in game_ids:
        (pgn,) = store.execute("SELECT pgn FROM session_games WHERE id = ?", (game_id,)).fetchone()
        for line in pgn.splitlines():
            if line.startswith('[BaseModel "'):
                models[game_id] = line.split('"')[1]
    return models


def _served_model_name() -> str | None:
    """The name the site's model is recorded under, as staged for the site; None before it is staged."""
    staged = sorted(SERVED_MODEL_DIRECTORY.glob("*.onnx"))
    if not staged:
        return None
    return staged[0].stem


def _models_text(played_with: dict[str, int]) -> str:
    if not played_with:
        return "no model"
    return ", ".join(f"{model} ({count})" for model, count in played_with.items())


def _assisted_note(include_assisted: bool) -> str:
    if include_assisted:
        return ", assisted ones included"
    return " played without analysis mode"


def _result_for_the_bot(result: str, bot_colour: str) -> str:
    if result == "1/2-1/2":
        return "draw"
    white_won = result == "1-0"
    bot_is_white = bot_colour == "white"
    if white_won == bot_is_white:
        return "win"
    return "loss"


def _collapse_text(collapse: int | None) -> str:
    if collapse is None:
        return "no"
    return f"yes, by move {math.ceil(collapse / 2)}"


def _share_cell(collapses: list[int | None]) -> str:
    games = len(collapses)
    if games == 0:
        return "no game"
    collapsed = sum(1 for collapse in collapses if collapse is not None)
    share = collapsed / games
    standard_error = math.sqrt(share * (1 - share) / games)
    return f"{collapsed} of {games}: {100 * share:.0f}% ± {200 * standard_error:.0f}"


def _loss_cell(summary: PhaseSummary) -> str:
    if summary.average_loss is None:
        return "no move"
    return f"{summary.average_loss:.0f} cp ({summary.open_moves})"


def _improbable_cell(summary: PhaseSummary) -> str:
    if summary.share_under_1_percent is None:
        return "–"
    return f"{100 * summary.share_under_1_percent:.1f}% ({summary.model_moves})"


def _read_json_lines(path: Path) -> list[dict]:
    lines = path.read_text(encoding="utf-8").splitlines()
    return [json.loads(line) for line in lines if line.strip() != ""]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Analyse the stored Session Games as evidence about the Bot's Level.")
    steps = parser.add_subparsers(dest="step", required=True)

    export_step = steps.add_parser("export", help="write one side's moves with their losses")
    export_step.add_argument("--out", type=Path, required=True, help="where to write the moves, one per line")
    export_step.add_argument(
        "--side", choices=["bot", "visitor"], default="bot", help="whose moves to write (default the Bot's)"
    )

    report_step = steps.add_parser("report", help="print the games beside the Bot's games and Camille's")
    report_step.add_argument("--moves", type=Path, required=True, help="the moves the export wrote")
    report_step.add_argument("--probabilities", type=Path, required=True, help="npm run move-probabilities on them")
    report_step.add_argument("--visitor-moves", type=Path, help="the visitors' moves the export wrote with --side visitor")

    for step in (export_step, report_step):
        step.add_argument("--database", type=Path, required=True, help="the SQLite file the games are stored in")
        step.add_argument(
            "--include-assisted", action="store_true", help="also read games played with analysis mode on"
        )
        add_stockfish_arguments(step)
    arguments = parser.parse_args()

    if not arguments.database.exists():
        parser.error(f"no database at {arguments.database}")

    with running_stockfish(arguments.depth, arguments.workers) as (stockfish_processes, cache_path):
        if arguments.step == "export":
            written = export(
                arguments.database, arguments.out, arguments.side, stockfish_processes, cache_path,
                arguments.include_assisted,
            )
            whose = "the Bot"
            if arguments.side == "visitor":
                whose = "the visitors"
            print(f"{written} moves of {whose} written to {arguments.out}")
        else:
            report(
                arguments.database, arguments.moves, arguments.probabilities, arguments.visitor_moves,
                stockfish_processes, cache_path, arguments.include_assisted,
            )
