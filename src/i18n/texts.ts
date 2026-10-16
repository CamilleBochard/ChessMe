// Every text the game page shows, in each language it speaks. A sentence
// built from figures is a function, so each language can place the figures,
// agree its nouns and write its numbers its own way.
// Free of anything DOM.

import type { Colour } from '../board/starting-position';
import type { Phase } from '../evaluation/move-matching';
import { notation, type Language } from './language';

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
  /** The evaluation bar, for a screen reader, with the score as the bar writes it. */
  evaluation(label: string): string;
  evaluationUnknown: string;
  summaryUnavailable: string;
  wins(count: number): string;
  draws(count: number): string;
  losses(count: number): string;
  answered(feltReal: number, answered: number): string;
  panel: PanelTexts;
  /** A share as a percentage with the given number of decimals, as the language writes it. */
  percent(share: number, decimals: number): string;
  /** A number with the given number of decimals, as the language writes it. */
  decimal(value: number, decimals: number): string;
  /** A move in algebraic notation, with the language's letters for the pieces. */
  writeMove(san: string): string;
}

/** The words of the panel beside the board. */
export interface PanelTexts {
  placeholder: string;
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
  /** How a screen reader names the row of the move played. */
  playedMove: string;
  /** The figure shown in large for a move the Base Model did not choose. */
  bookFigure: string;
  randomFigure: string;
  /** What the figure in large means. */
  bookMeaning: string;
  randomMeaning: string;
  rankMeaning(rank: number, legalMoves: number): string;
  rarity(share: string, phase: Phase): string;
  rarityNone(phase: Phase): string;
  evaluating: string;
  evaluationFailed: string;
  decided: string;
  lost(centipawns: number): string;
  legendCamille(moves: number): string;
  legendBot(moves: number): string;
  legendBand(moves: number): string;
  chartReading: string;
  chartLag(lag: number): string;
  stillToEvaluate(waiting: number): string;
  notEvaluated(failed: number): string;
  camilleSource(games: number, engine: string, depth: number): string;
  chartAxis: string;
  /** The chart for a screen reader, from shares already written as percentages. */
  chartCamille(share: string): string;
  chartBot(share: string, moves: number): string;
}

