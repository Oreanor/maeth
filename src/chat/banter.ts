import { PIECES } from '@/game/pieces'
import { cellSquare } from '@/game/notation'
import { opposite, type Board, type Color, type GameState } from '@/game/types'
import type { Lang } from '@/i18n'
import { PIECE_LORE } from './lore'
import { stripThinking } from './llm'
import { armyBlock, phaseBlock } from './prompt'
import { capturesLine, LANG_NAME, WHAT_MAETH_IS, whatMaethMeans } from './scene'

/**
 * The board talking to ITSELF — the pieces shouting about the move that just
 * landed, and bickering among themselves when nothing has happened for a while.
 *
 * A whole exchange is written in ONE request: the model is told who stands
 * where, who fights for whom, and which of them speak in what order, and it
 * returns the lines as a list. Asking line by line would cost four round trips
 * and produce four monologues instead of a conversation.
 */

export interface Scene {
  state: GameState
  human: Color
  youName: string
  lang: Lang
}

/** Who is on the board and how things stand — the shared opening of every prompt. */
function sceneBlock(scene: Scene): string {
  const { state, human } = scene
  const enemy = opposite(human)
  return [
    WHAT_MAETH_IS,
    whatMaethMeans(scene.lang),
    '',
    'THE BOARD AS IT STANDS',
    phaseBlock(state, human),
    armyBlock(state.board, human, `The ${human} army, commanded by ${scene.youName} (the human player)`),
    armyBlock(state.board, enemy, `The ${enemy} army, the enemy`),
    capturesLine(state),
  ].join('\n')
}

/** One speaker, described well enough for the model to voice it. */
function speakerLine(board: Board, cell: number, human: Color, ordinal: number): string {
  const piece = board[cell]!
  const lore = PIECE_LORE[piece.kind]
  const side = piece.color === human ? "the player's side" : 'the enemy side'
  return `${ordinal}. ${PIECES[piece.kind].name} on ${cellSquare(cell)} (${side}) — ${lore.who}. Nature: ${lore.persona}. Voice: ${lore.voice}.`
}

const HOW_TO_SPEAK = [
  'Every line is ONE short sentence of twelve words at most — these go into little bubbles over their heads, and a long one bursts them. Short and sharp beats clever.',
  'Stay in character: the words, the register and the manners of that kind. Orcs are crude, elves are precise, the ent is slow, Shelob barely has words.',
  'The old loves and hatreds of Middle-earth are alive here: an orc has no polite name for an elf, a dwarf has an opinion about elves, and everything living has an opinion about the wraith. But the colour a piece was drawn into decides who it fights for — an orc may well be fighting alongside that elf now, and it galls them both.',
  'No stage directions, no asterisks, no emoji, and never a "Name:" label in front of a line — the bubble already hangs over whoever is talking.',
  'SAY WHO YOU ARE TALKING TO, BY NAME. A line aimed at somebody calls them what they are — "Ent, your branches have gone dry", "Watch the corner, dwarf" — because the bubble only shows who is speaking, never who is spoken to. NEVER address anyone by their square: "C2" and "A1" are map references, and nobody has ever shouted a map reference at an enemy. Answering whoever just spoke to you needs no name at all — that much is clear; name somebody again only when you turn on a different one.',
]

/** JSON comes back cleaner when the model is shown the exact shape. */
function outputRule(count: number, lang: Lang): string {
  return [
    `Write in ${LANG_NAME[lang]}.`,
    `Answer with NOTHING but a JSON array of exactly ${count} strings, one line per speaker, in the order they are listed above:`,
    `[${Array.from({ length: count }, () => '"…"').join(', ')}]`,
  ].join('\n')
}

/**
 * The one prompt behind every kind of outburst: who speaks, in what order, what
 * the occasion is, and what came before it if anything did.
 */
function speechPrompt(
  scene: Scene,
  speakers: number[],
  brief: string,
  occasion?: string,
): { system: string; user: string } {
  const system = [
    'You write what the pieces on a living game board say to each other. You voice ALL of them, one line each.',
    '',
    sceneBlock(scene),
  ].join('\n')

  const user = [
    occasion ? `WHAT JUST HAPPENED: ${occasion}\n` : '',
    'THE PIECES SPEAKING, IN ORDER:',
    ...speakers.map((cell, i) => speakerLine(scene.state.board, cell, scene.human, i + 1)),
    '',
    brief,
    '',
    ...HOW_TO_SPEAK,
    speakers.length > 1
      ? 'Line 2 answers line 1, line 3 answers what has already been said, and so on. They talk TO each other, not past each other.'
      : '',
    '',
    outputRule(speakers.length, scene.lang),
  ]
    .filter((part) => part !== '')
    .join('\n')

  return { system, user }
}

/** Idle chatter: what they get up to when the board has gone quiet. */
export type BanterFlavour = 'squabble' | 'gossip' | 'grumble'

