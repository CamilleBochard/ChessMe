// Lays out the end-of-game report in the page's language, in three groups.
// The Bot measured before the game: how often it plays Camille's move on
// games the model never saw, the same in every report. The game: how many
// moves each side played and each side's average loss. The Bot in this game:
// whether the game looks like one of Camille's to the style discriminator,
// set against his real games and other players', where it met his own
// positions, its losses per Phase beside the range of his games and its
// costly moves, and the moves he rarely plays.
// src/explanation/game-report.ts and src/explanation/style-discriminator.ts
// work out every figure; this only writes them out.

import botRunsFile from '../../docs/experiments/results/opening-cut-test-set-fine-tuned.json';
import {
  camilleFigures,
  moveMatching,
  SERVED_BOT,
  type CamilleFigures,
  type BotRunResults,
  type GameReport,
} from '../explanation/game-report';
import lossFile from '../explanation/loss-yardstick.json';
import { STYLE_CHART_EDGES, styleChart } from '../explanation/style-chart';
import discriminatorFile from '../explanation/style-discriminator.json';
import {
  medianScore,
  scoreShares,
  standingAmong,
  type ShippedStyleDiscriminator,
  type StyleScore,
} from '../explanation/style-discriminator';
import type { ShippedLossYardstick } from '../explanation/yardsticks';
import { PHASES } from '../evaluation/move-matching';
import type { Texts } from '../i18n/texts';

const lossYardstick = lossFile as ShippedLossYardstick;
const camille: CamilleFigures = camilleFigures(lossYardstick);
const discriminator = discriminatorFile as ShippedStyleDiscriminator;
const camilleShares = scoreShares(discriminator.camille.scores, STYLE_CHART_EDGES);
const otherShares = scoreShares(discriminator.otherPlayers.scores, STYLE_CHART_EDGES);
const camilleTypical = medianScore(discriminator.camille.scores);
const othersTypical = medianScore(discriminator.otherPlayers.scores);
// Read from the experiment that measured the Bot as it is served; a test in
// shipped-yardsticks.test.ts fails if the served Bot changes without it.
const matching = moveMatching(botRunsFile as BotRunResults, SERVED_BOT);

// Whether the visitor opened the note on centipawns. The report is written
// again each time Stockfish measures a move, so the note stays as they left it.
let centipawnHelpShown = false;

/** Where the reading of Camille's positions stands. */
export type PositionsState = 'reading' | 'read' | 'unavailable';

/** Writes the report into body, replacing what it held. */
export function showGameReport(
  body: HTMLElement,
  report: GameReport,
  style: StyleScore,
  positions: PositionsState,
  texts: Texts,
): void {
  const words = texts.report;
  const sections: HTMLElement[] = [];

  const measuredBefore = group(words.measuredBefore);
  measuredBefore.append(guessedBlock(texts));
  sections.push(measuredBefore);

  const theGame = group(words.theGame);
  const counts = paragraph(words.moveCounts(report.moves, report.visitorMoves));
  counts.className = 'move-counts';
  theGame.append(counts, averageLossBlock(report, texts));
  sections.push(theGame);

  const botThisGame = group(words.botThisGame);
  botThisGame.append(styleBlock(style, texts));

  const followed = section(words.followed);
  followed.classList.add('card');
  followed.append(paragraph(words.fromBook(report.fromOpeningBook)));
  followed.append(paragraph(reachedText(report, positions, texts)));
  botThisGame.append(followed);

  const losses = section(words.losses);
  losses.append(lossTable(report, texts));
  if (report.overThreePawns.of > 0) {
    const share = texts.percent(report.overThreePawns.count / report.overThreePawns.of, 0);
    const camilleShare = texts.percent(camille.overThreePawnsShare, 0);
    losses.append(paragraph(words.costly(report.overThreePawns.count, report.overThreePawns.of, share, camilleShare)));
  }
  botThisGame.append(losses);

  // A game the visitor ended before the Bot moved has no move to count.
  if (report.moves > 0) {
    botThisGame.append(improbableSection(report, texts));
  }
  sections.push(botThisGame);

  if (report.pending > 0) {
    const pending = paragraph(words.pending(report.pending));
    pending.classList.add('pending');
    sections.push(pending);
  }

  const source = paragraph(words.source(lossYardstick.games));
  source.classList.add('source');
  sections.push(source);

  body.replaceChildren(...sections);
}