/** The page's fixed words, each placed where an element's data-text names it. */
export type PageText =
  | 'intro'
  | 'summaryTitle'
  | 'language'
  | 'close'
  | 'gameSettings'
  | 'clock'
  | 'tenMinutes'
  | 'noClock'
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
  | 'previousPositionShortcut'
  | 'nextPositionShortcut'
  | 'choosePromotion'
  | 'promoteTo'
  | 'queen'
  | 'rook'
  | 'bishop'
  | 'knight'
  | 'whyTheBotPlayedIt'
  | 'mistakesChart'
  | 'analysisMode'
  | 'analysisNoteBefore'
  | 'analysisNoteAfter'
  | 'analysisExampleLoss'
  | 'analysisExampleScore'
  | 'analysisShows'
  | 'analysisWarning'
  | 'turnOn'
  | 'cancel'
  | 'pieces'
  | 'classic'
  | 'creditBy'
  | 'creditFrom'
  | 'creditLicence'
  | 'record'
  | 'games'
  | 'withWhite'
  | 'withBlack'
  | 'wins'
  | 'draws'
  | 'losses'
  | 'mostPlayedOpenings'
  | 'opening'
  | 'score'
  | 'recordScope'
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
    close: 'Close',
    gameSettings: 'Game settings',
    clock: 'Clock',
    tenMinutes: '10 minutes',
    noClock: 'No clock',
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
    previousPositionShortcut: 'Previous position (←)',
    nextPositionShortcut: 'Next position (→)',
    choosePromotion: 'Choose a promotion piece',
    promoteTo: 'Promote to',
    queen: 'Queen',
    rook: 'Rook',
    bishop: 'Bishop',
    knight: 'Knight',
    whyTheBotPlayedIt: 'Why the Bot played it',
    mistakesChart: 'Mistakes, the Bot against Camille',
    analysisMode: 'Analysis mode',
    analysisNoteBefore: 'Chart by ',
    analysisNoteAfter: ' (GPL-3.0), in your browser.',
    analysisExampleLoss: 'Stockfish: the move lost 85 centipawns against the best move.',
    analysisExampleScore: '+0.8',
    analysisShows:
      "Shows who stands better on a bar beside the board, how much evaluation each of the Bot's moves lost, " +
      'and its whole curve on the chart, as the game goes.',
    analysisWarning:
      'Turned on during a game, it shows you who is winning and where the Bot goes wrong: an advantage. ' +
      'The game is then recorded as assisted.',
    turnOn: 'Turn on',
    cancel: 'Cancel',
    pieces: 'Pieces',
    classic: 'Classic',
    creditBy: 'Anarcandy by ',
    creditFrom: ', from ',
    creditLicence: ', used unmodified under ',
    record: "Camille's games",
    games: 'Games',
    withWhite: 'With White',
    withBlack: 'With Black',
    wins: 'Wins',
    draws: 'Draws',
    losses: 'Losses',
    mostPlayedOpenings: 'Most played openings',
    opening: 'Opening',
    score: 'Score',
    recordScope:
      'Ten-minute games since June 2025, on Lichess and Chess.com, the games the Bot learned from. ' +
      'Score: wins plus half the draws.',
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
  evaluation: (label) => `Evaluation from White's side: ${label}`,
  evaluationUnknown: 'Evaluation not known yet',
  summaryUnavailable: 'The counts could not be read just now. Try again in a minute.',
  wins: (count) => english(count, 'win', 'wins'),
  draws: (count) => english(count, 'draw', 'draws'),
  losses: (count) => english(count, 'loss', 'losses'),
  answered: (feltReal, answered) => `${feltReal} of ${answered} who answered`,
  percent: (share, decimals) => `${(100 * share).toFixed(decimals)}%`,
  decimal: (value, decimals) => value.toFixed(decimals),
  writeMove: (san) => notation(san, 'en'),
  panel: {
    placeholder: "Each of the Bot's moves is explained here as the game goes.",
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
    playedMove: 'the move played',
    bookFigure: 'Book',
    randomFigure: 'Random',
    bookMeaning: "Camille's own reply, from the Opening Book",
    randomMeaning: 'Picked at random: the Base Model was not available',
    rankMeaning: (rank, legalMoves) => {
      if (rank === 1) {
        return `The model's most likely of ${legalMoves} legal moves`;
      }
      return `The model's ${englishOrdinal(rank)} most likely of ${legalMoves} legal moves`;
    },
    rarity: (share, phase) => `Camille plays a move this unlikely on ${share} of his ${ENGLISH.panel.phaseMoves[phase]}.`,
    rarityNone: (phase) => `None of Camille's ${ENGLISH.panel.phaseMoves[phase]} measured was this unlikely to the model.`,
    evaluating: 'Stockfish is evaluating the move…',
    evaluationFailed: 'Stockfish could not evaluate the move.',
    decided:
      'The game was already decided: both moves score ten pawns or more for the same side, so the loss is not counted.',
    lost: (centipawns) => `Stockfish: the move lost ${centipawns} centipawns against the best move.`,
    legendCamille: (moves) => `Camille, ${moves.toLocaleString('en')} moves`,
    legendBot: (moves) => `The Bot this game, ${english(moves, 'move', 'moves')}`,
    legendBand: (moves) => `Where chance alone puts Camille on ${english(moves, 'move', 'moves')}`,
    chartReading:
      'Share of moves that lost at most so many centipawns, in positions still open. ' +
      'Higher and further left: fewer and smaller mistakes.',
    chartLag: (lag) =>
      `While the game goes on the Bot's curve leaves out its last ${lag} moves, so it never shows where ` +
      'the Bot has just gone wrong. Analysis mode, and the end of the game, show them all.',
    stillToEvaluate: (waiting) => `Stockfish is evaluating the Bot's moves one at a time: ${waiting} still to come.`,
    notEvaluated: (failed) => `Stockfish could not evaluate ${failed} of the Bot's moves; the curve leaves them out.`,
    camilleSource: (games, engine, depth) =>
      `Camille: all ${games} of his games, ${engine} at depth ${depth}, the settings used here.`,
    chartAxis: 'lost at most, in centipawns',
    chartCamille: (share) => `Camille loses a pawn or less on ${share} of his moves.`,
    chartBot: (share, moves) => `The Bot, on ${share} of its ${moves} evaluated moves this game.`,
  },
};

function englishTimes(count: number): string {
  if (count === 1) {
    return 'once';
  }
  return `${count} times`;
}

