// Chooses the cut on the Base Model's least likely moves, by the rule in
// docs/experiments/move-cut.md: the cut that brings the Bot's share of moves
// the model gives less than 1% closest to Camille's, on his training games.
//
//     npm run improbability -- --model original \
//       --training data/dataset/move-probabilities/original-train.jsonl \
//       --test data/dataset/move-probabilities/original-test.jsonl \
//       --bot data/dataset/move-probabilities/original-bot.jsonl \
//       --losses data/dataset/centipawn-losses.jsonl --losses data/dataset/bot-moves-original.jsonl \
//       --record docs/experiments/results/move-cut.json
//
// The records come from npm run move-probabilities; the losses from the
// Blunder Profile (Camille's) and pipeline/export_bot_moves.py (the Bot's).
// Beside the choice it reports every candidate per Phase, the trade-off,
// each Phase's own best cut against chance, the check on the Test Set, and
// the share of the Bot's mistakes each cut would have removed from its
// games. The tables go to standard output as Markdown; --record also writes
// the figures as JSON.

import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { gameFromFen } from '../src/game/game';
import type { MoveCut } from '../src/engine/move-cut';
import { readOpeningBook } from '../src/engine/opening-book';
import {
  CANDIDATE_CUTS,
  candidateDistance,
  chooseCut,
  cutGap,
  cutName,
  IMPROBABILITY_THRESHOLDS,
  improbabilityProfile,
  measureCut,
  MISTAKE_CENTIPAWNS,
  phaseCutAdvantage,
  type CutMeasurement,
  type PhaseAdvantage,
  type PhaseGap,
  type PlacedMove,
} from '../src/evaluation/improbability';
import { PHASE_LABELS, PHASES, type Phase } from '../src/evaluation/move-matching';
import { seededRandom } from '../src/evaluation/seeded-random';

const OPENING_BOOK = 'data/dataset/opening-book.json';
const RESAMPLES = 1000;
const SEED = 13;

const { values: flags } = parseArgs({
  options: {
    model: { type: 'string' },
    training: { type: 'string' },
    test: { type: 'string' },
    bot: { type: 'string' },
    losses: { type: 'string', multiple: true },
    record: { type: 'string' },
  },
});
if (
  flags.model === undefined ||
  flags.training === undefined ||
  flags.test === undefined ||
  flags.bot === undefined ||
  flags.losses === undefined
) {
  console.error(
    'Usage: npm run improbability -- --model <label> --training <records> --test <records> --bot <records> --losses <file> [--losses <file>] [--record <file>]',
  );
  process.exit(1);
}

const losses = new Map<string, number>();
for (const lossesPath of flags.losses) {
  const lossesInFile = readLosses(await readFile(lossesPath, 'utf-8'));
  for (const [move, loss] of lossesInFile) {
    losses.set(move, loss);
  }
}
const training = readPlacedMoves(await readFile(flags.training, 'utf-8'), losses);
const testSet = readPlacedMoves(await readFile(flags.test, 'utf-8'), losses);
const botMoves = readPlacedMoves(await readFile(flags.bot, 'utf-8'), losses);

// The cut would apply to the Base Model's draws only: the Bot's moves from
// the Opening Book stay whatever the cut.
const openingBook = readOpeningBook(await readFile(OPENING_BOOK, 'utf-8'));
const botModelMoves = botMoves.filter((move) => openingBook.move(gameFromFen(move.fen)) === undefined);

// The choice, on the training games only.
const choice = chooseCut(training, [...CANDIDATE_CUTS]);
const uncut = measureCut(training, { kind: 'none' });

const candidates = choice.candidates.map((candidate) => {
  const onTraining = measureCut(training, candidate.cut);
  const onBotGames = measureCut(botModelMoves, candidate.cut);
  const improbableRemoved = 1 - onTraining.all.botBelow[0] / uncut.all.botBelow[0];
  return {
    cut: candidate.cut,
    name: cutName(candidate.cut),
    distance: candidate.distance,
    phaseGaps: candidate.phaseGaps,
    movesKept: candidate.movesKept,
    improbableRemoved: improbableRemoved,
    training: onTraining,
    botGames: onBotGames,
  };
});

// Each Phase's own best cut, and whether it beats the chosen one by more than chance.
interface PhaseBest extends PhaseAdvantage {
  cut: MoveCut;
  name: string;
}
const random = seededRandom(SEED);
const phaseBest = {} as Record<Phase, PhaseBest>;
for (const phase of PHASES) {
  const inPhase = training.filter((move) => move.phase === phase);
  const best = chooseCut(inPhase, [...CANDIDATE_CUTS]).chosen;
  const advantage = phaseCutAdvantage(training, phase, {
    chosen: choice.chosen,
    phaseBest: best,
    resamples: RESAMPLES,
    random: random,
  });
  phaseBest[phase] = { cut: best, name: cutName(best), ...advantage };
}
const beyondChance = PHASES.filter((phase) => phaseBest[phase].low > 0);