const BANTER_BRIEF: Record<BanterFlavour, string> = {
  squabble:
    'They are needling each other ACROSS the lines: the first one goes for somebody on the other side — over their race, their looks, their smell, their doomed position, whatever its kind would pick on. The second answers back. The rest pile in, taking a side or making it worse. A quarrel, not a debate: short, personal, and nobody wins it.',
  gossip:
    'They are all on the SAME side, talking among themselves: heartening each other before the next blow, and making fun of the enemy across the board together — the ones actually standing there, by name. Comradely, in character, and the mockery is aimed outward rather than at each other.',
  grumble:
    // Deliberately not a list to choose from: a grievance that belongs to this
    // particular creature is the whole joke, and a fixed set of them would be
    // the same three complaints for the rest of the game.
    'Nobody is fighting this minute, and they are complaining. Not about tactics — about their lot: the war is the weather and they are grumbling at the weather. INVENT the grievance, and make it belong to THIS creature and nobody else: what chafes it, what it misses, what it is sick of, what it would rather be doing. A farmer worries about the harvest going in without him; an ent finds all of this far too hasty; a hobbit left something behind and is thinking about dinner; an orc hates the food and everyone near it; a demon of the ancient dark does not complain about armour. Whoever answers picks the grievance up — agrees, tops it, or tells them to be quiet.',
}

/**
 * The exchange itself. `speakers` is the running order — one line each, and
 * each one answers the line before it.
 */
export function banterPrompt(
  scene: Scene,
  speakers: number[],
  flavour: BanterFlavour,
): { system: string; user: string } {
  return speechPrompt(scene, speakers, BANTER_BRIEF[flavour])
}

/** What just happened on the board, for the pieces about to shout about it. */
export interface MoveNews {
  mover: string
  from: number
  to: number
  victim: string | null
  /** The strike was contested and failed — the attacker never left its square. */
  botched: boolean
  byPlayer: boolean
  /** The player played the very move the engine would have chosen. */
  bestPlayed: boolean
}

/** The several ways a board answers a move. */
export type ReactionFlavour = 'cheer' | 'mourn' | 'taunt' | 'survivor' | 'praise' | 'remark'

const REACTION_BRIEF: Record<ReactionFlavour, string> = {
  cheer:
    'Their own side has just struck somebody down. The first speaks in the flush of it — a war cry, a boast, a grim word over the body — and the second cheers them for it by name: well struck, good blade, about time. Comrades, loud, pleased with themselves.',
  mourn:
    'They have just lost one of their own. The first says what you say when somebody you stood beside is gone — grief, an oath, a curse at the killer by name — and the second answers in kind: a promise of payback, or a hard word about how it happened. No tactics: it is a friend, not a piece.',
  taunt:
    'The first, standing over the kill, jeers at the OTHER side about it. The second is one of that other side and gives it straight back — they have just lost somebody and are in no mood. Two lines across the line of battle, and both of them mean it.',
  survivor:
    'The blow was struck and it MISSED — the defender is still standing and knows exactly how close that was. It speaks first: relief, bravado, a laugh at the attacker, whatever its nature does with a near thing. Then the attacker answers, sour, or promising to finish it next time.',
  praise:
    'Their commander has just played the strongest move on the board and they can see it. One line of praise in their own register; if a second speaks, they agree in their own way. This one was genuinely well played — do not flatter a bad move.',
  remark:
    'Nothing died. Somebody moved, and whoever stands next to it has a word about it — a warning, a grunt, a jeer at where it went, a remark about who is now within reach of whom. One breath, no more.',
}

/**
 * A reaction to the move that just landed. Same machinery as the idle chatter —
 * one request, one list of lines — because a shout that gets an answer is worth
 * far more than a shout into the air.
 */
export function reactionPrompt(
  scene: Scene,
  speakers: number[],
  flavour: ReactionFlavour,
  news: MoveNews,
): { system: string; user: string } | null {
  if (!speakers.length || speakers.some((cell) => !scene.state.board[cell])) return null

  const occasion =
    news.botched && news.victim
      ? `${news.mover} struck at the ${news.victim} from ${cellSquare(news.from)} — and the duel went against it: the blow missed and the ${news.victim} is still standing.`
      : news.victim
        ? `${news.mover} went ${cellSquare(news.from)} → ${cellSquare(news.to)} and cut down the ${news.victim}.`
        : `${news.mover} went ${cellSquare(news.from)} → ${cellSquare(news.to)}.`

  return speechPrompt(scene, speakers, REACTION_BRIEF[flavour], occasion)
}

/** Pull the array of lines out of whatever wrapping the model put around it. */
export function parseLines(raw: string, expected: number): string[] | null {
  // A model that thinks out loud can put brackets in its thinking too, so the
  // deliberation goes before the array is looked for.
  const text = stripThinking(raw)
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end <= start) return null
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1))
    if (!Array.isArray(parsed)) return null
    const lines = parsed.filter(
      (line): line is string => typeof line === 'string' && line.trim().length > 0,
    )
    return lines.length ? lines.slice(0, expected) : null
  } catch {
    return null
  }
}
