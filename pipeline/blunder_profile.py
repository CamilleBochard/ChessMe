"""Builds the Blunder Profile: the measured distribution of Camille's own
evaluation losses, sliced by Phase.

It is a yardstick the Bot is compared against, not a mechanism applied to it.
"""

from chess.engine import Score

# Beyond ten pawns a position is decided either way, and a mate has no
# centipawn value of its own: both are read as this many centipawns. Without
# the cap, dropping from +25 to +15 in a won position would count as a
# ten-pawn blunder.
EVALUATION_CAP = 1000


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
