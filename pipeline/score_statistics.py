"""How well scores separate two groups of games, and how far a figure would move with other games.

The style discriminator gives every game a score, the probability that
Camille played it. These functions turn lists of scores into the figures
the experiment reports, with an interval around each.
"""

from typing import Callable

import numpy as np


def area_under_curve(positive_scores: list[float], negative_scores: list[float]) -> float:
    """The probability that a game drawn from the first group scores higher than one drawn from the second.

    0.5 is a coin toss and 1 a perfect separation. It is the area under the
    ROC curve, computed directly from its meaning: every pair of one game
    from each group is compared, and a tie counts as half right.
    """
    positives = np.asarray(positive_scores, dtype=float)
    negatives = np.asarray(negative_scores, dtype=float)
    # One row per positive game, one column per negative game: every pair
    # at once, which the bootstrap needs since it repeats this thousands of
    # times on hundreds of games.
    ranked_right = np.greater.outer(positives, negatives)
    tied = np.equal.outer(positives, negatives)
    pairs_ranked_right = ranked_right.sum() + 0.5 * tied.sum()
    pairs = len(positives) * len(negatives)
    return float(pairs_ranked_right / pairs)


def bootstrap_interval(
    groups: list[list[float]],
    statistic: Callable[..., float],
    resamples: int = 2000,
    confidence: float = 0.95,
    seed: int = 0,
) -> tuple[float, float]:
    """The range a figure would likely fall in with another sample of games of the same kinds.

    statistic takes one list of scores per group, such as the scores of
    Camille's games and of the other players' games, and returns the figure.
    Each resample draws, in every group, as many games as it holds, at
    random and with replacement, and computes the figure again; the middle
    `confidence` share of the resampled figures is the interval. The draws
    are seeded, so the interval is the same on every run.
    """
    generator = np.random.default_rng(seed)
    arrays = [np.asarray(group, dtype=float) for group in groups]

    resampled_figures = []
    for _ in range(resamples):
        resampled_groups = []
        for array in arrays:
            drawn = generator.choice(array, size=len(array), replace=True)
            resampled_groups.append(drawn.tolist())
        resampled_figures.append(statistic(*resampled_groups))

    tail = (1 - confidence) / 2
    low = float(np.quantile(resampled_figures, tail))
    high = float(np.quantile(resampled_figures, 1 - tail))
    return low, high
