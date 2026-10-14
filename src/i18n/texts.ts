// Every text the game page shows, in each language it speaks. A sentence
// built from figures is a function, so each language can place the figures,
// agree its nouns and write its numbers its own way.
// Free of anything DOM.

import type { Colour } from '../board/starting-position';
import type { Phase } from '../evaluation/move-matching';
import type { Language } from './language';

/** How a figure of the game so far compares with Camille's games. */
export type Placement = 'inside' | 'below' | 'above';

export interface Texts {
  /** The page's own words, placed by data-text attributes. */
  page: Record<PageText, string>;
  side(colour: Colour): string;
  /** The clocks' names for the two players. */
  bot: string;
  you: string;
  chooseASide: string;
  yourTurn(toMove: Colour): string;
  botThinking(toMove: Colour): string;
  checkmate(winner: Colour): string;
  resignation(winner: Colour): string;
  timeForfeit(winner: Colour): string;
  stalemate: string;
  insufficientMaterial: string;
  fiftyMoveRule: string;
  threefoldRepetition: string;
  drawOnTime: string;
  cannotContinue: string;
  botWaitsForModel: string;
  preparingTheBot: string;
  downloading(megabytes: string): string;
  downloadingOf(received: string, total: string): string;
  botFailed(reason: string): string;
  browserCouldNotStartIt: string;
  impressionRecorded: string;
  impressionNotRecorded: string;
  impressionQuestion(rating: number): string;
  summaryUnavailable: string;
  wins(count: number): string;
  draws(count: number): string;
  losses(count: number): string;
  answered(feltReal: number, answered: number): string;
  panel: PanelTexts;
  /** A share as a percentage with the given number of decimals, as the language writes it. */
  percent(share: number, decimals: number): string;
}

/** The words of the panel beside the board. */
export interface PanelTexts {
  placeholder: string;
  phase: Record<Phase, string>;
  /** A Phase named inside a sentence: "of his middlegame moves". */
  phaseMoves: Record<Phase, string>;
  bookWithCounts(san: string, reached: number, played: number): string;
  bookWithoutCounts: string;
  random: string;
  fromModel(legalMoves: number, temperature: number, among: string): string;
  amongEveryMove: string;
  amongCut(cutName: string): string;
  move: string;
  model: string;
  drawn: string;
  rank(rank: number): string;
  rarity(share: string, phase: Phase): string;
  rarityNone(phase: Phase): string;
  evaluating: string;
  evaluationFailed: string;
  decided: string;
  lost(centipawns: number): string;
  movesUnderOnePercent: string;
  averageLoss: string;
  openingTooShort(figure: string, botMoves: number): string;
  tooFew(figure: string, counted: string, needed: number): string;
  modelMovesSoFar(count: number): string;
  openMovesEvaluated(count: number): string;
  improbableVerdict(improbable: number, moves: number, share: string, placement: Placement, range: string): string;
  lossVerdict(average: number, moves: number, placement: Placement, range: string): string;
  centipawnRange(low: number, high: number): string;
  usualRange(movesForAVerdict: number, games: number): string;
  lossesSource(engine: string, depth: number, games: number): string;
}

/** The page's fixed words, each placed where an element's data-text names it. */
export type PageText =
  | 'intro'
  | 'summaryTitle'
  | 'language'
  | 'playAs'
  | 'white'
  | 'black'
  | 'takeBack'
  | 'resign'
  | 'newGame'
  | 'yes'
  | 'no'
  | 'moves'
  | 'previousPosition'
  | 'nextPosition'
  | 'choosePromotion'
  | 'promoteTo'
  | 'queen'
  | 'rook'
  | 'bishop'
  | 'knight'
  | 'whyTheBotPlayedIt'
  | 'theGameSoFar'
  | 'analysisMode'
  | 'analysisNoteBefore'
  | 'analysisNoteAfter'
  | 'readingTheCounts'
  | 'gamesFinished'
  | 'botRecord'
  | 'botScore'
  | 'fromOpeningBook'
  | 'feltReal'
  | 'noGameYet'
  | 'noMoveYet'
  | 'noAnswerYet';

/** Below 1 in English, a noun takes its plural: 0 wins, 1 win, 2 wins. */
function english(count: number, singular: string, plural: string): string {
  if (count === 1) {
    return `${count} ${singular}`;
  }
  return `${count} ${plural}`;
}

/** French keeps the singular for 0 and 1: 0 victoire, 1 victoire, 2 victoires. */
function french(count: number, singular: string, plural: string): string {
  if (count < 2) {
    return `${count} ${singular}`;
  }
  return `${count} ${plural}`;
}

