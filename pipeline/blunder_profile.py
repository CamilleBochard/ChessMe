"""Builds the Blunder Profile: the measured distribution of Camille's own
evaluation losses, sliced by Phase.

It is a yardstick the Bot is compared against, not a mechanism applied to it.
"""

import math
from collections import defaultdict
from dataclasses import dataclass

from chess.engine import Score

from pipeline.dataset import PHASES

# Where the histogram's buckets start, in centipawns; each bucket runs up to
# the next start, the last one has no end. The first bucket holds exactly the
# moves that lost nothing. 50, 100 and 300 are bucket edges so the usual
# inaccuracy, mistake and blunder thresholds can be read off the histogram.
HISTOGRAM_BUCKET_STARTS = [0, 1, 10, 25, 50, 100, 200, 300, 500, 1000]

# Most moves lose little, so the percentiles that tell players apart are in
# the tail.
PERCENTILES = [50, 75, 90, 95, 99]

# Beyond ten pawns a position is decided either way, and a mate has no
# centipawn value of its own: both are read as this many centipawns. Without
# the cap, dropping from +25 to +15 in a won position would count as a
# ten-pawn blunder.
EVALUATION_CAP = 1000


@dataclass(frozen=True)
class MoveLoss:
    """One of Camille's moves and the evaluation it lost."""

    game_id: str
    ply: int
    phase: str
    centipawn_loss: int


def build_blunder_profile(moves: list[MoveLoss]) -> dict:
    """Summarises the losses of each Phase as a distribution."""
    losses_by_phase: dict[str, list[int]] = defaultdict(list)
    for move in moves:
        losses_by_phase[move.phase].append(move.centipawn_loss)

    phases = {}
    for phase in PHASES:
        phases[phase] = _distribution(losses_by_phase[phase])

    every_loss = [move.centipawn_loss for move in moves]
    return {"phases": phases, "all_phases": _distribution(every_loss)}


def _distribution(losses: list[int]) -> dict:
    mean = None
    if losses:
        mean = sum(losses) / len(losses)
    return {
        "moves": len(losses),
        "mean": mean,
        "percentiles": nearest_rank_percentiles(losses, PERCENTILES),
        "histogram": _histogram(losses),
    }


def nearest_rank_percentiles(values: list[int], percentiles: list[int]) -> dict[str, int | None]:
    """The p-th percentile is the smallest value with at least p% of the values at or below it."""
    ordered = sorted(values)
    result = {}
    for percentile in percentiles:
        if not ordered:
            result[str(percentile)] = None
            continue
        rank = math.ceil(percentile / 100 * len(ordered))
        result[str(percentile)] = ordered[rank - 1]
    return result


def _histogram(losses: list[int]) -> list[dict]:
    buckets = []
    for index, start in enumerate(HISTOGRAM_BUCKET_STARTS):
        is_last_bucket = index == len(HISTOGRAM_BUCKET_STARTS) - 1
        if is_last_bucket:
            end = None
            moves_in_bucket = [loss for loss in losses if loss >= start]
        else:
            end = HISTOGRAM_BUCKET_STARTS[index + 1]
            moves_in_bucket = [loss for loss in losses if start <= loss < end]
        buckets.append({"from": start, "to": end, "moves": len(moves_in_bucket)})
    return buckets


def share_losing_at_least(distribution: dict, centipawns: int) -> float | None:
    """The share of a distribution's moves that lost at least this many centipawns.

    Read off the histogram, so the threshold must be where a bucket starts.
    None when the distribution holds no move.
    """
    if centipawns not in HISTOGRAM_BUCKET_STARTS:
        raise ValueError(f"{centipawns} cp is not a histogram bucket edge: {HISTOGRAM_BUCKET_STARTS}")
    if distribution["moves"] == 0:
        return None

    moves_losing_that_much = 0
    for bucket in distribution["histogram"]:
        if bucket["from"] >= centipawns:
            moves_losing_that_much += bucket["moves"]
    return moves_losing_that_much / distribution["moves"]


def centipawn_loss(best: Score, played: Score) -> int:
    """How much evaluation the played move gave up against the best move, in centipawns.

    Both scores are from the point of view of the player who moved.
    """
    best_centipawns = _capped_centipawns(best)
    played_centipawns = _capped_centipawns(played)
    loss = best_centipawns - played_centipawns
    # The played move is searched on its own, so its score can come out a
    # little above the best move's; it still lost nothing.
    if loss < 0:
        return 0
    return loss


def _capped_centipawns(score: Score) -> int:
    # python-chess reads mate in n as mate_score - n; any mate score far above
    # the cap lands every mate exactly on the cap once clamped.
    centipawns = score.score(mate_score=100 * EVALUATION_CAP)
    if centipawns > EVALUATION_CAP:
        return EVALUATION_CAP
    if centipawns < -EVALUATION_CAP:
        return -EVALUATION_CAP
    return centipawns