/** Each side's average loss per move in large, the Bot's in the accent, and what a centipawn is on demand. */
function averageLossBlock(report: GameReport, texts: Texts): HTMLElement {
  const words = texts.report;
  const block = section(words.averageLoss);
  block.classList.add('average-loss');

  const help = document.createElement('p');
  help.className = 'centipawn-help';
  help.id = 'centipawn-help';
  help.textContent = words.centipawnHelp;
  help.hidden = !centipawnHelpShown;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'help-button';
  button.textContent = '?';
  button.setAttribute('aria-label', words.centipawnHelpLabel);
  button.setAttribute('aria-controls', help.id);
  button.setAttribute('aria-expanded', String(centipawnHelpShown));
  button.addEventListener('click', () => {
    centipawnHelpShown = !centipawnHelpShown;
    help.hidden = !centipawnHelpShown;
    button.setAttribute('aria-expanded', String(centipawnHelpShown));
  });
  block.querySelector('h4')!.append(button);

  const sides = document.createElement('div');
  sides.className = 'sides';
  sides.append(sideFigure(words.bot, report.averageLoss.bot, 'bot', texts));
  sides.append(sideFigure(words.visitor, report.averageLoss.visitor, 'visitor', texts));
  block.append(sides, help);
  return block;
}

function sideFigure(name: string, averageLoss: number | null, side: 'bot' | 'visitor', texts: Texts): HTMLElement {
  const figure = document.createElement('div');
  figure.className = `side ${side}`;
  const label = paragraph(name);
  label.className = 'side-name';
  let valueText = texts.report.notMeasured;
  if (averageLoss !== null) {
    valueText = texts.report.centipawns(averageLoss);
  }
  const value = paragraph(valueText);
  value.className = 'side-loss';
  figure.append(label, value);
  return figure;
}

/** How many of the Bot's moves Camille plays less than once in 100, then each of them. */
function improbableSection(report: GameReport, texts: Texts): HTMLElement {
  const words = texts.report;
  const improbable = document.createElement('section');
  const summary = paragraph(words.improbable(report.improbable.length, report.moves));
  summary.className = 'improbable-summary';
  improbable.append(summary);
  if (report.improbable.length === 0) {
    return improbable;
  }
  const list = document.createElement('ul');
  list.className = 'improbable-moves';
  for (const move of report.improbable) {
    const item = document.createElement('li');
    let pawnsLost: string | null = null;
    if (move.loss !== null) {
      pawnsLost = texts.decimal(move.loss / 100, 1);
    }
    const named = `${moveNumber(move.ply)}${texts.writeMove(move.san)}`;
    item.textContent = words.improbableMove(named, texts.percent(move.probability, 1), pawnsLost);
    list.append(item);
  }
  improbable.append(list);
  return improbable;
}

/** How often the Bot plays his move on games it never saw, in large. */
function guessedBlock(texts: Texts): HTMLElement {
  const share = texts.percent(matching.guessed, 0);
  const block = figureBlock(share);
  block.append(paragraph(texts.report.guessed(matching.games)));
  return block;
}

/**
 * The style discriminator's score of the game in large, on the spread of
 * Camille's real games and of other players', with where it stands among
 * them and what a single game allows the discriminator to say.
 */
function styleBlock(style: StyleScore, texts: Texts): HTMLElement {
  const words = texts.report;
  const block = section(words.styleTitle);
  block.classList.add('style');

  let gameScore: number | null = null;
  if (style.kind === 'scored') {
    gameScore = style.score;
    const figure = paragraph(texts.decimal(style.score, 2));
    figure.className = 'share';
    block.append(figure);
  } else {
    block.append(paragraph(words.styleTooShort(style.movesRead, style.needed)));
  }

  const legend = document.createElement('ul');
  legend.className = 'style-legend';
  legend.append(legendItem('camille', words.styleLegendCamille(discriminator.camille.games)));
  legend.append(legendItem('others', words.styleLegendOthers(discriminator.otherPlayers.games)));
  if (gameScore !== null) {
    legend.append(legendItem('game', words.styleLegendGame));
  }
  block.append(legend, styleChart(camilleShares, otherShares, gameScore, texts));

  // The typical scores come first: the game's own score means little until
  // it is set beside them.
  block.append(paragraph(words.styleTypical(texts.decimal(camilleTypical, 2), texts.decimal(othersTypical, 2))));
  if (gameScore !== null) {
    const standing = standingAmong(discriminator.camille.scores, gameScore);
    const share = texts.percent(standing.share, 0);
    block.append(paragraph(words.styleStanding(texts.decimal(gameScore, 2), standing.direction, share)));
  }
  const recognised = texts.percent(discriminator.camille.shareScoredAsCamille, 0);
  const taken = texts.percent(discriminator.otherPlayers.shareScoredAsCamille, 0);
  block.append(paragraph(words.styleLimit(recognised, taken)));

  const source = paragraph(words.styleSource(discriminator.trainedOn.camille, discriminator.trainedOn.otherPlayers));
  source.classList.add('source');
  block.append(source);
  return block;
}

