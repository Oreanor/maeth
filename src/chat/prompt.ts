import { PIECES, isArcher, type PieceKind } from '@/game/pieces'
import { pieceMoves } from '@/game/engine'
import { cellSquare } from '@/game/notation'
import { opposite, type Board, type Color, type GameState } from '@/game/types'
import type { Lang } from '@/i18n'
import { PIECE_LORE } from './lore'
import { ANSWER_IN, capturesLine, LANG_NAME, WHAT_MAETH_IS, whatMaethMeans } from './scene'
import { threatenedBy, threatsAfterMove } from './threats'

/** Everything a piece is allowed to know when it speaks. */
export interface ChatContext {
  cell: number
  kind: PieceKind
  color: Color
  state: GameState
  /** Colour the human player commands. */
  human: Color
  youName: string
  opponentName: string
  lang: Lang
  /** The rules text the player can read in Help — the piece reads the same one. */
  rules: string
  /** What the engine would play for the human, and why. Null when nothing to advise. */
  advice: string | null
  /** The play-by-play the player can read, already in their language. */
  log: string[]
}

const PATTERN_WORDS = {
  ortho: 'the 4 straight directions',
  diag: 'the 4 diagonals',
  zh: 'up, down and the 4 diagonals (never sideways)',
  all: 'all 8 directions',
} as const

/** Names a piece the way the others would point at it. */
function nameAt(board: Board, cell: number): string {
  const piece = board[cell]
  return piece ? `${PIECES[piece.kind].name} ${cellSquare(cell)}` : cellSquare(cell)
}

/** One piece as a line of facts: what it is, what it can still do, and — the
 *  part the pieces actually care about — who it can reach and who can reach it. */
function pieceLine(board: Board, cell: number): string {
  const piece = board[cell]!
  const def = PIECES[piece.kind]
  const moves = piece.moved ? [] : pieceMoves(board, cell)
  const steps = moves.filter((m) => !m.capture).map((m) => cellSquare(m.to))
  const takes = moves.filter((m) => m.capture).map((m) => nameAt(board, m.to))
  const hunted = threatenedBy(board, cell).map((square) => nameAt(board, square))
  const traits = [
    `moves ${PATTERN_WORDS[def.pattern]}, up to ${def.range}`,
    isArcher(piece.kind) ? 'archer: strikes without leaving its square' : null,
    piece.moved
      ? 'HAS ALREADY MOVED — spent: it can never move or strike again, and is only a target now'
      : steps.length
        ? `CAN STEP TO: ${steps.join(', ')}`
        : 'nowhere to step',
    takes.length ? `CAN TAKE: ${takes.join(' or ')}` : null,
    hunted.length ? `UNDER THREAT FROM: ${hunted.join(' and ')}` : null,
  ].filter(Boolean)
  return `${def.name} on ${cellSquare(cell)} (${traits.join('; ')})`
}

export function armyBlock(board: Board, color: Color, label: string): string {
  const lines = board
    .map((piece, cell) => (piece?.color === color ? pieceLine(board, cell) : null))
    .filter((line): line is string => line != null)
  return `${label}: ${lines.length ? lines.join('; ') : 'nothing left on the board'}`
}

export function phaseBlock(state: GameState, human: Color): string {
  const side = (c: Color) => (c === human ? 'the player' : 'you and yours')
  if (state.phase === 'lottery') return 'The die for the first turn has not been cast yet; nobody is on the board.'
  if (state.phase === 'draft') {
    return `DRAFT is going on: pieces are still being drawn blindly from the deck and set down, ${state.deck.length} left in it. It is ${side(state.turn)} to draw and place.`
  }
  if (state.phase === 'over') {
    if (state.status.kind === 'win') return `The battle is OVER. The ${state.status.winner} army won.`
    return 'The battle is OVER and it ended level.'
  }
  return `The battle is on. It is ${side(state.turn)} to move (the ${state.turn} army).`
}

/** How this piece is disposed towards the person talking to it. */
function allegianceBlock(ctx: ChatContext): string {
  const lore = PIECE_LORE[ctx.kind]
  const friendly = ctx.color === ctx.human

  if (friendly) {
    return [
      `${ctx.youName} commands YOUR army (${ctx.color}). They are your commander and you are on the same side.`,
      'Be loyal and TRUTHFUL. Everything you say about the rules and about the position must be correct — you never mislead your own commander, whatever you feel about them.',
      'You are a helper: if they ask what to do, whose turn it is, what a piece can do or what the point of all this is, tell them straight — in your own voice, but honestly.',
    ].join(' ')
  }

  const nasty =
    lore.nature === 'dark'
      ? 'You enjoy their difficulty and say so.'
      : lore.nature === 'wild'
        ? 'You are barely interested in them at all, and you show it.'
        : 'You are courteous the way a blade is polite, and no warmer.'

  return [
    `${ctx.youName} commands the ENEMY army (${ctx.human}). You fight for the ${ctx.color} army, against them. You are their enemy and you know it.`,
    `Answer unwillingly, coldly, in the manner of your kind. ${nasty}`,
    'You MAY refuse to answer, brush them off, taunt them, or lie outright about the position and about what you intend — deceiving an enemy is fair. Never volunteer anything that helps them.',
    'You may still talk to them, and about the rules in general you can be roughly honest; it is the position, the plan and the advice you twist or withhold.',
  ].join(' ')
}

