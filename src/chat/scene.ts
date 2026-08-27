import type { GameState } from '@/game/types'
import type { Lang } from '@/i18n'

/**
 * What every prompt has to say before it says anything else: what this game is,
 * what its name means, and how the score stands.
 *
 * It lived twice — once in the prompt a single piece answers from, once in the
 * one a whole quarrel is written from — in two wordings that had already begun
 * to drift. One board, one description of it.
 */

/**
 * What the dark side calls a maeth: the word two gangs use for a meeting
 * arranged behind the garages, in whatever language the reply is written in.
 * Handed over ready-made because a model asked for "the crudest street word"
 * in a language it is only visiting tends to reach for something stilted.
 */
export const GANG_WORD: Record<Lang, string> = {
  ru: 'стрелка, замес, разборка',
  en: 'a rumble, a turf meet, a scrap behind the garages',
  fr: 'une baston, un règlement de comptes',
  de: 'eine Abreibung, eine Abrechnung hinterm Hof',
  pt: 'um acerto de contas, um rolo',
  es: 'un ajuste de cuentas, una bronca',
  it: 'un regolamento di conti, una rissa',
}

/**
 * And what the free peoples call it: a skirmish — the short, proper word for a
 * fight between a handful, which is what the Sindarin means in the first place.
 */
export const FAIR_WORD: Record<Lang, string> = {
  ru: 'короткая стычка, схватка',
  en: 'a skirmish, a brief passage of arms',
  fr: 'une escarmouche',
  de: 'ein Scharmützel',
  pt: 'uma escaramuça',
  es: 'una escaramuza',
  it: 'una scaramuccia',
}

export const LANG_NAME: Record<Lang, string> = {
  ru: 'Russian',
  en: 'English',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  es: 'Spanish',
  it: 'Italian',
}

/**
 * The last thing the piece reads, in the language it has to answer in.
 *
 * The rest of the prompt is English — it is written for the model, not for the
 * player — and a small model asked in one language to answer in another tends
 * to drift into fluent nothing. The instruction that matters most therefore
 * comes last and comes in the target language, which is the one thing these
 * models reliably take a register from.
 */
export const ANSWER_IN: Record<Lang, string> = {
  ru: 'Отвечай по-русски: одна короткая фраза, не длиннее двенадцати слов, от первого лица и в характере. Говори о том, что происходит на доске прямо сейчас, а не вообще.',
  en: 'Answer in English: one short sentence, twelve words at most, first person, in character. Speak about what is happening on the board right now, not in general.',
  fr: "Réponds en français : une phrase courte, douze mots au plus, à la première personne, dans ton rôle. Parle de ce qui se passe sur le plateau maintenant, pas en général.",
  de: 'Antworte auf Deutsch: ein kurzer Satz, höchstens zwölf Wörter, in der Ich-Form und in deiner Rolle. Sprich über das, was gerade auf dem Brett geschieht, nicht allgemein.',
  pt: 'Responde em português: uma frase curta, no máximo doze palavras, na primeira pessoa e em personagem. Fala do que está a acontecer no tabuleiro agora, não em geral.',
  es: 'Responde en español: una frase corta, doce palabras como máximo, en primera persona y en personaje. Habla de lo que ocurre en el tablero ahora, no en general.',
  it: 'Rispondi in italiano: una frase breve, al massimo dodici parole, in prima persona e nel personaggio. Parla di ciò che accade sulla scacchiera adesso, non in generale.',
}

/** The game itself, in one breath. */
export const WHAT_MAETH_IS =
  'This is "Maeth", a 4x4 game in the spirit of chess played out in Middle-earth. Sixteen pieces were drawn blindly out of one deck, four a side. Each piece moves only ONCE in the whole battle, and whoever captures more wins.'

/** The name, and who calls it what. */
export function whatMaethMeans(lang: Lang): string {
  return `WHAT MAETH MEANS: in the Grey-elven tongue maeth is a fight — not dagor, a great battle of hosts, but a short sharp scrap between a handful of warriors. That is exactly what this is. Say so if you are asked — but in YOUR OWN register, never in a scholar's: everything that came out of the dark — orcs, the wraith, the demon, the spider — calls it what two gangs call a meeting arranged behind the garages — in this language that is: ${GANG_WORD[lang]} — and never a polite word; the free peoples — elves, men, dwarves, hobbits, ents, the wizard — translate it properly, as a short skirmish: ${FAIR_WORD[lang]}. An elf that hears the gutter word used for it corrects the speaker coldly: that is a word for orcs. A hobbit still thinks of it as a dreadful business, and only the wizard would bother with the etymology.`
}

/** How the score stands, and the rule that keeps the model honest about it. */
export function capturesLine(state: GameState): string {
  return `Pieces captured so far — white took ${state.captures.white}, black took ${state.captures.black}. Never invent a piece or a square that is not in the lists above: everyone missing from them has fallen, and the log says to whom.`
}
