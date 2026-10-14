"""Reads the Session Games visitors played on the site as evidence about the
Bot's Level: each of its moves with the evaluation it lost, and how early a
game slipped away from it.

The measures are the Blunder Profile's own, so the Bot's moves against a
visitor can be set beside Camille's moves against the players he met, and
beside the Bot's games against the Base Model at his rating.
"""

# A player whose position stands this far below equality, from their own
# side, has as good as lost the game at this level.
COLLAPSE_CENTIPAWNS = -300

# Plies before which a fall that far counts as an early collapse: the first
# fifteen moves of each side.
COLLAPSE_BEFORE_PLY = 30


def collapse_ply(evaluations: list[tuple[int, int]]) -> int | None:
    """The first ply, before move 15, at which the player's position stood three pawns down or worse.

    The evaluations are the player's own moves: the ply and the score of the
    position before the move, from the player's side. None when the player
    never fell that far that early.
    """
    for ply, evaluation in evaluations:
        if ply > COLLAPSE_BEFORE_PLY:
            continue
        if evaluation <= COLLAPSE_CENTIPAWNS:
            return ply
    return None
