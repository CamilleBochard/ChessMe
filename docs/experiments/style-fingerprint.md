# The Style Fingerprint

Move-Matching asks whether the Bot plays Camille's move in a position Camille
faced. Once the Bot plays its own games it reaches positions he never saw, and
that question has no answer. The Style Fingerprint asks a different one: over
many games, does the Bot play like him in aggregate? It is a set of
distributions computed the same way on any player's games, so Camille and the
Bot can be compared on games that share no position at all.

## Reproducing

```sh
npm run bot-games
python -m pipeline.extract_style_fingerprint
```

The first command plays 400 games of the Bot under Node and writes them to
`data/dataset/bot-games.jsonl`. The second scores every move of Camille's and
of the Bot's with Stockfish 19 at depth 18, the Blunder Profile's settings and
cache, and writes `docs/experiments/results/style-fingerprint.json`, which the
write-up page reads, with a Markdown table of the results. Camille's moves are already in the cache once the Blunder
Profile has been extracted, so only the Bot's moves cost Stockfish time:
about three hours on a four-core 2012 laptop.

## What the fingerprint measures

Every statistic is read from the positions a player faced and the move he
played in each, the shape the dataset stores Camille's games in. The Bot's
games are turned into the same shape by the same code, so nothing is measured
one way for him and another way for the Bot.

**Centipawn-loss shape by Phase.** The Blunder Profile's distribution (mean,
percentiles, share of moves losing three pawns or more), computed by the
Blunder Profile's own code.

**Move share by piece type, per Phase.** Which piece made each move; castling
is a king move. Shown per Phase because over a whole game the share mostly
measures how long games last: kings and rooks move far more in the endgame.

**Capture taken when one is on offer, per Phase.** Among the positions where at
least one capture is legal, the share in which the player captured. Positions
with no capture on offer say nothing about a taste for taking and are left
out.

**Queens off before move 20.** The share of games in which both queens are gone
from the board after 38 plies. Every game counts, including one that ended
earlier with its queens on.

**Material at move 30.** The material left on the board, both sides together,
when move 30 begins (pawn 1, knight and bishop 3, rook 5, queen 9; a full board
holds 78). Only games that reach move 30 have a board to measure, so how many
do is reported beside it.

**Castling choice.** The share of games in which the player castled kingside,
castled queenside, or never castled.

## How the Bot's games are played

The Bot is the Move-Selection Engine exactly as the site serves it: the
Opening Book, then Maia-3 5M at 1100 playing its top move. Played against a
fixed opponent it would repeat one game forever, since it always plays the
same move in the same position, so the variety comes from its opponent: the
same network, drawing each move at random from its probabilities, as a crowd
of players at its rating would choose. The draws are seeded, so the 400 games
can be replayed exactly. The Bot plays White in half of them.

**The opponent is set so that the Bot's games are about as balanced as
Camille's.** Camille scores 48% in his games (484 wins, 36 draws, 526
losses). Against a drawing opponent at its own rating of 1100 the Bot won 17
of 20 games, because the top move is stronger than a draw at the same rating.
A Bot that is almost always winning trades, captures and keeps material as a
winning player does, and the comparison would measure the situation rather
than the style. Trial runs:

| Opponent, drawing at | Games | Bot won, drawn, lost | Bot's score |
|---|---|---|---|
| 1100 | 20 | 17, 2, 1 | 90% |
| 1500 | 20 | 12, 5, 3 | 72% |
| 1900 | 20 | 9, 4, 7 | 55% |
| 2300 | 20 | 7, 2, 11 | 40% |
| 1900 | 60 | 32, 10, 18 | 62% |
| 2100 | 60 | 19, 9, 32 | 39% |

The opponent plays at 2000. The full run of 400 games gave the Bot 175 wins,
82 draws and 143 losses, a score of 54%. This balances the score, not the
opposition: the Bot meets an opponent that is stronger on its good moves and
more erratic on its bad ones than the players Camille meets, and the number
2000 is only the setting that gives balanced games, not a 2000-rated player.

**Camille against himself.** His training games (816) and his Test Set (230)
are also measured apart. The gap between the two is how far fingerprints of
the same player drift by chance, and it is the yardstick for whether a gap
between Camille and the Bot means anything.

## Results