// The check on the Test Set, once, beside the training figure.
const testSetCheck = {
  training: cutGap(training, choice.chosen),
  testSet: cutGap(testSet, choice.chosen),
  trainingDistance: candidateDistance(training, choice.chosen).distance,
  testSetDistance: candidateDistance(testSet, choice.chosen).distance,
};
const holds = PHASES.every((phase) => Math.abs(testSetCheck.testSet[phase].gap) <= 2 * testSetCheck.testSet[phase].standardError);

const camille = { training: improbabilityProfile(training), testSet: improbabilityProfile(testSet) };
const botGamesProfile = improbabilityProfile(botModelMoves);

printReport();

if (flags.record !== undefined) {
  const today = new Date().toISOString().slice(0, 10);
  const record = {
    measuredOn: today,
    model: flags.model,
    thresholds: IMPROBABILITY_THRESHOLDS,
    mistakeCentipawns: MISTAKE_CENTIPAWNS,
    camille: camille,
    chosen: { cut: choice.chosen, name: cutName(choice.chosen) },
    candidates: candidates,
    phaseBest: phaseBest,
    perPhaseCutBeyondChance: beyondChance,
    testSetCheck: { ...testSetCheck, holds: holds },
    botGames: { moves: botMoves.length, outsideOpeningBook: botModelMoves.length, profile: botGamesProfile },
  };
  await writeFile(flags.record, JSON.stringify(record, null, 1) + '\n');
  console.error(`Recorded in ${flags.record}`);
}

function printReport(): void {
  console.log(`Base Model: ${flags.model}. Training games: ${training.length} moves; Test Set: ${testSet.length} moves.`);
  console.log('');
  console.log("Camille's improbability profile: the share of his moves the model gave less than 1%, 2% and 5%.");
  console.log('');
  console.log('| Phase | Training moves | Under 1% | Under 2% | Under 5% | Test Set moves | Under 1% | Under 2% | Under 5% |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const phase of PHASES) {
    const onTraining = camille.training[phase];
    const onTestSet = camille.testSet[phase];
    const cells = [PHASE_LABELS[phase], count(onTraining.moves), ...onTraining.below.map(percent)];
    cells.push(count(onTestSet.moves), ...onTestSet.below.map(percent));
    console.log(row(cells));
  }
  console.log('');

  console.log("Per Phase, on the training games: the Bot's expected share of moves under each threshold, drawing under");
  console.log(`the cut, and the share of Camille's moves and of his mistakes (${MISTAKE_CENTIPAWNS} centipawns or more) it makes impossible.`);
  console.log('');
  for (const phase of PHASES) {
    console.log(PHASE_LABELS[phase]);
    console.log('');
    console.log('| Cut | Under 1% | Under 2% | Under 5% | His moves made impossible | His mistakes made impossible |');
    console.log('|---|---|---|---|---|---|');
    const camilleBelow = camille.training[phase].below.map(percent);
    console.log(row(['Camille', ...camilleBelow, '', `(${count(uncut.byPhase[phase].mistakes)} mistakes)`]));
    for (const candidate of candidates) {
      const measured = candidate.training.byPhase[phase];
      const cells = [candidate.name, ...measured.botBelow.map(percent)];
      cells.push(percent(measured.movesMadeImpossible), percent(measured.mistakesMadeImpossible));
      console.log(row(cells));
    }
    console.log('');
  }

  console.log('The rule: the distance under 1%, each Phase weighed by his share of training moves; the gaps are signed,');
  console.log("the Bot's share minus his. The trade-off: his moves the cut keeps against the Bot's moves under 1% it removes.");
  console.log('');
  console.log('| Cut | Distance | Opening gap | Middlegame gap | Endgame gap | His moves kept | Bot moves under 1% removed |');
  console.log('|---|---|---|---|---|---|---|');
  for (const candidate of candidates) {
    const gaps = PHASES.map((phase) => signedPoints(candidate.phaseGaps[phase]));
    const cells = [candidate.name, points(candidate.distance), ...gaps];
    cells.push(percent(candidate.movesKept), percent(candidate.improbableRemoved));
    console.log(row(cells));
  }
  console.log('');
  console.log(`**The rule chooses ${cutName(choice.chosen)}.**`);
  console.log('');

  console.log(`Each Phase's own best cut: the chosen cut's gap minus the best's, with the middle 95% of ${RESAMPLES} resamples of games.`);
  console.log('');
  console.log('| Phase | Best cut | Difference | 95% interval | Beyond chance |');
  console.log('|---|---|---|---|---|');
  for (const phase of PHASES) {
    const best = phaseBest[phase];
    let verdict = 'no';
    if (best.low > 0) {
      verdict = 'yes';
    }
    console.log(row([PHASE_LABELS[phase], best.name, points(best.difference), `${points(best.low)} to ${points(best.high)}`, verdict]));
  }
  console.log('');
  if (beyondChance.length > 0) {
    console.log(`A cut per Phase beats the single cut by more than chance in: ${beyondChance.join(', ')}.`);
  } else {
    console.log('No Phase has a cut of its own that beats the single cut by more than chance.');
  }
  console.log('');

  console.log(`The check on the Test Set, ${cutName(choice.chosen)}: the Bot's share under 1% minus Camille's, ± one standard error.`);
  console.log('');
  console.log('| Phase | Training games | Test Set |');
  console.log('|---|---|---|');
  for (const phase of PHASES) {
    const cells = [PHASE_LABELS[phase], withError(testSetCheck.training[phase]), withError(testSetCheck.testSet[phase])];
    console.log(row(cells));
  }
  console.log(row(['Distance', points(testSetCheck.trainingDistance), points(testSetCheck.testSetDistance)]));
  console.log('');
  if (holds) {
    console.log('On the Test Set the gap is within two standard errors of zero in every Phase: the match holds.');
  } else {
    console.log('On the Test Set the gap exceeds two standard errors in at least one Phase: the match does not hold.');
  }
  console.log('');

  console.log(`Context: the Bot's games, ${count(botModelMoves.length)} of its ${count(botMoves.length)} moves drawn from the Base Model.`);
  const botShares = PHASES.map((phase) => {
    const shareUnderOnePercent = botGamesProfile[phase].below[0];
    return `${phase} ${percent(shareUnderOnePercent)}`;
  });
  console.log(`Its own share under 1%: ${botShares.join(', ')}.`);
  console.log('Per cut: the share of its mistakes the cut would have made impossible, then of all its moves.');
  console.log('');
  const mistakeCounts = PHASES.map((phase) => count(candidates[0].botGames.byPhase[phase].mistakes));
  console.log(`| Cut | Opening (${mistakeCounts[0]}) | Middlegame (${mistakeCounts[1]}) | Endgame (${mistakeCounts[2]}) | All mistakes | All moves |`);
  console.log('|---|---|---|---|---|---|');
  for (const candidate of candidates) {
    const botGames: CutMeasurement = candidate.botGames;
    const cells = [candidate.name, ...PHASES.map((phase) => percent(botGames.byPhase[phase].mistakesMadeImpossible))];
    cells.push(percent(botGames.all.mistakesMadeImpossible), percent(botGames.all.movesMadeImpossible));
    console.log(row(cells));
  }
}

