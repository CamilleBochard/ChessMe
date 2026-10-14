# Level on open positions

Level is how often a move is a mistake and how large the mistake is, and the
[Blunder Profile](blunder-profile.md) measures it as the distribution of
Camille's evaluation losses. The Bot's temperature is chosen by how close its
losses come to that profile ([the draw's temperature](draw-temperature.md)),
and so was the fine-tuned model's ([the model choice](model-choice.md)).

The profile counts every move, including those made once a game is decided.
Beyond ten pawns either way the evaluation is capped, so a move there is read
as losing nothing. Camille's games often end by resignation, while the Bot's,
played under Node, run on to mate. At temperature 1, 36.7% of the Bot's endgame
moves were made in decided positions, against 18.5% of his. Comparing the two
endgames therefore compares a player who resigns with one who does not.

The fine-tuned model's temperature came out at 1.25 rather than 1 on the
endgame alone, by less than chance, and the model choice turned on that
temperature. The distance without decided positions, reported in both
write-ups as a check, pointed to 1 both times.

This experiment makes the comparison like with like: Level is measured on the
moves made in [Open Positions](../../CONTEXT.md), for Camille and the Bot
alike. That measure becomes the yardstick the next choices are made with.

## The measure, stated before the figures were read

**An Open Position** is one in which the move played could still be a
mistake. A move is left out when the best move and the move played both score
ten pawns or more for the same side, mates included: there, the cap reads any
move as losing nothing. The test is the one tickets 22 and 19 already used for
their check (`position_already_decided` in `pipeline/blunder_profile.py`),
unchanged.

**Level on open positions** is the distribution of losses of the moves made in
Open Positions, per Phase, built exactly as the Blunder Profile is: the same
Stockfish 19 at depth 18, the same cache, the same buckets and percentiles.

**The distance on open positions** is the draw's temperature's distance
computed on those moves alone, for both players. Each Phase is compared on its
own by the earth mover's distance. The Phases are then weighed by Camille's
share of moves in Open Positions in each.

**What chance looks like.** Camille's Test Set is measured against his
training games by the same distance on open positions, as the all-moves
distance was (3.6 centipawns). A gap between two temperatures smaller than
that is not evidence that one is closer.

## What is re-read, stated before the figures were read

Nothing is played or analysed again. The games of tickets 22 and 19 are read
from the same files and every move from the same Stockfish cache.

- **The original model's temperature** (ticket 22): its runs at 0.75, 1 and
  1.25.
- **The fine-tuned model's temperature** (ticket 19): its runs at 0.75, 1, 1.25
  and 1.5.
- **The two Bots of the model choice** (ticket 19): 400 games each, reported on
  open positions as context.

For each model, the draw's temperature's rule (`next_step` in
`pipeline/draw_temperature.py`) is applied unchanged to the distances on open
positions. The write-up reports the temperature it chooses, the gap to the
next closest beside the chance gap, and each Phase's distance. If the rule
asks for a temperature these runs did not measure, the write-up says so and
does not guess: playing new games is the next choice's work.

Camille's Level on open positions is reported per Phase beside his Blunder
Profile, with the share of his moves left out.

**What follows.** Nothing the site serves changes here. The temperature and
the model are chosen again, with this yardstick, in the next ticket.
