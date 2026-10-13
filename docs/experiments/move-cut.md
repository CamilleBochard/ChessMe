# Cutting the improbable moves

Outside the Opening Book, the Bot draws its move from the Base Model's
probabilities (see [the drawn move](move-matching.md#the-drawn-move)). Every
legal move keeps a chance, so now and then the draw lands on a move the
model itself expects almost no player at its rating to play. In one of
Camille's games against the Bot, the move that lost it the game, 9.Bf4??,
had a probability of 0.13%, 22nd of 37 legal moves: a bishop dropped in a
quiet position, which reads as a gift rather than a human mistake.

Drawing only among the most likely moves would remove such moves. But
Camille himself plays some moves the model finds unlikely, and some of his
mistakes are among them, so removing every improbable move would take the
Bot away from him as surely as keeping them all. This experiment chooses
the cut from his own games, with one target: **the Bot should play
improbable moves as often as Camille does, not more.**

## What is measured

**Camille's improbability profile.** For each of his moves, the served
Base Model (Maia-3 5M at 1100) gives the move he played a probability and a
rank, 1 for the most likely move. They are computed under Node by the
engine's own code, the encoding and the runtime visitors' browsers use. His
profile is the share of his moves the model gave less than 1%, 2% and 5%,
per Phase: the counterpart of the [Blunder Profile](blunder-profile.md) for
the kind of move rather than its cost.

**The candidate cuts.** Each keeps some of the legal moves and rescales
their probabilities to sum to one; the Bot would draw among those alone.

- top-k: the k most likely moves, k in {3, 4, 5, 6, 8, 10};
- top-p: the most likely moves, taken in order until together they cover
  a share p of the probability, p in {0.80, 0.85, 0.90, 0.95, 0.98};
- min-p: the moves with at least a fraction a of the most likely move's
  probability, a in {0.02, 0.05, 0.10, 0.20};
- no cut, as the site draws today.

Every cut keeps the most likely move. Top-p and min-p adapt to the
position: where the model is sure they keep one or two moves, where it
hesitates they keep many.

**The Bot's expected profile under each cut.** On the same positions as
Camille's, the Bot's share of moves the model gives less than 1% is
computed from the model's distribution at temperature 1, not from games:
in each position, it is the probability the cut distribution puts on the
kept moves the uncut model gives less than 1%. Averaged over positions,
that is the share the Bot would play on average, without the luck of a
draw. The Base Model is measured alone, as the cut would apply to it
alone; in the opening the Bot consults the Opening Book first.

## The rule, stated before the figures were read

**On the training games only.** The cut is chosen on Camille's training
games, which play the part validation games played in the
[fine-tuning experiment](fine-tuning.md). The Test Set is used once, to
check the chosen cut.

**The distance.** For each candidate and each Phase, the gap between the
Bot's expected share of moves the model gives less than 1% and Camille's
share, in absolute value. The three Phases are then weighed by Camille's
share of training moves in each, so the distance is the gap for a move
picked at random from his games, as in [the draw's
temperature](draw-temperature.md).

**The choice.** The candidate with the smallest distance is chosen. "No
cut" is a candidate like the others. Two distances equal to the hundredth
of a percentage point are a tie; on a tie, the candidate that keeps more of
Camille's training moves is chosen, and if that is equal too, the one
listed first above, each family from its loosest value. The rule is code,
`src/evaluation/improbability.ts`, and its tests pin each case.

**One cut, a recommendation per Phase.** For each Phase, the candidate
closest to Camille in that Phase alone is reported too, by the same rule.
Whether a cut per Phase would do better than one cut by more than chance
is read from a bootstrap over Camille's training games: 1,000 resamples of
whole games, drawn with replacement from a seeded random source, each
measuring, in that Phase, the chosen cut's gap minus the Phase's best
candidate's. If the middle 95% of those differences lies above zero in at
least one Phase, the write-up recommends a cut per Phase as a follow-up.
This ticket keeps one cut either way.

**The check on the Test Set.** The chosen cut is measured once on the
Test Set. Per Phase, the Bot's expected share minus Camille's is reported
beside the training figure, with its standard error clustered by game. The
match is read as holding if, in every Phase, that gap is within two
standard errors of zero. The check is reported; it does not reopen the
choice.

**What is reported beside it,** for every candidate and per Phase:

- the Bot's expected share of moves the model gives less than 1%, 2% and
  5%, beside Camille's;
- the share of Camille's moves the cut would make impossible, and the
  share of his mistakes it would make impossible: moves losing 300
  centipawns or more, from the Blunder Profile's cache;
- the trade-off: the share of Camille's moves the cut keeps against the
  share of the Bot's expected moves under 1% it removes, compared with no
  cut;
- as context that decides nothing, the Bot's 400 games at temperature 1
  (`data/dataset/bot-games-original.jsonl`), scored with Stockfish 19 at
  depth 18 from the same cache: the share of its mistakes, moves losing
  300 centipawns or more outside the Opening Book, each cut would have
  made impossible;
- the same figures for the fine-tuned Base Model at 1100, with its 200
  games at temperature 1 as context. They decide nothing.

The result is written up whichever cut is chosen, no cut included. The
choice is made at temperature 1; the temperature with the cut in place is
chosen again in a later experiment, since a higher temperature makes the
kept but unlikely moves more frequent, never the cut ones.
