"""Measures the Bot's evaluation losses in games it played, beside Camille's Blunder Profile.

Every move goes through the Blunder Profile's own code: the same Stockfish
analysis, at the same depth, from the same cache. Each set of the Bot's games
is a run, under a label the caller chooses (a temperature, a model), and is
reported per Phase beside Camille's losses with how far apart the two are.
The profile is a yardstick: nothing here feeds back into how the Bot plays.
"""

from pathlib import Path
from typing import Callable

from pipeline.blunder_profile import (
    PERCENTILES,
    MoveLoss,
    build_blunder_profile,
    position_already_decided,
    share_losing_at_least,
)
from pipeline.bot_games import read_bot_games, read_bot_results
from pipeline.dataset import PHASE_LABELS, PHASES, Position, read_dataset
from pipeline.draw_temperature import loss_distance, phase_distances
from pipeline.extract_blunder_profile import measure_move_losses
from pipeline.stockfish_analysis import Analyser, analyse_positions


def measure_against_camille(
    dataset_dir: Path,
    runs: dict[str, Path],
    cache_path: Path,
    analysers: list[Analyser],
    report_progress: Callable[[int, int], None] | None = None,
) -> dict:
    """Measures Camille's moves and the Bot's in each run, keyed by the run's label."""
    dataset = read_dataset(dataset_dir)
    camille = measure_moves(dataset.train + dataset.test, analysers, cache_path, report_progress)
    # The same player on two sets of his own games: how far apart they land
    # is how far two sets of games drift by chance, the yardstick for whether
    # the gap between two runs means anything.
    training_games = measure_moves(dataset.train, analysers, cache_path, report_progress)
    test_set = measure_moves(dataset.test, analysers, cache_path, report_progress)

    measured_runs = {}
    for label, games_path in runs.items():
        bot_positions = read_bot_games(games_path)
        bot = measure_moves(bot_positions, analysers, cache_path, report_progress)
        games = {position.game_id for position in bot_positions}
        measured_runs[label] = {
            "games": len(games),
            "results": read_bot_results(games_path),
            "centipawn_loss": build_blunder_profile(bot.losses),
            "distance": loss_distance(bot.losses, camille.losses),
            "already_decided_share": bot.already_decided_share(),
            "distance_in_undecided_positions": loss_distance(bot.undecided_losses(), camille.undecided_losses()),
            "phase_distances": phase_distances(bot.losses, camille.losses),
            "phase_distances_in_undecided_positions": phase_distances(
                bot.undecided_losses(), camille.undecided_losses()
            ),
            "centipawn_loss_in_undecided_positions": build_blunder_profile(bot.undecided_losses()),
        }

    return {
        "engine": analysers[0].engine,
        "depth": analysers[0].depth,
        "camille": {
            "centipawn_loss": build_blunder_profile(camille.losses),
            "already_decided_share": camille.already_decided_share(),
            "centipawn_loss_in_undecided_positions": build_blunder_profile(camille.undecided_losses()),
        },
        "camille_test_set_from_training_games": loss_distance(test_set.losses, training_games.losses),
        "runs": measured_runs,
    }


class MeasuredMoves:
    """A player's moves with the evaluation each lost, and whether its position was already decided."""

    def __init__(self, losses: list[MoveLoss], already_decided: list[bool]):
        self.losses = losses
        self.already_decided = already_decided

    def undecided_losses(self) -> list[MoveLoss]:
        """The moves made while the game was still open, the only ones that could be a mistake."""
        undecided = []
        for loss, decided in zip(self.losses, self.already_decided):
            if not decided:
                undecided.append(loss)
        return undecided

    def already_decided_share(self) -> dict[str, float | None]:
        """Per Phase, the share of moves made in a position already decided."""
        shares = {}
        for phase in PHASES:
            flags = [decided for loss, decided in zip(self.losses, self.already_decided) if loss.phase == phase]
            if not flags:
                shares[phase] = None
                continue
            shares[phase] = sum(flags) / len(flags)
        return shares