/** Reads the records of npm run move-probabilities, with the loss of each move where one was measured. */
function readPlacedMoves(jsonLines: string, lossesByMove: Map<string, number>): (PlacedMove & { fen: string })[] {
  const moves: (PlacedMove & { fen: string })[] = [];
  for (const line of jsonLines.split('\n')) {
    if (line.trim() === '') {
      continue;
    }
    const record = JSON.parse(line);
    moves.push({
      game: record.game_id,
      ply: record.ply,
      phase: record.phase,
      fen: record.fen,
      move: record.move,
      rank: record.rank,
      probability: record.probability,
      policy: record.policy,
      centipawnLoss: lossesByMove.get(moveKey(record.game_id, record.ply)),
    });
  }
  return moves;
}

/** The losses of a file with one move per line, each with its game, ply and centipawn loss. */
function readLosses(jsonLines: string): Map<string, number> {
  const lossesByMove = new Map<string, number>();
  for (const line of jsonLines.split('\n')) {
    if (line.trim() === '') {
      continue;
    }
    const record = JSON.parse(line);
    lossesByMove.set(moveKey(record.game_id, record.ply), record.centipawn_loss);
  }
  return lossesByMove;
}

function moveKey(game: string, ply: number): string {
  return `${game}#${ply}`;
}

function row(cells: string[]): string {
  return `| ${cells.join(' | ')} |`;
}

function count(value: number): string {
  return value.toLocaleString('en-GB');
}

function percent(share: number): string {
  return `${(100 * share).toFixed(2)}%`;
}

/** A share's gap in percentage points. */
function points(share: number): string {
  return (100 * share).toFixed(2);
}

function signedPoints(share: number): string {
  const formatted = points(share);
  if (share > 0) {
    return `+${formatted}`;
  }
  return formatted;
}

function withError(gap: PhaseGap): string {
  return `${signedPoints(gap.gap)} ± ${points(gap.standardError)}`;
}