function englishOrdinal(rank: number): string {
  const lastTwo = rank % 100;
  if (lastTwo >= 11 && lastTwo <= 13) {
    return `${rank}th`;
  }
  const last = rank % 10;
  if (last === 1) {
    return `${rank}st`;
  }
  if (last === 2) {
    return `${rank}nd`;
  }
  if (last === 3) {
    return `${rank}rd`;
  }
  return `${rank}th`;
}

/** 1er, then 2e, 3e and on. */
function frenchOrdinal(rank: number): string {
  if (rank === 1) {
    return '1er';
  }
  return `${rank}e`;
}

/** The space French sets before a colon, a question mark or a percent sign, which never breaks a line. */
const NO_BREAK = ' ';

const ENGLISH: Texts = {
  page: {
    intro: 'Play a game against a bot that imitates Camille.',
    summaryTitle: 'Games on this site',
    language: 'Language',
    playAs: 'Play as',
    white: 'White',
    black: 'Black',
    takeBack: 'Take back',
    resign: 'Resign',
    newGame: 'New game',
    yes: 'Yes',
    no: 'No',
    moves: 'Moves',
    previousPosition: 'Previous position',
    nextPosition: 'Next position',
    choosePromotion: 'Choose a promotion piece',
    promoteTo: 'Promote to',
    queen: 'Queen',
    rook: 'Rook',
    bishop: 'Bishop',
    knight: 'Knight',
    whyTheBotPlayedIt: 'Why the Bot played it',
    theGameSoFar: "The game so far, against Camille's",
    analysisMode: 'Analysis mode',
    analysisNoteBefore: 'Runs ',
    analysisNoteAfter:
      " (GPL-3.0) in your browser, a 1.8 MB download, to show how much evaluation each of the Bot's moves lost. " +
      'A game played with it on is recorded as assisted.',
    readingTheCounts: 'Reading the counts…',
    gamesFinished: 'Games finished',
    botRecord: "The Bot's record",
    botScore: "The Bot's score",
    fromOpeningBook: 'Its moves from the Opening Book',
    feltReal: 'Felt like a real player at that level',
    noGameYet: 'no game yet',
    noMoveYet: 'no move yet',
    noAnswerYet: 'no answer yet',
  },
  side: (colour) => {
    if (colour === 'white') {
      return 'White';
    }
    return 'Black';
  },
  bot: 'Bot',
  you: 'You',
  chooseASide: 'Choose a side to start.',
  yourTurn: (toMove) => `${ENGLISH.side(toMove)} to move: your turn.`,
  botThinking: (toMove) => `${ENGLISH.side(toMove)} to move: the Bot is thinking…`,
  checkmate: (winner) => `Checkmate. ${ENGLISH.side(winner)} wins.`,
  resignation: (winner) => `${ENGLISH.side(opponentOf(winner))} resigns. ${ENGLISH.side(winner)} wins.`,
  timeForfeit: (winner) => `${ENGLISH.side(opponentOf(winner))} ran out of time. ${ENGLISH.side(winner)} wins.`,
  stalemate: 'Draw by stalemate.',
  insufficientMaterial: 'Draw by insufficient material.',
  fiftyMoveRule: 'Draw by the fifty-move rule.',
  threefoldRepetition: 'Draw by threefold repetition.',
  drawOnTime: 'Draw: out of time, but the opponent could not have mated.',
  cannotContinue: 'The game cannot continue without the Bot.',
  botWaitsForModel: 'The Bot will reply once its model has loaded.',
  preparingTheBot: 'Preparing the Bot…',
  downloading: (megabytes) => `Downloading the Bot's model: ${megabytes} MB`,
  downloadingOf: (received, total) => `Downloading the Bot's model: ${received} of ${total} MB`,
  botFailed: (reason) => `The Bot could not be loaded: ${reason}. Reload the page to try again.`,
  browserCouldNotStartIt: 'the browser could not start it',
  impressionRecorded: 'Thank you, your answer has been recorded.',
  impressionNotRecorded: 'Your answer could not be recorded.',
  impressionQuestion: (rating) => `Did the Bot feel like a real player of about ${rating} on Lichess?`,
  summaryUnavailable: 'The counts could not be read just now. Try again in a minute.',
  wins: (count) => english(count, 'win', 'wins'),
  draws: (count) => english(count, 'draw', 'draws'),
  losses: (count) => english(count, 'loss', 'losses'),
  answered: (feltReal, answered) => `${feltReal} of ${answered} who answered`,
  percent: (share, decimals) => `${(100 * share).toFixed(decimals)}%`,
  panel: {
    placeholder: "Each of the Bot's moves is explained here as the game goes.",
    phase: { opening: 'Opening (1-10)', middlegame: 'Middlegame (11-30)', endgame: 'Endgame (31+)' },
    phaseMoves: { opening: 'opening moves', middlegame: 'middlegame moves', endgame: 'endgame moves' },
    bookWithCounts: (san, reached, played) =>
      `From the Opening Book: Camille reached this position ${englishTimes(reached)} in his games ` +
      `and played ${san} ${englishTimes(played)}.`,
    bookWithoutCounts: "From the Opening Book: Camille's own reply in this position.",
    random: 'A legal move picked at random: the Base Model was not available.',
    fromModel: (legalMoves, temperature, among) =>
      `From the Base Model, out of ${legalMoves} legal moves, drawn at temperature ${temperature} ${among}.`,
    amongEveryMove: 'among every legal move',
    amongCut: (cutName) => `among the model's ${cutName} moves, the cut the Bot plays its opening with`,
    move: 'Move',
    model: 'Model',
    drawn: 'Drawn',
    rank: (rank) => {
      if (rank === 1) {
        return "It was the model's most likely move.";
      }
      return `It was the model's ${englishOrdinal(rank)} most likely move.`;
    },
    rarity: (share, phase) => `Camille plays a move this unlikely on ${share} of his ${ENGLISH.panel.phaseMoves[phase]}.`,
    rarityNone: (phase) => `None of Camille's ${ENGLISH.panel.phaseMoves[phase]} measured was this unlikely to the model.`,
    evaluating: 'Stockfish is evaluating the move…',
    evaluationFailed: 'Stockfish could not evaluate the move.',
    decided:
      'The game was already decided: both moves score ten pawns or more for the same side, so the loss is not counted.',
    lost: (centipawns) => `Stockfish: the move lost ${centipawns} centipawns against the best move.`,
    movesUnderOnePercent: 'Moves under 1%',
    averageLoss: 'Average loss',
    openingTooShort: (figure, botMoves) =>
      `${figure}: the opening holds at most ${botMoves} of the Bot's moves, too few to tell from one game.`,
    tooFew: (figure, counted, needed) => `${figure}: ${counted}, too few to tell (${needed} needed).`,
    modelMovesSoFar: (count) => `${english(count, 'Base Model move', 'Base Model moves')} so far`,
    openMovesEvaluated: (count) => `${english(count, 'move', 'moves')} in open positions evaluated so far`,
    improbableVerdict: (improbable, moves, share, placement, range) =>
      `Moves under 1%: ${improbable} of ${moves} (${share}), ${englishPlacement(placement)} (${range}).`,
    lossVerdict: (average, moves, placement, range) =>
      `Average loss: ${average} cp over ${moves} moves, ${englishPlacement(placement)} (${range}).`,
    centipawnRange: (low, high) => `${low} to ${high} cp`,
    usualRange: (movesForAVerdict, games) =>
      `His usual range is the middle 80% of his games, from ${movesForAVerdict} moves in a Phase up. ` +
      `Moves under 1%: the Base Model's own probabilities, on his ${games} games held back for testing.`,
    lossesSource: (engine, depth, games) =>
      `Losses: ${engine} at depth ${depth}, the settings used here, on all ${games} of his games, ` +
      'counting only the moves made in open positions.',
  },
};