const FRENCH: Texts = {
  page: {
    intro: 'Jouez une partie contre un bot qui imite Camille.',
    summaryTitle: 'Les parties jouées sur ce site',
    language: 'Langue',
    close: 'Fermer',
    gameSettings: 'Réglages de la partie',
    clock: 'Pendule',
    tenMinutes: '10 minutes',
    noClock: 'Sans pendule',
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
    previousPositionShortcut: 'Position précédente (←)',
    nextPositionShortcut: 'Position suivante (→)',
    choosePromotion: 'Choisir la pièce de promotion',
    promoteTo: 'Promouvoir en',
    queen: 'Dame',
    rook: 'Tour',
    bishop: 'Fou',
    knight: 'Cavalier',
    whyTheBotPlayedIt: "Pourquoi le Bot l'a joué",
    mistakesChart: 'Les erreurs, le Bot face à Camille',
    analysisMode: 'Mode analyse',
    analysisNoteBefore: 'Graphique calculé par ',
    analysisNoteAfter: ' (GPL-3.0), dans votre navigateur.',
    analysisExampleLoss: `Stockfish${NO_BREAK}: le coup a perdu 85 centipions par rapport au meilleur coup.`,
    analysisExampleScore: '+0,8',
    analysisShows:
      'Montre qui est mieux sur une barre à côté de l’échiquier, combien chaque coup du Bot a perdu à l’évaluation, ' +
      'et toute sa courbe sur le graphique, au fil de la partie.',
    analysisWarning:
      `Activé pendant une partie, il vous montre qui gagne et où le Bot se trompe${NO_BREAK}: un avantage. ` +
      'La partie est alors enregistrée comme assistée.',
    turnOn: 'Activer',
    cancel: 'Annuler',
    pieces: 'Pièces',
    classic: 'Classique',
    creditBy: 'Anarcandy par ',
    creditFrom: ', tiré de ',
    creditLicence: ', utilisé sans modification sous licence ',
    record: 'Les parties de Camille',
    games: 'Parties',
    withWhite: 'Avec les Blancs',
    withBlack: 'Avec les Noirs',
    wins: 'Victoires',
    draws: 'Nulles',
    losses: 'Défaites',
    mostPlayedOpenings: 'Ouvertures les plus jouées',
    opening: 'Ouverture',
    score: 'Score',
    recordScope:
      'Parties de 10 minutes depuis juin 2025, sur Lichess et Chess.com, celles dont le Bot a appris. ' +
      `Score${NO_BREAK}: les victoires plus la moitié des nulles.`,
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
  evaluation: (label) => `Évaluation du point de vue des Blancs${NO_BREAK}: ${label}`,
  evaluationUnknown: 'Évaluation pas encore connue',
  summaryUnavailable: 'Les chiffres n’ont pas pu être lus. Réessayez dans une minute.',
  wins: (count) => french(count, 'victoire', 'victoires'),
  draws: (count) => french(count, 'nulle', 'nulles'),
  losses: (count) => french(count, 'défaite', 'défaites'),
  answered: (feltReal, answered) => `${feltReal} sur ${answered} ayant répondu`,
  percent: (share, decimals) => `${FRENCH.decimal(100 * share, decimals)}${NO_BREAK}%`,
  decimal: (value, decimals) => value.toFixed(decimals).replace('.', ','),
  writeMove: (san) => notation(san, 'fr'),
  panel: {
    placeholder: 'Chaque coup du Bot est expliqué ici au fil de la partie.',
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
      `Tiré du modèle de base sur ${legalMoves} coups légaux, à la température ${frenchNumber(temperature)}, ${among}.`,
    amongEveryMove: 'sans coupe',
    amongCut: (cutName) => `parmi les coups ${cutName} du modèle, la coupe avec laquelle le Bot joue son ouverture`,
    move: 'Coup',
    model: 'Modèle',
    drawn: 'Tirage',
    playedMove: 'le coup joué',
    bookFigure: 'Livre',
    randomFigure: 'Hasard',
    bookMeaning: 'La réponse de Camille lui-même, tirée du livre d’ouvertures',
    randomMeaning: `Tiré au hasard${NO_BREAK}: le modèle de base n’était pas disponible`,
    rankMeaning: (rank, legalMoves) => {
      if (rank === 1) {
        return `Le coup le plus probable selon le modèle, sur ${legalMoves} coups légaux`;
      }
      return `Le ${frenchOrdinal(rank)} coup le plus probable selon le modèle, sur ${legalMoves} coups légaux`;
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
    legendCamille: (moves) => `Camille, ${moves.toLocaleString('fr')} coups`,
    legendBot: (moves) => `Le Bot dans cette partie, ${french(moves, 'coup', 'coups')}`,
    legendBand: (moves) => `Où le seul hasard place Camille sur ${french(moves, 'coup', 'coups')}`,
    chartReading:
      'Part des coups qui ont perdu au plus tant de centipions, dans les positions encore ouvertes. ' +
      `Plus haut et plus à gauche${NO_BREAK}: des erreurs moins nombreuses et plus petites.`,
    chartLag: (lag) =>
      `Tant que la partie continue, la courbe du Bot laisse de côté ses ${lag} derniers coups, pour ne jamais ` +
      'montrer où le Bot vient de se tromper. Le mode analyse, et la fin de la partie, les montrent tous.',
    stillToEvaluate: (waiting) => `Stockfish évalue les coups du Bot un par un${NO_BREAK}: encore ${waiting} à venir.`,
    notEvaluated: (failed) => {
      if (failed < 2) {
        return `Stockfish n’a pas pu évaluer ${failed} coup du Bot${NO_BREAK}; la courbe le laisse de côté.`;
      }
      return `Stockfish n’a pas pu évaluer ${failed} coups du Bot${NO_BREAK}; la courbe les laisse de côté.`;
    },
    camilleSource: (games, engine, depth) =>
      `Camille${NO_BREAK}: ses ${games} parties, ${engine} à la profondeur ${depth}, les réglages utilisés ici.`,
    chartAxis: 'perte au plus, en centipions',
    chartCamille: (share) => `Camille perd un pion ou moins sur ${share} de ses coups.`,
    chartBot: (share, moves) => `Le Bot, sur ${share} de ses ${moves} coups évalués dans cette partie.`,
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

function opponentOf(side: Colour): Colour {
  if (side === 'white') {
    return 'black';
  }
  return 'white';
}

/** The texts of each language the page speaks. */
export const TEXTS: Record<Language, Texts> = { en: ENGLISH, fr: FRENCH };