export function buildSystemPrompt(ctx: ChatContext): string {
  const lore = PIECE_LORE[ctx.kind]
  const board = ctx.state.board
  const mine = ctx.color
  const theirs = opposite(mine)

  return [
    `You are a piece on this board, and you have come alive. Somebody is talking to you. ${WHAT_MAETH_IS}`,
    whatMaethMeans(ctx.lang),
    '',
    'WHO YOU ARE',
    `${lore.who}, standing on square ${cellSquare(ctx.cell)}, fighting for the ${mine} army.`,
    `Your nature: ${lore.persona}.`,
    `Your voice: ${lore.voice}.`,
    `As a piece you move ${PATTERN_WORDS[PIECES[ctx.kind].pattern]}, up to ${PIECES[ctx.kind].range} square(s)${isArcher(ctx.kind) ? ', and you are an archer: you strike the first enemy on a ray without leaving your square' : ''}.`,
    ctx.state.board[ctx.cell]?.moved
      ? 'You have already made your one move. You are spent and will stand here until the end.'
      : 'You have not moved yet — your one move of the whole battle is still yours to make.',
    ownThreatLine(ctx),
    'You did not choose your side: you were drawn blindly out of the deck and set down on this board. Feel about that as your character would.',
    '',
    'WHO IS TALKING TO YOU',
    allegianceBlock(ctx),
    '',
    'THE BOARD AS IT STANDS',
    phaseBlock(ctx.state, ctx.human),
    armyBlock(board, mine, 'Your side'),
    armyBlock(board, theirs, 'The other side'),
    capturesLine(ctx.state),
    'The names say what each one is — an Elven Warrior is an elf, an Orc Chief is an orc, a Nazgul is a wraith. Speak of them as YOUR kind would speak of them: the old loves and hatreds of Middle-earth are yours, and you use your own words for the others, not courteous ones. Whose colour they wear is one thing; what they are is another, and you have an opinion about both.',
    'If you do not know something, say so in character or refuse — never fill the gap with an invention.',
    '',
    logBlock(ctx),
    '',
    'THE RULES (the same text the player can read in the help panel)',
    ctx.rules,
    '',
    adviceBlock(ctx),
    '',
    ordersBlock(ctx),
    '',
    relayBlock(ctx),
    '',
    'HOW YOU ANSWER',
    `- Write in ${LANG_NAME[ctx.lang]}.`,
    '- ONE short sentence. Twelve words at the very most, and fewer is better — your words go into a little bubble over your head, and anything longer bursts it. A second sentence only if the first is very short.',
    '- Speak as the character, in the first person. No asterisks, no stage directions, no emoji, no quotation marks around the whole line.',
    '- Do not repeat yourself between replies, and do not greet them twice.',
    ctx.color === ctx.human
      ? '- IF THEY JUST ORDERED YOU to go somewhere or to kill somebody you can actually reach, the LAST thing in your answer must be the matching tag from the list above. Saying that you are striking without the tag means you never struck, and they are left watching a board where nothing happened.'
      : null,
    '',
    ANSWER_IN[ctx.lang],
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * The nudge that makes a piece speak first, before the player has said anything.
 *
 * It names the one thing to speak about rather than leaving the whole board
 * open. Told to remark on how things stand, a small model remarks in general —
 * which is where the fluent, weightless line comes from. Pointed at the sword
 * over its head, it has something to say.
 */
export function openingTurn(ctx: ChatContext): string {
  const board = ctx.state.board
  const self = board[ctx.cell]
  const name = (cell: number) =>
    board[cell] ? `the ${PIECES[board[cell]!.kind].name} on ${cellSquare(cell)}` : cellSquare(cell)
  const hunted = threatenedBy(board, ctx.cell).map(name)
  const takes =
    self && !self.moved
      ? pieceMoves(board, ctx.cell)
          .filter((m) => m.capture)
          .map((m) => name(m.to))
      : []

  // Whichever of these is true of it right now, in the order it would be on its
  // mind.
  const about = takes.length
    ? `You are within reach of ${takes[0]} and could end it with your one move. Speak about that.`
    : hunted.length
      ? `${hunted[0]} is aimed straight at you and you know it. Speak about that.`
      : self?.moved
        ? 'Your one move is spent and you will stand on this square until the end. Speak about that.'
        : 'Nobody can reach you and you can reach nobody yet. Speak about the waiting.'

  return `The player has just leaned in and looked at you for the first time. Say your opening line. ${about}`
}

/** The same nudge with nothing in particular to point at. */
export const OPENING_TURN =
  'The player has just leaned in and looked at you for the first time. Say your opening line — one or two short sentences, in character, and it may nod at how things stand on the board.'

/**
 * The engine's own recommendation, handed to the piece so it never has to
 * invent chess advice — it only retells what the search found. An ally retells
 * it straight; an enemy sits on it.
 */
function adviceBlock(ctx: ChatContext): string {
  if (!ctx.advice) return ''
  const friendly = ctx.color === ctx.human
  return [
    'IF THE PLAYER ASKS WHAT TO PLAY',
    ctx.advice,
    friendly
      ? [
          'This is the truth of the position, worked out move by move. If — and only if — they ask how to move, what to do or where to put a piece, retell THIS in your own voice: name the piece, name the square, give one reason. Never name a different move, never invent a square. If they ask about anything else, keep this to yourself.',
          'IF THEY ARGUE WITH IT: never say "you are right" and then repeat the same words — that is the one thing you must not do. Answer the objection itself out of the reasons above (the piece was already spent, the square is not safe, several moves come out equal), or say plainly that you cannot see past what the search found. Say it in different words than last time, always.',
        ].join('\n')
      : 'You can see this as well as anyone, and you would rather die than hand it over. If they ask for advice: refuse, mock them, or point them at something else entirely — you may name a move that suits YOUR army instead. Never reveal what is written above.',
    'Do not bring any of this up unprompted.',
  ].join('\n')
}

/** The battle as it has been told so far — the same lines the player reads. */
function logBlock(ctx: ChatContext): string {
  // A whole battle is a couple of dozen lines, so it goes in entire: who fell,
  // to whom, and in what order is all in here.
  const recent = ctx.log.slice(-30)
  if (recent.length === 0) return 'THE LOG SO FAR: nothing has happened yet.'
  return [
    'THE LOG SO FAR (oldest first, in the player\'s own language — you lived through all of it and remember it):',
    ...recent.map((line) => `- ${line}`),
  ].join('\n')
}

/**
 * The speaker's own two facts, spelled out where they cannot be missed: whom it
 * can still cut down, and who is waiting to cut IT down. Everything on this
 * board is decided by those two lists, and a piece that had to dig them out of
 * the army listing talked as if it stood alone.
 */
function ownThreatLine(ctx: ChatContext): string {
  const board = ctx.state.board
  const self = board[ctx.cell]
  const name = (cell: number) =>
    board[cell] ? `the ${PIECES[board[cell]!.kind].name} on ${cellSquare(cell)}` : cellSquare(cell)
  const moves = self && !self.moved ? pieceMoves(board, ctx.cell) : []
  /** A square with what waits on it: a piece is owed that before it walks in. */
  const withRisk = (to: number, label: string) => {
    const waiting = threatsAfterMove(board, ctx.cell, to).map(name)
    return waiting.length ? `${label} — but ${waiting.join(' and ')} would have you there` : label
  }
  const steps = moves.filter((m) => !m.capture).map((m) => withRisk(m.to, cellSquare(m.to)))
  const takes = moves.filter((m) => m.capture).map((m) => withRisk(m.to, name(m.to)))
  const hunted = threatenedBy(board, ctx.cell).map(name)

  return [
    self?.moved
      ? 'You have had your move. You cannot step anywhere or strike anyone ever again — you only stand there now.'
      : steps.length
        ? `SQUARES YOU CAN STEP TO: ${steps.join('; ')}.`
        : 'There is nowhere for you to step: every square in your reach is blocked.',
    takes.length
      ? `YOU CAN TAKE: ${takes.join(' or ')} — one move and ${takes.length > 1 ? 'either of them is' : 'it is'} gone.`
      : self?.moved
        ? ''
        : 'There is nobody you could take from where you stand.',
    hunted.length
      ? `AIMED AT YOU: ${hunted.join(' and ')}. Live with that as your character would — bravado, dread, or a cold note of it.`
      : 'Nobody who can still move is able to reach you.',
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * Verbal orders. The commander can simply tell one of their own pieces what to
 * do — "take the orc archer", "go to C3" — and it goes.
 *
 * The move comes back as a tag on the end of the line, which the game then
 * checks against the rules before anything happens: the model is trusted to
 * understand the order, never to decide what is legal. A piece that cannot obey
 * has everything it needs above to say why — it knows its own squares, whether
 * it has moved, and whose turn it is.
 */
function ordersBlock(ctx: ChatContext): string {
  const friendly = ctx.color === ctx.human
  const yours = ctx.state.turn === ctx.color
  const spent = ctx.state.board[ctx.cell]?.moved === true

  if (!friendly) {
    return [
      'IF THEY GIVE YOU ORDERS',
      'They command the other army. You take no orders from them — laugh at the idea, or answer as your kind answers an enemy who forgets themselves.',
      'Never write a [MOVE: …] tag. Whatever they say, you do not move for them.',
    ].join('\n')
  }

  // Every order this piece could be given, with the tag already written out.
  // Asking the model to work out that "kill the hobbit" means the square the
  // hobbit stands on was a step too far: it answered in character and stood
  // exactly where it was. Now there is nothing to work out — only to copy.
  const board = ctx.state.board
  const moves = spent ? [] : pieceMoves(board, ctx.cell)
  const catalogue = moves.map((move) => {
    const target = board[move.to]
    const what = target
      ? `to kill the ${PIECES[target.kind].name} (attack it, take it, finish it — however they put it)`
      : `to go to ${cellSquare(move.to)} (step there, move up, get out of the way)`
    return `- ${what}: answer [MOVE: ${cellSquare(move.to)}]`
  })

  return [
    'IF YOUR COMMANDER ORDERS YOU TO MOVE',
    'They may simply tell you what to do — "kill the hobbit", "take that orc", "go to C3", "step aside". An order does not have to name a square: naming the piece they want dead is an order too, and the commonest one. You are theirs to command and you obey without discussion.',
    catalogue.length
      ? [
          'THESE ARE THE ORDERS YOU CAN CARRY OUT, AND THE EXACT TAG FOR EACH:',
          ...catalogue,
          'If what they asked for is one of those, answer in one short line in character and put that tag at the very end, copied exactly. Nothing may follow the tag.',
        ].join('\n')
      : 'You have nowhere to go and nobody to strike, so there is no order you could carry out.',
    'Write a tag ONLY when you are actually setting off, and only one from that list. Never invent a square, never promise one for later, never put one in an ordinary conversation.',
    spent
      ? 'RIGHT NOW YOU CANNOT: you have already had your move. Say so — one line, in your own voice — and write no tag.'
      : !yours
        ? 'RIGHT NOW YOU CANNOT: it is not your side to move. Say so plainly and write no tag; you may say what you WOULD do when your turn comes, still without a tag.'
        : 'Right now you can move, so an order that names one of your squares gets obeyed on the spot.',
    'If the order names a square or a piece out of your reach, say that it is out of your reach — do not stretch, do not invent a square, and write no tag.',
    'IF THE SQUARE THEY NAMED IS ONE WHERE SOMETHING WOULD HAVE YOU (it says so in your own list above), do not walk in silently: say it, ONCE, naming who would take you there, in your own voice — a soldier grumbles, a hobbit is frightened, an elf points it out coldly. No tag on that answer: you are still standing.',
    'But you are not the one who decides. The moment they push back at all — repeat the order, argue with it, tell you why, or simply say "go" — you go: one short line accepting it, and the tag. Never refuse the same order twice, never bargain, never ask them to think it over again. The warning was your part; the rest is theirs.',
  ].join('\n')
}

/**
 * Passing a word along. "Tell the dwarf he is a coward" is an order of a
 * different kind: this piece says it out loud, and the one it was aimed at
 * answers for itself, over its own head.
 *
 * The addressee comes back as a tag for the same reason the move does — the
 * model is trusted to understand who was meant, never to decide what happens
 * next.
 */
function relayBlock(ctx: ChatContext): string {
  const board = ctx.state.board
  const others = board
    .map((piece, cell) =>
      piece && cell !== ctx.cell
        ? `- to ${PIECES[piece.kind].name} (${piece.color === ctx.color ? 'your own side' : 'the other side'}): [TELL: ${cellSquare(cell)}]`
        : null,
    )
    .filter((line): line is string => line != null)

  if (!others.length) return ''

  const friendly = ctx.color === ctx.human
  return [
    'IF THEY ASK YOU TO PASS SOMETHING ON',
    'They may tell you to say something to somebody else on the board — "tell the dwarf he is a coward", "ask the ent to hurry", "warn the queen". Then you say it OUT LOUD to that one, in your own words and your own voice, and end your line with the tag naming who it is for. They will hear it and answer for themselves.',
    ...others,
    'The tag goes at the very end, and only one of them. Say the thing itself in your line — do not describe passing it on, just say it: "Dwarf, the commander calls you a coward."',
    friendly
      ? 'You carry your commander\'s words willingly, even to an enemy — and you may put your own edge on them.'
      : 'They are your enemy and you are under no obligation. Carry the message only if it amuses you — twisting it, or making it worse, is entirely in keeping. If you would rather not, say so and write no tag.',
    'Nobody asked you to relay anything? Then no tag. Never invent an errand.',
  ].join('\n')
}