Measured on 2026-10-05 with Stockfish 19 at depth 18. Camille: every game of
the dataset. The Bot: 400 games, seed 13. The two right-hand columns are
Camille's training games and Test Set measured apart; the gap between them is
the gap chance alone produces.

| Statistic | Camille | Bot | Camille, training games | Camille, Test Set |
|---|---|---|---|---|
| Games | 1,046 | 400 | 816 | 230 |
| Moves | 30,860 | 16,316 | 23,768 | 7,092 |
| Mean centipawn loss, Opening (1-10) | 25.7 | 13.6 | 26.0 | 24.5 |
| Median loss, Opening (1-10) | 1 | 0 | 2 | 0 |
| 90th percentile loss, Opening (1-10) | 62 | 41 | 63 | 58 |
| Moves losing 300 or more, Opening (1-10) | 1.1% | 0.1% | 1.1% | 1.1% |
| Mean centipawn loss, Middlegame (11-30) | 103.1 | 54.9 | 102.6 | 105.0 |
| Median loss, Middlegame (11-30) | 24 | 7 | 25 | 21 |
| 90th percentile loss, Middlegame (11-30) | 313 | 155 | 311 | 323 |
| Moves losing 300 or more, Middlegame (11-30) | 10.6% | 4.5% | 10.5% | 11.0% |
| Mean centipawn loss, Endgame (31+) | 104.5 | 56.2 | 104.1 | 105.7 |
| Median loss, Endgame (31+) | 0 | 0 | 0 | 0 |
| 90th percentile loss, Endgame (31+) | 320 | 155 | 319 | 326 |
| Moves losing 300 or more, Endgame (31+) | 10.7% | 5.0% | 10.7% | 10.7% |
| Moves made by a pawn, Opening (1-10) | 52.8% | 52.6% | 52.7% | 53.3% |
| Moves made by a knight, Opening (1-10) | 25.6% | 32.7% | 25.6% | 25.7% |
| Moves made by a bishop, Opening (1-10) | 15.3% | 11.2% | 15.3% | 15.3% |
| Moves made by a rook, Opening (1-10) | 0.1% | 0.0% | 0.0% | 0.1% |
| Moves made by a queen, Opening (1-10) | 5.8% | 1.6% | 5.9% | 5.3% |
| Moves made by a king, Opening (1-10) | 0.5% | 1.9% | 0.5% | 0.3% |
| Moves made by a pawn, Middlegame (11-30) | 26.8% | 26.4% | 26.9% | 26.6% |
| Moves made by a knight, Middlegame (11-30) | 22.4% | 21.0% | 22.7% | 21.4% |
| Moves made by a bishop, Middlegame (11-30) | 24.8% | 28.5% | 24.6% | 25.1% |
| Moves made by a rook, Middlegame (11-30) | 4.8% | 6.3% | 4.6% | 5.3% |
| Moves made by a queen, Middlegame (11-30) | 13.3% | 8.6% | 13.4% | 13.1% |
| Moves made by a king, Middlegame (11-30) | 7.9% | 9.1% | 7.7% | 8.6% |
| Moves made by a pawn, Endgame (31+) | 21.6% | 20.4% | 21.9% | 20.5% |
| Moves made by a knight, Endgame (31+) | 11.3% | 9.1% | 10.7% | 13.1% |
| Moves made by a bishop, Endgame (31+) | 12.8% | 8.0% | 12.9% | 12.3% |
| Moves made by a rook, Endgame (31+) | 22.3% | 22.9% | 22.6% | 21.1% |
| Moves made by a queen, Endgame (31+) | 15.6% | 16.8% | 15.6% | 15.9% |
| Moves made by a king, Endgame (31+) | 16.4% | 22.7% | 16.2% | 17.2% |
| Capture taken when one is on offer, Opening (1-10) | 29.8% | 41.9% | 29.8% | 30.1% |
| Capture taken when one is on offer, Middlegame (11-30) | 30.0% | 34.8% | 30.2% | 29.3% |
| Capture taken when one is on offer, Endgame (31+) | 36.9% | 39.9% | 36.9% | 36.8% |
| Queens off before move 20 | 19.2% | 19.2% | 18.4% | 22.2% |
| Games reaching move 30 | 42.4% | 71.5% | 40.4% | 49.6% |
| Material at move 30, mean (of 78) | 37.5 | 32.0 | 37.2 | 38.3 |
| Castled kingside | 53.5% | 84.0% | 52.2% | 58.3% |
| Castled queenside | 15.2% | 6.5% | 15.1% | 15.7% |
| Never castled | 31.3% | 9.5% | 32.7% | 26.1% |