function englishTimes(count: number): string {
  if (count === 1) {
    return 'once';
  }
  return `${count} times`;
}

function englishPlacement(placement: Placement): string {
  if (placement === 'below') {
    return 'below his usual range';
  }
  if (placement === 'above') {
    return 'above his usual range';
  }
  return 'inside his usual range';
}

const FRENCH: Texts = {
  page: {
    intro: 'Jouez une partie contre un bot qui imite Camille.',
    summaryTitle: 'Les parties jouées sur ce site',
    language: 'Langue',
    playAs: 'Jouer avec',
    white: 'les Blancs',
    black: 'les Noirs',
    takeBack: 'Reprendre',
    resign: 'Abandonner',
    newGame: 'Nouvelle partie',
    yes: 'Oui',
    no: 'Non',
    moves: 'Coups',
    previousPosition: 'Position précédente',
    nextPosition: 'Position suivante',
    choosePromotion: 'Choisir la pièce de promotion',
    promoteTo: 'Promouvoir en',
    queen: 'Dame',
    rook: 'Tour',
    bishop: 'Fou',
    knight: 'Cavalier',
    whyTheBotPlayedIt: "Pourquoi le Bot l'a joué",
    theGameSoFar: 'La partie jusqu’ici, face à celles de Camille',
    analysisMode: 'Mode analyse',
    analysisNoteBefore: 'Lance ',
    analysisNoteAfter:
      ` (GPL-3.0) dans votre navigateur, un téléchargement de 1,8${NO_BREAK}Mo, pour montrer combien chaque coup du Bot ` +
      'a perdu à l’évaluation. Une partie jouée avec ce mode activé est enregistrée comme assistée.',
    readingTheCounts: 'Lecture des chiffres…',
    gamesFinished: 'Parties terminées',
    botRecord: 'Le bilan du Bot',
    botScore: 'Le score du Bot',
    fromOpeningBook: 'Ses coups tirés du livre d’ouvertures',
    feltReal: 'A paru un vrai joueur de ce niveau',
    noGameYet: 'aucune partie pour l’instant',
    noMoveYet: 'aucun coup pour l’instant',
    noAnswerYet: 'aucune réponse pour l’instant',
  },
  side: (colour) => {
    if (colour === 'white') {
      return 'Blancs';
    }
    return 'Noirs';
  },
  bot: 'Bot',
  you: 'Vous',
  chooseASide: 'Choisissez une couleur pour commencer.',
  yourTurn: (toMove) => `Aux ${FRENCH.side(toMove)} de jouer${NO_BREAK}: à vous.`,
  botThinking: (toMove) => `Aux ${FRENCH.side(toMove)} de jouer${NO_BREAK}: le Bot réfléchit…`,
  checkmate: (winner) => `Échec et mat. Les ${FRENCH.side(winner)} gagnent.`,
  resignation: (winner) => `Les ${FRENCH.side(opponentOf(winner))} abandonnent. Les ${FRENCH.side(winner)} gagnent.`,
  timeForfeit: (winner) => `Les ${FRENCH.side(opponentOf(winner))} n’ont plus de temps. Les ${FRENCH.side(winner)} gagnent.`,
  stalemate: 'Partie nulle par pat.',
  insufficientMaterial: 'Partie nulle par manque de matériel.',
  fiftyMoveRule: 'Partie nulle par la règle des cinquante coups.',
  threefoldRepetition: 'Partie nulle par triple répétition.',
  drawOnTime: `Partie nulle${NO_BREAK}: temps écoulé, mais l’adversaire ne pouvait pas mater.`,
  cannotContinue: 'La partie ne peut pas continuer sans le Bot.',
  botWaitsForModel: 'Le Bot répondra une fois son modèle chargé.',
  preparingTheBot: 'Préparation du Bot…',
  downloading: (megabytes) => `Téléchargement du modèle du Bot${NO_BREAK}: ${megabytes}${NO_BREAK}Mo`,
  downloadingOf: (received, total) => `Téléchargement du modèle du Bot${NO_BREAK}: ${received} sur ${total}${NO_BREAK}Mo`,
  botFailed: (reason) => `Le Bot n’a pas pu être chargé${NO_BREAK}: ${reason}. Rechargez la page pour réessayer.`,
  browserCouldNotStartIt: 'le navigateur n’a pas pu le démarrer',
  impressionRecorded: 'Merci, votre réponse a été enregistrée.',
  impressionNotRecorded: 'Votre réponse n’a pas pu être enregistrée.',
  impressionQuestion: (rating) => `Le Bot vous a-t-il paru être un vrai joueur d’environ ${rating} sur Lichess${NO_BREAK}?`,
  summaryUnavailable: 'Les chiffres n’ont pas pu être lus. Réessayez dans une minute.',
  wins: (count) => french(count, 'victoire', 'victoires'),
  draws: (count) => french(count, 'nulle', 'nulles'),
  losses: (count) => french(count, 'défaite', 'défaites'),
  answered: (feltReal, answered) => `${feltReal} sur ${answered} ayant répondu`,
  percent: (share, decimals) => `${(100 * share).toFixed(decimals).replace('.', ',')}${NO_BREAK}%`,
  panel: {
    placeholder: 'Chaque coup du Bot est expliqué ici au fil de la partie.',
    phase: { opening: 'Ouverture (1-10)', middlegame: 'Milieu de partie (11-30)', endgame: 'Finale (31+)' },
    phaseMoves: {
      opening: 'coups d’ouverture',
      middlegame: 'coups de milieu de partie',
      endgame: 'coups de finale',
    },
    bookWithCounts: (san, reached, played) =>
      `Tiré du livre d’ouvertures${NO_BREAK}: Camille a atteint cette position ${frenchTimes(reached)} dans ses parties ` +
      `et y a joué ${san} ${frenchTimes(played)}.`,
    bookWithoutCounts: `Tiré du livre d’ouvertures${NO_BREAK}: la réponse de Camille lui-même dans cette position.`,
    random: `Un coup légal tiré au hasard${NO_BREAK}: le modèle de base n’était pas disponible.`,
    fromModel: (legalMoves, temperature, among) =>
      `Tiré du modèle de base, parmi ${legalMoves} coups légaux, à la température ${frenchNumber(temperature)} ${among}.`,
    amongEveryMove: 'parmi tous les coups légaux',
    amongCut: (cutName) => `parmi les coups ${cutName} du modèle, la coupe avec laquelle le Bot joue son ouverture`,
    move: 'Coup',
    model: 'Modèle',
    drawn: 'Tirage',
    rank: (rank) => {
      if (rank === 1) {
        return 'C’était le coup le plus probable selon le modèle.';
      }
      return `C’était le ${frenchOrdinal(rank)} coup le plus probable selon le modèle.`;
    },
    rarity: (share, phase) =>
      `Camille joue un coup aussi improbable sur ${share} de ses ${FRENCH.panel.phaseMoves[phase]}.`,
    rarityNone: (phase) =>
      `Aucun des ${FRENCH.panel.phaseMoves[phase]} de Camille mesurés n’était aussi improbable pour le modèle.`,
    evaluating: 'Stockfish évalue le coup…',
    evaluationFailed: 'Stockfish n’a pas pu évaluer le coup.',
    decided:
      `La partie était déjà jouée${NO_BREAK}: les deux coups valent dix pions ou plus pour le même camp, ` +
      'donc la perte n’est pas comptée.',
    lost: (centipawns) => `Stockfish${NO_BREAK}: le coup a perdu ${centipawns} centipions par rapport au meilleur coup.`,
    movesUnderOnePercent: `Coups sous 1${NO_BREAK}%`,
    averageLoss: 'Perte moyenne',
    openingTooShort: (figure, botMoves) =>
      `${figure}${NO_BREAK}: l’ouverture compte au plus ${botMoves} coups du Bot, trop peu pour conclure sur une partie.`,
    tooFew: (figure, counted, needed) => `${figure}${NO_BREAK}: ${counted}, trop peu pour conclure (il en faut ${needed}).`,
    modelMovesSoFar: (count) => `${french(count, 'coup du modèle de base', 'coups du modèle de base')} jusqu’ici`,
    openMovesEvaluated: (count) => {
      if (count < 2) {
        return `${count} coup en position ouverte évalué jusqu’ici`;
      }
      return `${count} coups en position ouverte évalués jusqu’ici`;
    },
    improbableVerdict: (improbable, moves, share, placement, range) =>
      `Coups sous 1${NO_BREAK}%${NO_BREAK}: ${improbable} sur ${moves} (${share}), ${frenchPlacement(placement)} (${range}).`,
    lossVerdict: (average, moves, placement, range) =>
      `Perte moyenne${NO_BREAK}: ${average}${NO_BREAK}cp sur ${moves} coups, ${frenchPlacement(placement)} (${range}).`,
    centipawnRange: (low, high) => `de ${low} à ${high}${NO_BREAK}cp`,
    usualRange: (movesForAVerdict, games) =>
      `Son intervalle habituel couvre les 80${NO_BREAK}% centraux de ses parties, à partir de ${movesForAVerdict} coups ` +
      `dans une phase. Coups sous 1${NO_BREAK}%${NO_BREAK}: les probabilités du modèle de base lui-même, ` +
      `sur ses ${games} parties mises de côté pour les mesures.`,
    lossesSource: (engine, depth, games) =>
      `Pertes${NO_BREAK}: ${engine} à la profondeur ${depth}, les réglages utilisés ici, sur ses ${games} parties, ` +
      'en ne comptant que les coups joués en position ouverte.',
  },
};

function frenchTimes(count: number): string {
  if (count === 1) {
    return 'une fois';
  }
  return `${count} fois`;
}

function frenchNumber(value: number): string {
  return `${value}`.replace('.', ',');
}

function frenchPlacement(placement: Placement): string {
  if (placement === 'below') {
    return 'sous son intervalle habituel';
  }
  if (placement === 'above') {
    return 'au-dessus de son intervalle habituel';
  }
  return 'dans son intervalle habituel';
}

function opponentOf(side: Colour): Colour {
  if (side === 'white') {
    return 'black';
  }
  return 'white';
}

/** The texts of each language the page speaks. */
export const TEXTS: Record<Language, Texts> = { en: ENGLISH, fr: FRENCH };