function legendItem(who: 'camille' | 'others' | 'game', text: string): HTMLLIElement {
  const item = document.createElement('li');
  const swatch = document.createElement('span');
  swatch.className = `swatch ${who}`;
  swatch.setAttribute('aria-hidden', 'true');
  item.append(swatch, text);
  return item;
}

/** A block holding a share in large, the words saying what it counts appended after. */
function figureBlock(figureText: string): HTMLElement {
  const block = document.createElement('div');
  block.className = 'headline';
  const figures = document.createElement('div');
  figures.className = 'figures';
  const figure = paragraph(figureText);
  figure.className = 'share';
  figures.append(figure);
  block.append(figures);
  return block;
}

function reachedText(report: GameReport, positions: PositionsState, texts: Texts): string {
  if (positions === 'reading') {
    return texts.report.readingPositions;
  }
  if (positions === 'unavailable' || report.reachedByCamille === null) {
    return texts.report.positionsUnavailable;
  }
  if (report.reachedByCamille.of === 0) {
    return texts.report.noEarlyModelMove;
  }
  if (report.reachedByCamille.count === 0) {
    return texts.report.noneReached;
  }
  return texts.report.reached(report.reachedByCamille.count);
}

/** Per Phase, the Bot's average loss this game beside the range 8 in 10 of Camille's games cover. */
function lossTable(report: GameReport, texts: Texts): HTMLTableElement {
  const words = texts.report;
  const table = document.createElement('table');
  table.className = 'losses';
  const head = document.createElement('thead');
  head.append(row('th', [words.phase, words.thisGame, words.camilleRange]));
  const body = document.createElement('tbody');
  for (const phase of PHASES) {
    const losses = report.phases[phase];
    let botCell = words.notMeasured;
    if (losses.averageLoss !== null) {
      botCell = words.centipawns(losses.averageLoss);
    }
    let camilleCell = words.notMeasured;
    const range = camille.lossRanges[phase];
    if (range !== null) {
      camilleCell = words.range(range.low, range.high);
    }
    body.append(row('td', [words.phaseName[phase], botCell, camilleCell]));
  }
  table.append(head, body);
  return table;
}

function row(cellName: 'th' | 'td', texts: string[]): HTMLTableRowElement {
  const tableRow = document.createElement('tr');
  for (const text of texts) {
    const cell = document.createElement(cellName);
    if (cellName === 'th') {
      (cell as HTMLTableCellElement).scope = 'col';
    }
    cell.textContent = text;
    tableRow.append(cell);
  }
  return tableRow;
}

/** One of the report's three groups, under its heading. */
function group(title: string): HTMLElement {
  const element = document.createElement('section');
  element.className = 'group';
  const heading = document.createElement('h3');
  heading.textContent = title;
  element.append(heading);
  return element;
}

/** A part of a group, under a smaller heading. */
function section(title: string): HTMLElement {
  const element = document.createElement('section');
  const heading = document.createElement('h4');
  heading.textContent = title;
  element.append(heading);
  return element;
}

function paragraph(text: string): HTMLParagraphElement {
  const element = document.createElement('p');
  element.textContent = text;
  return element;
}

/** "12." for White's twelfth move, "12…" for Black's. */
function moveNumber(ply: number): string {
  const number = Math.ceil(ply / 2);
  if (ply % 2 === 1) {
    return `${number}.`;
  }
  return `${number}…`;
}
