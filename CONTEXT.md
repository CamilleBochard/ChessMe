# ChessMe

A web page where a visitor plays chess against a bot that imitates Camille: a
pretrained model conditioned to his measured strength, layered with his own
opening repertoire.

## Language

### The player being imitated

**Style**:
Which move is chosen among the reasonable ones: opening repertoire, piece
preferences, tolerance for complication.
_Avoid_: personality, playing style (when it silently means Level)

**Level**:
How often a move is a mistake and how large the mistake is. Distinct from Style:
a model can reach the right Level while showing none of the Style, and vice versa.
_Avoid_: strength, skill, Elo (Elo is a measurement of Level, not Level itself)

**Opening Book**:
The positions Camille has reached often enough in his own games for his reply to
be known, mapped to that reply. Carries Style, not Level.
_Avoid_: repertoire, opening database

**Maia-Equivalent Rating**:
Camille's strength expressed on the scale the Base Model was trained on, found by
measuring which candidate best reproduces his moves. Not his Chess.com rating and
not his Lichess rating, though it lands near the latter.
_Avoid_: my rating, Elo, my level (all three hide which scale is meant)

**Blunder Profile**:
The measured distribution of Camille's own evaluation losses, sliced by game
phase. A yardstick the Bot is compared against, not a mechanism applied to it.
_Avoid_: error model, mistake rate

### The system

**Bot**:
The thing a visitor plays against: the Opening Book consulted first, the Base
Model consulted otherwise.
_Avoid_: engine, AI, model (all three name something narrower)

**Base Model**:
The pretrained neural network that predicts a human move for a position at a
given rating. Not trained by this project.
_Avoid_: the AI, the net, Maia (Maia is a family; the chosen member is an
implementation detail)

**Move-Selection Engine**:
The code that turns a position into the Bot's move by consulting the Opening
Book, then the Base Model. The boundary is a position in, one move out.
_Avoid_: the logic, the brain, the wrapper

### Measurement

**Move-Matching**:
The share of positions in which a candidate reproduces the move Camille actually
played. The project's primary measure of Style.
_Avoid_: accuracy, prediction rate, hit rate

**Baseline**:
The Base Model alone, with no Opening Book and no other addition, measured on the
Test Set. Every claim of improvement is a comparison against it.
_Avoid_: control, reference

**Test Set**:
Camille's games held back from every other use, reserved for measurement.
_Avoid_: validation set, holdout (both mean different things in training)

**Phase**:
Which stretch of a game a position belongs to, by ply: opening (1-10),
middlegame (11-30), endgame (31+). Every measurement is reported per Phase,
because a single aggregate hides the opening's easy predictability.
_Avoid_: stage, part of the game

**Style Fingerprint**:
A vector of distributional statistics describing how a player plays — error
shape, piece preferences, capture and trade rates, material remaining. It is the
only way to compare Camille against the Bot on games that share no positions.
_Avoid_: profile (that is the Blunder Profile), signature, playstyle vector

**Style Discriminator**:
A classifier trained to tell Camille's games from those of other players at his
Level, read from his moves after the opening. Checked on the Test Set, then
asked whether the Bot's games pass for his.
_Avoid_: style detector, Camille classifier

**Session Game**:
A game played by a visitor against the Bot on the site. Evidence about the Bot's
behaviour; never training data about Camille, since he did not play it.
_Avoid_: user game, live game