def measure_moves(
    positions: list[Position],
    analysers: list[Analyser],
    cache_path: Path,
    report_progress: Callable[[int, int], None] | None,
) -> MeasuredMoves:
    losses = measure_move_losses(positions, analysers, cache_path, report_progress)
    # Every move is in the cache by now, so this analyses nothing again.
    analyses = analyse_positions(positions, analysers, cache_path)
    already_decided = []
    for position in positions:
        analysis = analyses[(position.fen, position.move)]
        already_decided.append(position_already_decided(best=analysis.best, played=analysis.played))
    return MeasuredMoves(losses, already_decided)


# The usual thresholds for an inaccuracy, a mistake and a blunder.
LOSS_THRESHOLDS = [50, 100, 300]


def loss_tables(camille: dict, runs: dict[str, dict], in_undecided_positions: bool = False) -> str:
    """One Markdown table per Phase: Camille's losses, then the Bot's in each run, under the run's name.

    With in_undecided_positions, only the moves made while the game was still
    open are counted, for both players.
    """
    header_cells = ["Player", "Moves", "Mean"]
    header_cells += [f"p{percentile}" for percentile in PERCENTILES]
    header_cells += [f"{threshold} or more" for threshold in LOSS_THRESHOLDS]

    profile_key = "centipawn_loss"
    if in_undecided_positions:
        profile_key = "centipawn_loss_in_undecided_positions"
    players = [("Camille", camille[profile_key])]
    for name, measured in runs.items():
        players.append((name, measured[profile_key]))

    lines = []
    for phase in PHASES:
        lines.append(PHASE_LABELS[phase])
        lines.append("")
        lines.append(table_row(header_cells))
        lines.append("|---|" + "---|" * (len(header_cells) - 1))
        for name, profile in players:
            lines.append(table_row([name] + _loss_cells(profile["phases"][phase])))
        lines.append("")
    return "\n".join(lines)


def _loss_cells(distribution: dict) -> list[str]:
    cells = [f"{distribution['moves']:,}", decimal(distribution["mean"])]
    for percentile in PERCENTILES:
        value = distribution["percentiles"][str(percentile)]
        if value is None:
            cells.append("-")
        else:
            cells.append(str(value))
    for threshold in LOSS_THRESHOLDS:
        cells.append(percent(share_losing_at_least(distribution, threshold)))
    return cells


def summary_table(runs: dict[str, dict], run_heading: str) -> str:
    """One row per run: its games, the Bot's results and how far its losses are from Camille's."""
    header_cells = [
        run_heading,
        "Games",
        "Won, drawn, lost",
        "Distance",
        "Distance, undecided positions",
        "Endgame moves in decided positions",
    ]
    lines = [table_row(header_cells), "|---|" + "---|" * (len(header_cells) - 1)]
    for label, measured in runs.items():
        outcome = measured["results"]
        cells = [
            label,
            f"{measured['games']:,}",
            f"{outcome['won']}, {outcome['drawn']}, {outcome['lost']}",
            decimal(measured["distance"]),
            decimal(measured["distance_in_undecided_positions"]),
            percent(measured["already_decided_share"]["endgame"]),
        ]
        lines.append(table_row(cells))
    return "\n".join(lines)


def phase_distance_table(runs: dict[str, dict]) -> str:
    """Each Phase's own distance in each run, with all moves, then without those in decided positions."""
    labels = list(runs)
    header_cells = ["Phase"] + labels + [f"{label}, undecided positions" for label in labels]
    lines = [table_row(header_cells), "|---|" + "---|" * (len(header_cells) - 1)]
    for phase in PHASES:
        cells = [PHASE_LABELS[phase]]
        for label in labels:
            cells.append(decimal(runs[label]["phase_distances"][phase]))
        for label in labels:
            cells.append(decimal(runs[label]["phase_distances_in_undecided_positions"][phase]))
        lines.append(table_row(cells))
    return "\n".join(lines)


def table_row(cells: list[str]) -> str:
    return f"| {' | '.join(cells)} |"


def decimal(value: float | None) -> str:
    if value is None:
        return "-"
    return f"{value:.1f}"


def percent(share: float | None) -> str:
    if share is None:
        return "-"
    return f"{100 * share:.1f}%"