Camille against himself moves by about one point on the per-move statistics
and by four to eight points on the per-game ones, which rest on only 230 Test
Set games. Those are the margins a gap has to clear.

Where a figure below is restricted to games of a minimum length, it was
computed by the same fingerprint function on the games of both players that
last at least that many plies.

## Where the imitation holds

**What Camille moves, outside the opening, mostly.** Pawn moves match in every
Phase to within about a point (52.6% against 52.8% in the opening, 26.4% against
26.8% in the middlegame, 20.4% against 21.6% in the endgame), and so do
middlegame knight moves and endgame rook moves. The Bot pushes pawns as often
as he does and at the same moments of the game.

**Early queen trades.** Both lose their queens before move 20 in 19.2% of
games. Restricted to games long enough for the question to matter, the two
stay close (21% against 20% in games of 30 plies or more, 27% against 22% in
games of 60 or more), within the spread of Camille's own two halves.

**Taking in the endgame.** Once past ply 30, the Bot takes an offered capture
39.9% of the time against his 36.9%: a three-point gap, real at this sample
size but small.

## Where it breaks

**Level, by a factor of two.** This is the largest difference in the table and
it is not close. In the middlegame and endgame the Bot's mean loss is 55 and 56
centipawns against Camille's 103 and 105, its 90th percentile 155 against 313
and 320, and it loses three pawns or more on 4.5% and 5.0% of its moves
against 10.6% and 10.7%. Camille's two halves agree to within 2.4 centipawns
of mean loss and half a point of blunder rate, so this gap is not noise. It
holds even though the Bot's opponent is stronger than Camille's, which if
anything should push the Bot into harder positions. The Bot plays roughly
twice as accurately as the player it imitates. This is the measured case for
drawing the Base Model's move from its probabilities rather than always
playing its top move: the top move of a crowd of 1100 players is rarely one of
the mistakes any single one of them makes.

**Castling.** The Bot castles kingside in 84% of its games, Camille in 53.5%;
he castles queenside more than twice as often (15.2% against 6.5%) and leaves
his king uncastled in 31% of games against the Bot's 9.5%. His shorter games
are not the explanation: restricted to games of 60 plies or more, he castles
kingside in 58.5%, queenside in 19.2% and never in 22.3%, against the Bot's
85.0%, 6.1% and 8.9%. Queenside castling and the uncastled king are part of
his style, and the Bot, outside the moves the Opening Book holds, castles the
way the crowd of players does.

**The queen comes out later, the knights earlier.** In the opening Camille
moves his queen on 5.8% of his moves and the Bot on 1.6%; in the middlegame
13.3% against 8.6%. The Bot moves knights instead (32.7% of opening moves
against 25.6%) and bishops less. An early queen sortie is a club player's
habit, and it is one the crowd's top move filters out.

**Taking in the opening.** The Bot takes an offered capture on 41.9% of its
opening moves against Camille's 29.8%, twelve points apart where his own halves
differ by 0.3. Camille more often leaves the tension or answers a capture with
another move.

## What this comparison cannot say

**How the games end.** Camille's games end by resignation, on time or by
abandonment more often than by mate; the Bot's games have no clock and nobody
resigns, so they run until mate or a draw rule. They are longer (71.5% reach
move 30 against 42.4%) and drawn far more often (20.5% against 3.4%, mostly by
threefold repetition, which a Bot that always plays the same move in the same
position walks into). That most likely accounts for the higher share of endgame king
moves (22.7% against 16.4%), the lower material at move 30 (32.0 against
37.5), and part of the endgame figures. The comparison between Camille's two
halves cannot reveal this, since both halves end the same way. The per-move
statistics of the opening and middlegame are the least exposed to it.

**Opposition.** The Bot's opponent is a model, not the players Camille meets.
Its score is balanced, but its moves are not those of a 1100 human.

**One Bot.** The Bot measured is the one the site serves today, which plays the
Base Model's top move. A Bot that draws its move from the model's
probabilities is expected to close much of the Level gap and should be
measured again with the same commands.
